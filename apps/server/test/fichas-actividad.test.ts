import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnexoDTO, AnexoPendienteDTO, FichaActividadDTO, TipoActividadDTO } from '@scouttracker/shared';
import type { Content } from 'pdfmake/interfaces';
import { definicionPdf, generarPdfFicha } from '../src/servicios/pdf-ficha';
import { crearEntorno, escenarioBase, usuarioCon, type Cliente, type Entorno, type Escenario } from './ayudas';

let e: Entorno;
let esc: Escenario;
let tipos: Record<string, string>;
let categoria: string;
beforeEach(async () => {
  e = await crearEntorno();
  esc = await escenarioBase(e);
  const lista: TipoActividadDTO[] = (await esc.admin.get(`/grupos/${esc.grupoId}/tipos-actividad`)).json();
  tipos = Object.fromEntries(lista.map((t) => [t.nombre, t.id]));
  categoria = (await esc.admin.post(`/ramas/${esc.caminantes}/catalogos`, { catalogo: 'categoriaAnexo', nombre: 'Juego activo' })).json().id;
});
afterEach(async () => {
  await e.cerrar();
});

// PNG de 1×1 válido, para el logo de portada.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const ok = async <T>(r: Promise<{ statusCode: number; body: string; json(): unknown }>, estado = 200): Promise<T> => {
  const res = await r;
  if (res.statusCode !== estado) throw new Error(`${res.statusCode}: ${res.body}`);
  return res.json() as T;
};

const crearActividad = (extra: Record<string, unknown> = {}, cliente: Cliente = esc.admin) =>
  ok<{ id: string }>(
    cliente.post('/actividades', {
      grupoId: esc.grupoId,
      tipoId: tipos['Reunión de sábado'],
      nombre: 'Actividad Posta',
      inicio: '2026-03-14T17:00:00Z',
      fin: '2026-03-14T21:00:00Z',
      lugar: 'Grupo Scout General Paz',
      alcance: 'rama',
      ramaId: esc.caminantes,
      ...extra,
    }),
    201,
  );

const crearFicha = async (actividadId: string, cliente: Cliente = esc.admin, cuerpo: unknown = {}) =>
  ok<FichaActividadDTO>(cliente.post(`/actividades/${actividadId}/ficha-actividad`, cuerpo), 201);

const agregarAnexo = async (fichaId: string, asignadoA: string | null = null, cliente: Cliente = esc.admin) =>
  ok<FichaActividadDTO>(cliente.post(`/fichas-actividad/${fichaId}/anexos`, { asignadoA }), 201);

const completarAnexo = async (anexo: AnexoDTO, datos: Record<string, unknown> = {}, cliente: Cliente = esc.admin) => {
  await ok(cliente.patch(`/anexos/${anexo.id}`, { titulo: `Dinámica ${anexo.numero}`, categoriaId: categoria, desarrollo: 'Se juega en ronda.', ...datos }));
  return ok<AnexoDTO>(cliente.post(`/anexos/${anexo.id}/completo`, { completo: true }));
};

const idDe = async (cliente: Cliente) => (await ok<{ usuario: { id: string } }>(cliente.get('/yo'))).usuario.id;

/** Todo el texto de la definición del PDF, en orden, para inspeccionar su estructura. */
function textoDe(c: unknown): string[] {
  if (typeof c === 'string') return [c];
  if (Array.isArray(c)) return c.flatMap(textoDe);
  if (c && typeof c === 'object') {
    const o = c as Record<string, unknown>;
    return [o.text, o.stack, o.ul, o.ol, (o.table as { body?: unknown } | undefined)?.body].flatMap((x) => (x === undefined ? [] : textoDe(x)));
  }
  return [];
}
const textoPdf = (ficha: FichaActividadDTO, borrador: boolean) => textoDe(definicionPdf(ficha, { borrador, logo: null }).content as Content).join('');

describe('RF-088 cabecera de la rama', () => {
  it('el admin de grupo la configura y una ficha nueva la toma sola; un educador no la puede cambiar', async () => {
    await ok(
      esc.admin.put(`/ramas/${esc.caminantes}/cabecera-ficha`, {
        nombreGrupo: 'Grupo Scout General Paz',
        nombreComunidad: 'Comunidad Caminantes Posta Antártida Argentina',
        educadores: [{ nombre: 'Marta Cáceres', cargo: 'Subjefe de rama', formacion: '' }],
      }),
    );
    const logo = await esc.admin.subir(`/ramas/${esc.caminantes}/cabecera-ficha/logo`, 'logo.png', PNG, 'image/png');
    expect(logo.statusCode).toBe(200);
    const a = await crearActividad();
    const f = await crearFicha(a.id);
    expect(f.cabecera).toMatchObject({
      nombreGrupo: 'Grupo Scout General Paz',
      nombreComunidad: 'Comunidad Caminantes Posta Antártida Argentina',
      logo: logo.json().logo,
      educadores: [{ nombre: 'Marta Cáceres', cargo: 'Subjefe de rama', formacion: '' }],
    });
    expect((await esc.admin.get(`/logos/${logo.json().logo}`)).statusCode).toBe(200);

    const educador = await usuarioCon(e, esc, 'edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    expect((await educador.put(`/ramas/${esc.caminantes}/cabecera-ficha`, { nombreGrupo: 'X', nombreComunidad: 'Y', educadores: [] })).statusCode).toBe(403);
  });

  it('sin configurar usa el nombre del grupo y la comunidad de la rama', async () => {
    const f = await crearFicha((await crearActividad()).id);
    expect(f.cabecera).toMatchObject({ nombreGrupo: 'Grupo Scout General Paz', nombreComunidad: 'Posta Antártida Argentina', logo: null, educadores: [] });
  });
});

describe('RF-068 asociar la ficha a la actividad', () => {
  it('toma la fecha y el lugar de la actividad, y una actividad tiene una sola ficha', async () => {
    const a = await crearActividad();
    const f = await crearFicha(a.id);
    expect(f.actividad).toMatchObject({ id: a.id, inicio: '2026-03-14T17:00:00.000Z', lugar: 'Grupo Scout General Paz' });
    expect(f.estado).toBe('enCarga');
    expect((await esc.admin.post(`/actividades/${a.id}/ficha-actividad`, {})).statusCode).toBe(409);
    expect((await ok<FichaActividadDTO>(esc.admin.get(`/actividades/${a.id}/ficha-actividad`))).id).toBe(f.id);
    // Si cambia el lugar de la actividad, la ficha lo sigue.
    await ok(esc.admin.patch(`/actividades/${a.id}`, { lugar: 'Parque Sarmiento' }));
    expect((await ok<FichaActividadDTO>(esc.admin.get(`/fichas-actividad/${f.id}`))).actividad.lugar).toBe('Parque Sarmiento');
  });

  it('una actividad de grupo pide la rama; sin ficha la consulta responde 404', async () => {
    const a = await crearActividad({ alcance: 'grupo', ramaId: null });
    expect((await esc.admin.get(`/actividades/${a.id}/ficha-actividad`)).statusCode).toBe(404);
    expect((await esc.admin.post(`/actividades/${a.id}/ficha-actividad`, {})).statusCode).toBe(400);
    const f = await crearFicha(a.id, esc.admin, { ramaId: esc.caminantes });
    expect(f.ramaId).toBe(esc.caminantes);
  });

  it('quien no tiene acceso a la rama no ve la ficha ni puede crearla', async () => {
    const a = await crearActividad();
    const f = await crearFicha(a.id);
    const otro = await usuarioCon(e, esc, 'unidad@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.unidad });
    expect((await otro.get(`/fichas-actividad/${f.id}`)).statusCode).toBe(403);
    const lector = await usuarioCon(e, esc, 'lector@scout.test', 'Solo lectura', { alcance: 'rama', ramaId: esc.caminantes });
    const b = await crearActividad({ nombre: 'Otra' });
    expect((await lector.post(`/actividades/${b.id}/ficha-actividad`, {})).statusCode).toBe(403);
    expect((await lector.get(`/fichas-actividad/${f.id}`)).statusCode).toBe(200);
    expect((await lector.patch(`/fichas-actividad/${f.id}`, { diagnostico: 'x' })).statusCode).toBe(403);
  });
});

describe('RF-089 diagnóstico precargado', () => {
  it('la primera ficha de la rama arranca vacía; la siguiente copia el diagnóstico sin atarse a la anterior', async () => {
    const f1 = await crearFicha((await crearActividad()).id);
    expect(f1.diagnostico).toBe('');
    await ok(esc.admin.patch(`/fichas-actividad/${f1.id}`, { diagnostico: 'La comunidad está compuesta por 25 jóvenes.' }));
    e.reloj.ahora = new Date('2026-10-24T16:00:00Z');
    const f2 = await crearFicha((await crearActividad({ nombre: 'Agosto', inicio: '2026-08-08T17:00:00Z', fin: '2026-08-08T21:00:00Z' })).id);
    expect(f2.diagnostico).toBe('La comunidad está compuesta por 25 jóvenes.');
    await ok(esc.admin.patch(`/fichas-actividad/${f2.id}`, { diagnostico: 'Ahora son 27.' }));
    expect((await ok<FichaActividadDTO>(esc.admin.get(`/fichas-actividad/${f1.id}`))).diagnostico).toBe('La comunidad está compuesta por 25 jóvenes.');
  });
});

describe('RF-090 a RF-094 textos, áreas y grilla', () => {
  it('guarda los textos y la grilla ordenada por hora, con responsables de la rama, "Todos" o a mano', async () => {
    const brisa = await usuarioCon(e, esc, 'brisa@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const brisaId = await idDe(brisa);
    const f = await crearFicha((await crearActividad()).id);
    await agregarAnexo(f.id);
    const r = await ok<FichaActividadDTO>(
      esc.admin.patch(`/fichas-actividad/${f.id}`, {
        porQue: 'Porque prima la necesidad del beneficiario.',
        objetivosEducativos: ['Fortalecer los vínculos', 'Trabajo en equipos'],
        areas: [
          { area: 'sociabilidad', descripcion: 'Contacto con el alrededor.' },
          { area: 'corporalidad', descripcion: 'Contacto con la naturaleza.' },
        ],
        grilla: [
          { hora: '16:00', nombre: 'Juego de construcción', responsable: { tipo: 'texto', texto: 'Nehuen' }, observaciones: '', anexo: null },
          { hora: '14:30', nombre: 'Juego de integración', responsable: { tipo: 'usuarios', ids: [brisaId] }, observaciones: '', anexo: 1 },
          { hora: '14:00', nombre: 'Fibo', responsable: { tipo: 'todos' }, observaciones: '', anexo: null },
        ],
      }),
    );
    expect(r.grilla.map((g) => g.hora)).toEqual(['14:00', '14:30', '16:00']);
    expect(r.objetivosEducativos).toHaveLength(2);
    const texto = textoPdf(r, true);
    expect(texto).toContain('Nehuen');
    expect(texto).toContain('brisa');
    expect(texto.indexOf('1- Corporalidad')).toBeLessThan(texto.indexOf('2- Sociabilidad'));

    // El anexo de la grilla tiene que existir; el responsable, trabajar en la rama.
    expect((await esc.admin.patch(`/fichas-actividad/${f.id}`, { grilla: [{ hora: '15:00', nombre: 'X', responsable: null, observaciones: '', anexo: 2 }] })).statusCode).toBe(400);
    const otro = await usuarioCon(e, esc, 'unidad@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.unidad });
    const grillaOtro = [{ hora: '15:00', nombre: 'X', responsable: { tipo: 'usuarios', ids: [await idDe(otro)] }, observaciones: '', anexo: null }];
    expect((await esc.admin.patch(`/fichas-actividad/${f.id}`, { grilla: grillaOtro })).statusCode).toBe(400);
    expect((await esc.admin.patch(`/fichas-actividad/${f.id}`, { grilla: [{ hora: '25:00', nombre: 'X', responsable: null, observaciones: '', anexo: null }] })).statusCode).toBe(400);
  });
});

describe('RF-095 a RF-097 anexos', () => {
  it('el asignado lo ve entre sus pendientes y lo completa; otro sin permiso de editar no puede', async () => {
    const edu = await usuarioCon(e, esc, 'edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const lector = await usuarioCon(e, esc, 'lector@scout.test', 'Solo lectura', { alcance: 'rama', ramaId: esc.caminantes });
    const f = await crearFicha((await crearActividad()).id);
    await agregarAnexo(f.id);
    const conAnexos = await agregarAnexo(f.id, await idDe(lector));
    const anexo2 = conAnexos.anexos.find((a) => a.numero === 2)!;

    // El anexo 2 está asignado al usuario de solo lectura: lo ve en sus pendientes y lo puede completar.
    const pendientes = await ok<AnexoPendienteDTO[]>(lector.get('/yo/anexos-pendientes'));
    expect(pendientes).toEqual([expect.objectContaining({ id: anexo2.id, numero: 2, fichaActividadId: f.id, actividadNombre: 'Actividad Posta' })]);
    expect((await lector.patch(`/anexos/${anexo2.id}`, { titulo: 'Observa tu alrededor' })).statusCode).toBe(200);
    // El anexo 1 no es suyo y no tiene permiso de editar en Ficha de Actividad.
    const anexo1 = conAnexos.anexos.find((a) => a.numero === 1)!;
    expect((await lector.patch(`/anexos/${anexo1.id}`, { titulo: 'X' })).statusCode).toBe(403);
    // Reasignar requiere permiso de editar.
    expect((await lector.patch(`/anexos/${anexo2.id}`, { asignadoA: null })).statusCode).toBe(403);
    // Un educador con permiso de editar sí puede completar un anexo que no es suyo.
    expect((await edu.patch(`/anexos/${anexo1.id}`, { titulo: 'La telaraña del reencuentro' })).statusCode).toBe(200);

    // RF-096: sin categoría ni desarrollo no se marca completo.
    const r = await lector.post(`/anexos/${anexo2.id}/completo`, { completo: true });
    expect(r.statusCode).toBe(400);
    expect(Object.keys(r.json().campos)).toEqual(['categoriaId', 'desarrollo']);
    await completarAnexo(anexo2, {}, lector);
    expect(await ok<AnexoPendienteDTO[]>(lector.get('/yo/anexos-pendientes'))).toEqual([]);

    // Borrar un obligatorio lo vuelve incompleto.
    const vacio = await ok<AnexoDTO>(lector.patch(`/anexos/${anexo2.id}`, { desarrollo: ' ' }));
    expect(vacio.completo).toBe(false);
  });

  it('RF-097 guarda los materiales como ítems con cantidad, descripción y "por equipo"', async () => {
    const f = await crearFicha((await crearActividad()).id);
    const anexo = (await agregarAnexo(f.id)).anexos[0]!;
    const r = await ok<AnexoDTO>(
      esc.admin.patch(`/anexos/${anexo.id}`, {
        materiales: [
          { cantidad: 6, descripcion: 'palos de aproximadamente 1,5 m', porEquipo: true },
          { cantidad: null, descripcion: 'espacio de lanzamiento de 10–15 metros', porEquipo: false },
        ],
        educadores: 'Todos',
        edadDesde: 14,
        edadHasta: 18,
      }),
    );
    expect(r.materiales[0]).toEqual({ cantidad: 6, descripcion: 'palos de aproximadamente 1,5 m', porEquipo: true });
    expect(r.educadores).toBe('todos');
    expect((await esc.admin.patch(`/anexos/${anexo.id}`, { edadDesde: 20 })).statusCode).toBe(400);
    expect((await esc.admin.patch(`/anexos/${anexo.id}`, { educadores: 'muchos' })).statusCode).toBe(400);
    expect((await esc.admin.patch(`/anexos/${anexo.id}`, { categoriaId: esc.catalogo['Fuego'] })).statusCode).toBe(400);
  });

  it('no se borra un anexo que usa la grilla', async () => {
    const f = await crearFicha((await crearActividad()).id);
    const anexo = (await agregarAnexo(f.id)).anexos[0]!;
    await ok(esc.admin.patch(`/fichas-actividad/${f.id}`, { grilla: [{ hora: '14:30', nombre: 'Juego', responsable: null, observaciones: '', anexo: 1 }] }));
    expect((await esc.admin.delete(`/anexos/${anexo.id}`)).statusCode).toBe(409);
    await ok(esc.admin.patch(`/fichas-actividad/${f.id}`, { grilla: [] }));
    expect((await esc.admin.delete(`/anexos/${anexo.id}`)).statusCode).toBe(200);
  });
});

describe('RF-099 a RF-104 PDF', () => {
  async function fichaDelEjemplo() {
    await ok(esc.admin.put(`/ramas/${esc.caminantes}/cabecera-ficha`, { nombreGrupo: 'Grupo Scout General Paz', nombreComunidad: 'Comunidad Caminantes Posta Antártida Argentina', educadores: [] }));
    await esc.admin.post(`/ramas/${esc.caminantes}/equipos`, { nombre: 'Arturo Penny' }); // 5 equipos activos
    const brisa = await usuarioCon(e, esc, 'brisa@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const brisaId = await idDe(brisa);
    const f = await crearFicha((await crearActividad()).id);
    await agregarAnexo(f.id, brisaId);
    await agregarAnexo(f.id, brisaId);
    const conAnexos = await agregarAnexo(f.id, brisaId);
    const [a1, a2, a3] = conAnexos.anexos as [AnexoDTO, AnexoDTO, AnexoDTO];
    await completarAnexo(a1, { titulo: 'La telaraña del reencuentro', materiales: [{ cantidad: 1, descripcion: 'pelota o ovillo de lana', porEquipo: false }] });
    await completarAnexo(a3, { titulo: 'Juego de construcción', materiales: [{ cantidad: 6, descripcion: 'palos de 1,5 m', porEquipo: true }] });
    await ok(
      esc.admin.patch(`/fichas-actividad/${f.id}`, {
        diagnostico: 'La comunidad está compuesta por 25 jóvenes.',
        porQue: 'Por qué',
        aQueResponde: 'A qué',
        dondeNecesidad: 'Dónde',
        porQueLugar: 'Lugar',
        objetivosEducativos: ['Aplicar la Ley Scout'],
        objetivosDirigente: ['Valorizar el trabajo en equipo'],
        areas: [{ area: 'afectividad', descripcion: 'Valorando a cada persona.' }],
        grilla: [
          { hora: '14:00', nombre: 'Fibo', responsable: { tipo: 'todos' }, observaciones: '', anexo: null },
          { hora: '14:30', nombre: 'Juego de integración', responsable: { tipo: 'usuarios', ids: [brisaId] }, observaciones: '', anexo: 1 },
          { hora: '15:40', nombre: 'Juego activo', responsable: { tipo: 'texto', texto: 'Alejo' }, observaciones: '', anexo: 2 },
          { hora: '16:00', nombre: 'Juego de construcción', responsable: { tipo: 'texto', texto: 'Nehuen' }, observaciones: '', anexo: 3 },
        ],
      }),
    );
    return { fichaId: f.id, a2, brisa };
  }

  it('RF-100 el borrador marca BORRADOR en cada página y el anexo 2 pendiente con su asignado', async () => {
    const { fichaId } = await fichaDelEjemplo();
    const r = await ok<{ pdf: { final: boolean } }>(esc.admin.post(`/fichas-actividad/${fichaId}/pdf`, { final: false }));
    expect(r.pdf.final).toBe(false);
    const ficha = await ok<FichaActividadDTO>(esc.admin.get(`/fichas-actividad/${fichaId}`));
    const texto = textoPdf(ficha, true);
    expect(texto).toContain('Pendiente — asignado a brisa');
    const def = definicionPdf(ficha, { borrador: true, logo: null });
    expect(def.watermark).toMatchObject({ text: 'BORRADOR' });
    expect(typeof def.header).toBe('function');
    for (const pagina of [1, 2, 3]) expect(JSON.stringify((def.header as (p: number) => unknown)(pagina))).toContain('BORRADOR');
  });

  it('RF-101 la versión final se rechaza e indica el anexo 3 si está incompleto', async () => {
    const { fichaId, a2 } = await fichaDelEjemplo();
    let r = await esc.admin.post(`/fichas-actividad/${fichaId}/pdf`, { final: true });
    expect(r.statusCode).toBe(409);
    expect(r.json().faltantes).toEqual(['Falta completar el anexo 2']);
    await completarAnexo(a2);
    const a3 = (await ok<FichaActividadDTO>(esc.admin.get(`/fichas-actividad/${fichaId}`))).anexos[2]!;
    await ok(esc.admin.post(`/anexos/${a3.id}/completo`, { completo: false }));
    r = await esc.admin.post(`/fichas-actividad/${fichaId}/pdf`, { final: true });
    expect(r.json().faltantes).toEqual(['Falta completar el anexo 3']);
    await ok(esc.admin.post(`/anexos/${a3.id}/completo`, { completo: true }));
    expect((await esc.admin.post(`/fichas-actividad/${fichaId}/pdf`, { final: true })).statusCode).toBe(200);
    expect((await ok<FichaActividadDTO>(esc.admin.get(`/fichas-actividad/${fichaId}`))).estado).toBe('final');
  });

  it('RF-098, RF-099 y RF-102: secciones en el orden del ejemplo, materiales en la grilla y lista de compras', async () => {
    const { fichaId, a2 } = await fichaDelEjemplo();
    await completarAnexo(a2, { titulo: 'Observa tu alrededor' });
    const ficha = await ok<FichaActividadDTO>(esc.admin.get(`/fichas-actividad/${fichaId}`));
    const texto = textoPdf(ficha, false);
    const orden = [
      'Grupo Scout General Paz',
      'Comunidad Caminantes Posta Antártida Argentina',
      'Fecha: 14 de marzo del 2026',
      'Lugar: Grupo Scout General Paz',
      'Diagnóstico: La comunidad',
      'Por qué se debe realizar esta actividad',
      'A qué responde',
      'Dónde se detectó la necesidad',
      'Por qué se eligió este lugar',
      'Objetivos educativos:',
      'Objetivos que persigue el dirigente:',
      'Áreas a trabajar:',
      'Programación de actividades',
      'HORANOMBRE ACTIVIDADRESPONSABLEMATERIALESOBSERVACIONESANEXO',
      'ANEXO 1   La telaraña del reencuentro',
      'ANEXO 2   Observa tu alrededor',
      'ANEXO 3   Juego de construcción',
      'Lista de compras / logística',
    ];
    const posiciones = orden.map((t) => texto.indexOf(t));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
    // RF-098: la fila del anexo 1 lleva su material; Fibo, sin anexo, "-".
    expect(texto).toContain('14.30Juego de integraciónbrisa1 pelota o ovillo de lana-1');
    expect(texto).toContain('14.00FiboTodos---');
    // RF-099: 6 palos por equipo × 5 equipos.
    expect(texto).toContain('30palos de 1,5 m3');
    // RF-102: los tres anexos tienen la misma tabla.
    const def = definicionPdf(ficha, { borrador: false, logo: null });
    const tablas = (def.content as Content[]).filter((c) => JSON.stringify(c).includes('ANEXO '));
    expect(tablas).toHaveLength(3);
    expect(new Set(tablas.map((t) => JSON.stringify((t as { table: { widths: unknown; body: unknown[] } }).table.widths)))).toEqual(new Set(['["*","*","*"]']));
    expect(new Set(tablas.map((t) => (t as { table: { body: unknown[] } }).table.body.length))).toEqual(new Set([6]));
  });

  it('RF-103 la actividad conserva solo el último PDF; RF-104 se comparte con un enlace temporal', async () => {
    const { fichaId, a2 } = await fichaDelEjemplo();
    await completarAnexo(a2);
    await ok(esc.admin.post(`/fichas-actividad/${fichaId}/pdf`, { final: true }));
    const enlace1 = await ok<{ url: string; final: boolean }>(esc.admin.get(`/fichas-actividad/${fichaId}/pdf/enlace`));
    expect(enlace1.final).toBe(true);

    e.reloj.ahora = new Date('2026-10-24T15:30:00Z');
    const editada = await ok<FichaActividadDTO>(esc.admin.patch(`/fichas-actividad/${fichaId}`, { porQueLugar: 'Por los espacios verdes.' }));
    expect(editada.estado).toBe('enCarga');
    expect(editada.pdfDesactualizado).toBe(true);
    e.reloj.ahora = new Date('2026-10-24T15:40:00Z');
    await ok(esc.admin.post(`/fichas-actividad/${fichaId}/pdf`, { final: true }));

    const pdfs = await e.db.selectFrom('archivos').select('clave').where('mime', '=', 'application/pdf').execute();
    expect(pdfs).toHaveLength(1);
    expect(e.almacenamiento.archivos.size).toBe(1);
    const enlace = await ok<{ url: string }>(esc.admin.get(`/fichas-actividad/${fichaId}/pdf/enlace`));
    const archivo = await e.app.inject({ method: 'GET', url: enlace.url.replace('https://scout.test', '') });
    expect(archivo.headers['content-type']).toBe('application/pdf');
    expect(archivo.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(decodeURIComponent(String(archivo.headers['content-disposition']))).toContain('Ficha de Actividad - Actividad Posta.pdf');
  });

  it('RNF-004 genera un PDF de más de 10 páginas en menos de 20 s, en A4', async () => {
    const { fichaId } = await fichaDelEjemplo();
    const ficha = await ok<FichaActividadDTO>(esc.admin.get(`/fichas-actividad/${fichaId}`));
    const largo = 'Se divide al grupo en **cinco equipos**.\n- Primer paso\n- Segundo paso\n\n'.repeat(40);
    const grande: FichaActividadDTO = {
      ...ficha,
      anexos: Array.from({ length: 10 }, (_, i) => ({ ...ficha.anexos[0]!, numero: i + 1, completo: true, desarrollo: largo })),
    };
    const inicio = Date.now();
    const pdf = await generarPdfFicha(grande, { borrador: false, logo: { datos: PNG, mime: 'image/png' } });
    const ms = Date.now() - inicio;
    const paginas = pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
    expect(paginas).toBeGreaterThanOrEqual(10);
    expect(ms).toBeLessThan(20_000);
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
  });
});

describe('RF-105 reutilizar un anexo', () => {
  it('la copia es independiente del original', async () => {
    const marzo = await crearFicha((await crearActividad()).id);
    const original = (await agregarAnexo(marzo.id)).anexos[0]!;
    await completarAnexo(original, { titulo: 'La telaraña del reencuentro', duracionMinutos: 30 });
    const agosto = await crearFicha((await crearActividad({ nombre: 'Agosto', inicio: '2026-08-08T17:00:00Z', fin: '2026-08-08T21:00:00Z' })).id);

    const disponibles = await ok<{ id: string; titulo: string }[]>(esc.admin.get(`/fichas-actividad/${agosto.id}/anexos-reutilizables`));
    expect(disponibles.map((d) => d.titulo)).toEqual(['La telaraña del reencuentro']);
    const r = await ok<FichaActividadDTO>(esc.admin.post(`/fichas-actividad/${agosto.id}/anexos/copiar`, { anexoId: original.id }), 201);
    const copia = r.anexos[0]!;
    expect(copia).toMatchObject({ numero: 1, titulo: 'La telaraña del reencuentro', duracionMinutos: 30, completo: true });
    await ok(esc.admin.patch(`/anexos/${copia.id}`, { duracionMinutos: 45 }));
    const deMarzo = (await ok<FichaActividadDTO>(esc.admin.get(`/fichas-actividad/${marzo.id}`))).anexos[0]!;
    expect(deMarzo.duracionMinutos).toBe(30);
  });

  it('desde otra rama toma la categoría del mismo nombre y no ofrece fichas que el usuario no ve', async () => {
    const enUnidad = (await esc.admin.post(`/ramas/${esc.unidad}/catalogos`, { catalogo: 'categoriaAnexo', nombre: 'juego activo' })).json().id;
    const marzo = await crearFicha((await crearActividad()).id);
    const original = (await agregarAnexo(marzo.id)).anexos[0]!;
    await completarAnexo(original, { titulo: 'Observa tu alrededor' });
    const enOtraRama = await crearFicha((await crearActividad({ ramaId: esc.unidad, nombre: 'Unidad' })).id);
    const r = await ok<FichaActividadDTO>(esc.admin.post(`/fichas-actividad/${enOtraRama.id}/anexos/copiar`, { anexoId: original.id }), 201);
    expect(r.anexos[0]!.categoriaId).toBe(enUnidad);

    const deUnidad = await usuarioCon(e, esc, 'unidad@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.unidad });
    expect(await ok<unknown[]>(deUnidad.get(`/fichas-actividad/${enOtraRama.id}/anexos-reutilizables`))).toEqual([]);
    expect((await deUnidad.post(`/fichas-actividad/${enOtraRama.id}/anexos/copiar`, { anexoId: original.id })).statusCode).toBe(403);
  });
});
