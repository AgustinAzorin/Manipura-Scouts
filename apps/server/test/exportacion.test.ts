import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearEntorno, escenarioBase, fichaValida, usuarioCon, type Cliente, type Entorno, type Escenario } from './ayudas';

let e: Entorno;
let esc: Escenario;
beforeEach(async () => {
  e = await crearEntorno();
  esc = await escenarioBase(e);
});
afterEach(async () => {
  await e.cerrar();
});

/** Lee la hoja de la nómina como lista de objetos { encabezado: valor }. */
async function leerXlsx(cuerpo: Buffer): Promise<{ filas: Record<string, unknown>[]; encabezados: string[]; datos: Record<string, unknown> }> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(cuerpo as unknown as ArrayBuffer);
  const hoja = libro.getWorksheet('Nómina')!;
  const encabezados = (hoja.getRow(1).values as unknown[]).slice(1).map(String);
  const filas: Record<string, unknown>[] = [];
  hoja.eachRow((fila, n) => {
    if (n === 1) return;
    const valores = (fila.values as unknown[]).slice(1);
    filas.push(Object.fromEntries(encabezados.map((h, i) => [h, valores[i] ?? null])));
  });
  const datos: Record<string, unknown> = {};
  libro.getWorksheet('Datos de la exportación')!.eachRow((fila) => {
    const [, k, v] = fila.values as unknown[];
    datos[String(k)] = v;
  });
  return { filas, encabezados, datos };
}

async function exportar(c: Cliente, query = '') {
  const r = await c.get(`/ramas/${esc.caminantes}/exportacion${query}`);
  return r;
}

async function cargarFichas() {
  const crear = (extra: Record<string, unknown>, cuotas?: Record<string, string>) =>
    esc.admin.post(`/ramas/${esc.caminantes}/fichas`, { ...fichaValida(extra), ...(cuotas ? { cuotas } : {}) });
  await crear({ apellido: 'Álvarez', nombre: 'Gabriel', dni: '50042384', equipoId: esc.equipos['Tupac Amaru'], religionId: esc.catalogo['Católica'], etapaId: esc.catalogo['Descubrimiento'] }, { mayo: 'pagada' });
  await crear({ apellido: 'Benítez', nombre: 'Lola', dni: '50042385', equipoId: esc.equipos['Tupac Amaru'], etapaId: esc.catalogo['Ini'] });
  await crear({ apellido: 'Castro', nombre: 'Juana', dni: '50042386', equipoId: esc.equipos['Lola Mora'], etapaId: esc.catalogo['Descubrimiento'] });
}

describe('RF-115 exportar nómina a Excel', () => {
  it('exporta las fichas que cumplen los filtros, en el orden pedido, como XLSX', async () => {
    await cargarFichas();
    const filtros = encodeURIComponent(JSON.stringify({ equipo: [esc.equipos['Tupac Amaru']] }));
    const r = await exportar(esc.admin, `?filtros=${filtros}&orden=nombre:desc`);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('spreadsheetml');
    expect(r.headers['content-disposition']).toContain(encodeURIComponent('Nomina Caminantes 2026-10-24.xlsx'));
    const { filas, encabezados, datos } = await leerXlsx(r.rawPayload);
    expect(filas.map((f) => f['Nombre'])).toEqual(['Benítez, Lola', 'Álvarez, Gabriel']);
    expect(encabezados).toEqual(expect.arrayContaining(['Nombre', 'Equipo', 'Edad', 'DNI', 'Religión', 'Cuota Mayo', 'DDJJ de salud']));
    const alvarez = filas.find((f) => f['Nombre'] === 'Álvarez, Gabriel')!;
    expect(alvarez).toMatchObject({ Equipo: 'Tupac Amaru', DNI: '50042384', Religión: 'Católica', 'Cuota Mayo': 'Pagada', 'DDJJ de salud': 'No presentado' });
    expect(typeof alvarez['Edad']).toBe('number');
    expect(datos).toMatchObject({ Rama: 'Caminantes', Filtros: 'Equipo: Tupac Amaru', Fichas: 2, 'Exportado por': 'Mauro' });
  });

  it('la vista por equipo exporta solo ese equipo', async () => {
    await cargarFichas();
    const r = await exportar(esc.admin, `?equipo=${esc.equipos['Lola Mora']}`);
    const { filas, datos } = await leerXlsx(r.rawPayload);
    expect(filas.map((f) => f['Nombre'])).toEqual(['Castro, Juana']);
    expect(datos['Vista']).toBe('Equipo Lola Mora');
  });

  it('sin permiso de Exportación se rechaza', async () => {
    await cargarFichas();
    const educador = await usuarioCon(e, esc, 'educador@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    expect((await exportar(educador)).statusCode).toBe(403);
    const ajeno = await usuarioCon(e, esc, 'unidad@scout.test', 'Jefe de rama', { alcance: 'rama', ramaId: esc.unidad });
    expect((await exportar(ajeno)).statusCode).toBe(403);
  });

  it('con alcance de equipo exporta solo las fichas de su equipo', async () => {
    await cargarFichas();
    const jefe = await usuarioCon(e, esc, 'tupac@scout.test', 'Jefe de rama', { alcance: 'equipo', equipoId: esc.equipos['Tupac Amaru'] });
    const { filas } = await leerXlsx((await exportar(jefe)).rawPayload);
    expect(filas.map((f) => f['Nombre'])).toEqual(['Álvarez, Gabriel', 'Benítez, Lola']);
  });

  it('rechaza filtros mal formados', async () => {
    expect((await exportar(esc.admin, '?filtros=no-es-json')).statusCode).toBe(400);
    expect((await exportar(esc.admin, `?filtros=${encodeURIComponent(JSON.stringify({ tada: ['otro'] }))}`)).statusCode).toBe(400);
  });
});

describe('RF-116 columnas sensibles en la exportación', () => {
  it('sin el permiso de datos sensibles no hay DNI, teléfonos, religión ni DDJJ', async () => {
    await cargarFichas();
    const rol = (
      await esc.admin.post(`/grupos/${esc.grupoId}/roles`, {
        nombre: 'Exportador',
        permisos: { padron: ['ver'], cuotas: ['ver'], documentos: ['ver'], exportacion: ['ver'] },
        verSensibles: false,
      })
    ).json();
    esc.roles['Exportador'] = rol.id;
    const exportador = await usuarioCon(e, esc, 'exportador@scout.test', 'Exportador', { alcance: 'rama', ramaId: esc.caminantes });
    const r = await exportar(exportador);
    expect(r.statusCode).toBe(200);
    const { filas, encabezados } = await leerXlsx(r.rawPayload);
    expect(filas).toHaveLength(3);
    for (const sensible of ['DNI', 'Tel. emergencia 1', 'Tel. emergencia 2', 'Tel. propio', 'Religión', 'DDJJ de salud', 'Consentimiento de tratamiento de datos', 'Autorización de uso de imagen']) {
      expect(encabezados).not.toContain(sensible);
    }
    expect(encabezados).toContain('PDF adjunto general');
    expect(encabezados).toContain('Cuota Mayo');
    expect(JSON.stringify(filas)).not.toContain('50042384');
  });
});

describe('RNF-043 registro de exportaciones', () => {
  it('registra usuario, fecha y hora y filtros, sin datos de protagonistas', async () => {
    await cargarFichas();
    const filtros = encodeURIComponent(JSON.stringify({ etapa: [esc.catalogo['Descubrimiento']], edadDesde: 16 }));
    await exportar(esc.admin, `?filtros=${filtros}`);
    const aud = await e.db.selectFrom('auditoria').selectAll().where('accion', '=', 'exportacion').execute();
    expect(aud).toHaveLength(1);
    const mauro = await e.db.selectFrom('usuarios').select('id').where('email', '=', 'mauro@scout.test').executeTakeFirstOrThrow();
    expect(aud[0]).toMatchObject({ grupo_id: esc.grupoId, usuario_id: mauro.id, ficha_id: null });
    expect(aud[0]!.creado_en).toBeInstanceOf(Date);
    expect(aud[0]!.detalle).toMatchObject({ ramaId: esc.caminantes, filtros: ['Etapa: Descubrimiento', 'Edad desde 16'], fichas: 2 });
    for (const dato of ['Álvarez', 'Gabriel', '50042384']) expect(JSON.stringify(aud[0]!.detalle)).not.toContain(dato);
  });
});
