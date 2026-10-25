import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearEntorno, escenarioBase, fichaValida, type Entorno, type Escenario } from './ayudas';

let e: Entorno;
let esc: Escenario;
beforeEach(async () => {
  e = await crearEntorno();
  esc = await escenarioBase(e);
});
afterEach(async () => {
  await e.cerrar();
});

// Datos ficticios con la forma de la planilla actual (sección 4: nunca datos reales en pruebas).
const ENCABEZADOS = [
  'N°', 'Apellido', 'Nombre', 'DNI', 'Fecha de Nacimiento', 'Edad', 'Categoría', 'Equipo', 'Elemento', 'Promesa', 'Etapa', 'Raid', 'C',
  'Guardián', 'TADA', 'Tel. Emergencia 1', 'Tel. Emergencia 2', 'Teléfono', 'Religión', 'Abril', 'Mayo', 'Distrito', 'Afiliación',
  'Se retira solo', 'Autorización retiro', 'DDJJ', 'Uso de imagen', 'Columna rara',
];

function fila(n: number, extra: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    'N°': String(n),
    Apellido: `Apellido${n}`,
    Nombre: `Nombre${n}`,
    DNI: `50.${String(100 + n).padStart(3, '0')}.337`,
    'Fecha de Nacimiento': '22/02/11',
    Edad: '15,6',
    Categoría: 'Protagonista',
    Equipo: 'Baden Powell',
    Elemento: 'fuego',
    Promesa: 's/pañuelo',
    Etapa: 'Ini',
    Raid: '1°R',
    C: '',
    Guardián: '',
    TADA: 'No',
    'Tel. Emergencia 1': '11 5925-4075',
    'Tel. Emergencia 2': '',
    Teléfono: '',
    Religión: '',
    Abril: 'Pagada',
    Mayo: 'Debe',
    Distrito: 'Exenta',
    Afiliación: '',
    'Se retira solo': 'Si',
    'Autorización retiro': '10/03/2026',
    DDJJ: 'Si',
    'Uso de imagen': 'No',
    'Columna rara': 'algo',
    ...extra,
  };
  return ENCABEZADOS.map((h) => base[h] ?? '');
}

const csv = (filas: string[][], sep = ';') =>
  Buffer.from([ENCABEZADOS, ...filas].map((f) => f.map((c) => (c.includes(sep) || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c)).join(sep)).join('\r\n'));

describe('RF-049 a RF-053 importar planilla', () => {
  it('40 filas: 2 incompletas, 1 duplicada, 1 educador; resumen con números de fila', async () => {
    const filas: string[][] = [];
    for (let i = 1; i <= 40; i++) filas.push(fila(i));
    // Fila 3 de datos (fila 4 de la planilla): solo el nombre.
    filas[2] = ENCABEZADOS.map((h) => (h === 'Nombre' ? 'Solo Nombre' : ''));
    // Cuota con "X": queda vacía e incompleta.
    filas[5] = fila(6, { Mayo: 'X' });
    // DNI repetido dentro del archivo.
    filas[9] = fila(10, { DNI: '50101337' });
    // Un educador no se importa.
    filas[20] = fila(21, { Categoría: 'Educador' });
    const r = await esc.admin.subir(`/ramas/${esc.caminantes}/importar`, 'Datos Posta.csv', csv(filas), 'text/csv');
    expect(r.statusCode).toBe(200);
    const res = r.json();
    expect(res).toMatchObject({ filasLeidas: 40, creadas: 38, incompletas: 2, adultos: [22] });
    expect(res.omitidas).toEqual([{ fila: 11, motivo: 'El DNI 50101337 se repite (fila 2)' }]);
    expect(res.detalleIncompletas.map((d: { fila: number }) => d.fila)).toEqual([4, 7]);
    expect(res.detalleIncompletas[1].motivos).toEqual(['Valor no reconocido en cuota mayo: "X"']);
    expect(res.columnasIgnoradas).toEqual(['Columna rara']);

    const snap = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json();
    expect(snap.fichas).toHaveLength(38);
    const f1 = snap.fichas.find((f: { apellido: string }) => f.apellido === 'Apellido1');
    // RF-051: normalización.
    expect(f1).toMatchObject({
      dni: '50101337',
      fechaNacimiento: '2011-02-22',
      telEmergencia1: '1159254075',
      equipoId: esc.equipos['Baden Powell'],
      elementoId: esc.catalogo['Fuego'],
      etapaId: esc.catalogo['Ini'],
      estado: 'activa',
      cuotas: { abril: 'pagada', mayo: 'adeudada', distrito: 'exenta' },
    });
    const docs = Object.fromEntries(f1.documentos.map((d: { tipo: string; estado: string; fechaEntrega: string }) => [d.tipo, [d.estado, d.fechaEntrega]]));
    expect(docs.retiroSolo).toEqual(['presentadoAutoriza', '2026-03-10']);
    expect(docs.ddjjSalud).toEqual(['presentado', '2026-10-24']);
    expect(docs.usoImagen).toEqual(['presentadoNoAutoriza', '2026-10-24']);
    const f6 = snap.fichas.find((f: { apellido: string }) => f.apellido === 'Apellido6');
    expect(f6.estado).toBe('incompleta');
    expect(f6.cuotas.mayo).toBeNull();
    const soloNombre = snap.fichas.find((f: { nombre: string }) => f.nombre === 'Solo Nombre');
    expect(soloNombre.estado).toBe('incompleta');
    expect(soloNombre.incompletaMotivos).toEqual(['Falta Apellido', 'Falta DNI', 'Falta Fecha de nacimiento', 'Falta Teléfono de emergencia']);
  });

  it('planilla con fila de títulos arriba, "Apellido, Nombre" en Nombre y totales al pie', async () => {
    // Misma estructura que la planilla real, con datos ficticios.
    const texto = [
      'c,,,,,,,,,,,,,,,Progresión,,,,Rol,,,,,,,,,,,,,,,,',
      'N°,Nombre,DNI,F. Nac,Tel Emergencias,Religión,Cat. de Miembro,Día cumple,Edad,Va,Aut. retirarse solo,PDF,2do tel emergencias,Tel propio,Equipo,Promesa,Etapa,Elemento,Raíd,Cordi,Guardián,Diario de Marcha,Rol en la comu,TADA puede?,TADA tiene?,TADA,Mística,Ingreso al movimiento,Distrito,Afiliación,Cuota social,Retirarse sol@?,DDJJ Salud Cargada,Uso de imagen,Logo elemento,Logo promesa',
      '1,"Prueba, Ana María",80.100.001,22/09/08,11 5000-0001,Católica,Protagonista,22,"18,1",Sí,Sí,,7700-0004,11 5000-2001,Tupac Amaru,c/promesa caminante,Descubrimiento,Fuego,1°R,C,Leyenda,,Enfermero,Sí,Sí,Tiene,,,,,,,Sí,,,',
      '2,"Simulado Garcia, Nahuel",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
      '3,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
      '4,"Subjefe, Rita",40.100.019,08/03/02,11 5000-0019,Católica,SJ de unidad,8,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
      '5,"Padre, Quique",30.100.018,03/04/84,11 5000-0018,Católica,Papá colaborador,3,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
      ',,,,11 5000-9999,,,,Beneficiarios:,15,15,,,,,,,,,,,,,,,,,,,,,,,,,',
      ',,,,,,,,,,,,,,,,,,,,,,TADA tiene?,2,,0,,,,,,,,,,',
      ',,,,,,,,,,,,,,Baden Powell,0,,,,,,,,,,,,,,,,SÍ,,,,',
      ',,,,Católica,36,,,,,,,,,,,,Ini,,0,,,,,,,,,,,,,,,,',
      ',,,,,,15,,7,,,,,,,,,,,,,,,,,,,,,,,,,,,',
    ].join('\r\n');
    const r = await esc.admin.subir(`/ramas/${esc.caminantes}/importar`, 'Datos Posta - Datos.csv', Buffer.from(texto), 'text/csv');
    expect(r.statusCode).toBe(200);
    const res = r.json();
    expect(res).toMatchObject({ filasLeidas: 4, creadas: 2, incompletas: 1, adultos: [6, 7], omitidas: [], columnasIgnoradas: [] });
    expect(res.detalleIncompletas).toEqual([{ fila: 4, motivos: ['Falta DNI', 'Falta Fecha de nacimiento', 'Falta Teléfono de emergencia'] }]);

    const fichas = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json().fichas;
    const ana = fichas.find((f: { apellido: string }) => f.apellido === 'Prueba');
    expect(ana).toMatchObject({
      nombre: 'Ana María',
      dni: '80100001',
      fechaNacimiento: '2008-09-22',
      telEmergencia1: '1150000001',
      telEmergencia2: '77000004',
      telPropio: '1150002001',
      equipoId: esc.equipos['Tupac Amaru'],
      etapaId: esc.catalogo['Descubrimiento'],
      guardianId: esc.catalogo['guardian:Leyenda'],
      cordi: 'coordinador',
      rolComunidad: 'Enfermero',
      tieneTada: true,
      estado: 'activa',
    });
    const docs = Object.fromEntries(ana.documentos.map((d: { tipo: string; estado: string }) => [d.tipo, d.estado]));
    expect(docs).toMatchObject({ retiroSolo: 'presentadoAutoriza', ddjjSalud: 'presentado' });
    expect(fichas.find((f: { apellido: string }) => f.apellido === 'Simulado Garcia')).toMatchObject({ nombre: 'Nahuel', estado: 'incompleta' });
  });

  it('omite DNI que ya existen en el grupo', async () => {
    await esc.admin.post(`/ramas/${esc.unidad}/fichas`, fichaValida({ dni: '50101337' }));
    const r = (await esc.admin.subir(`/ramas/${esc.caminantes}/importar`, 'p.csv', csv([fila(1), fila(2)]))).json();
    expect(r.creadas).toBe(1);
    expect(r.omitidas).toEqual([{ fila: 2, motivo: 'El DNI 50101337 ya existe en el grupo' }]);
  });

  it('valores de catálogo o equipo no reconocidos quedan vacíos y la ficha incompleta', async () => {
    const r = (await esc.admin.subir(`/ramas/${esc.caminantes}/importar`, 'p.csv', csv([fila(1, { Etapa: 'Avanzada', Equipo: 'Inexistente' })]))).json();
    expect(r.detalleIncompletas[0].motivos).toEqual(['Valor no reconocido en Equipo: "Inexistente"', 'Valor no reconocido en Etapa: "Avanzada"']);
    const f = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json().fichas[0];
    expect(f).toMatchObject({ estado: 'incompleta', etapaId: null, equipoId: null });
  });

  it('completar los datos pasa la ficha de incompleta a activa', async () => {
    await esc.admin.subir(`/ramas/${esc.caminantes}/importar`, 'p.csv', csv([fila(1, { 'Fecha de Nacimiento': '' })]));
    const f = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json().fichas[0];
    expect(f.estado).toBe('incompleta');
    const r = await esc.admin.patch(`/fichas/${f.id}`, { version: f.version, datos: { fechaNacimiento: '2011-02-22' } });
    expect(r.json()).toMatchObject({ estado: 'activa', incompletaMotivos: [] });
  });

  it('un valor no reconocido sigue pendiente hasta cargar ese campo o marcar la ficha como revisada', async () => {
    await esc.admin.subir(`/ramas/${esc.caminantes}/importar`, 'p.csv', csv([fila(1, { Mayo: 'X', Etapa: 'Rara' }), fila(2, { Mayo: 'X' })]));
    const [a, b] = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json().fichas;
    // Editar otro campo no la completa.
    let r = (await esc.admin.patch(`/fichas/${a.id}`, { version: a.version, datos: { telEmergencia1: '1199998888' } })).json();
    expect(r.estado).toBe('incompleta');
    expect(r.incompletaMotivos).toEqual(['Valor no reconocido en Etapa: "Rara"', 'Valor no reconocido en cuota mayo: "X"']);
    // Cargar la cuota resuelve ese motivo; queda el de la etapa.
    r = (await esc.admin.patch(`/fichas/${a.id}`, { version: r.version, cuotas: { mayo: 'pagada' } })).json();
    expect(r.incompletaMotivos).toEqual(['Valor no reconocido en Etapa: "Rara"']);
    r = (await esc.admin.patch(`/fichas/${a.id}`, { version: r.version, datos: { etapaId: esc.catalogo['Ini'] } })).json();
    expect(r).toMatchObject({ estado: 'activa', incompletaMotivos: [] });
    // Marcarla como revisada descarta los motivos sin cambiar datos.
    const rb = (await esc.admin.patch(`/fichas/${b.id}`, { version: b.version, revisada: true })).json();
    expect(rb).toMatchObject({ estado: 'activa', incompletaMotivos: [] });
    expect(rb.cuotas.mayo).toBeNull();
  });

  it('cordi marcado "C", TADA antes de los 16 y DNI con formato inválido', async () => {
    const r = (
      await esc.admin.subir(
        `/ramas/${esc.caminantes}/importar`,
        'p.csv',
        csv([fila(1, { C: 'C' }), fila(2, { C: 'C' }), fila(3, { TADA: 'Si' }), fila(4, { DNI: '12' })]),
      )
    ).json();
    expect(r.creadas).toBe(4);
    const motivos = Object.fromEntries(r.detalleIncompletas.map((d: { fila: number; motivos: string[] }) => [d.fila, d.motivos]));
    expect(motivos[3]).toEqual(['El equipo ya tiene coordinador']);
    expect(motivos[4]).toEqual(['Marcado con TADA pero tiene menos de 16 años']);
    // El valor sensible no se copia en el motivo.
    expect(motivos[5]).toEqual(['Falta DNI', 'Valor no reconocido en DNI']);
  });

  it('lee XLSX con fechas reales y CSV en Windows-1252 separado por comas', async () => {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Datos');
    hoja.addRow(['Apellido y Nombre', 'DNI', 'Fecha de nacimiento', 'Tel emergencia', 'Etapa']);
    hoja.addRow(['Álvarez, Gabriel', 50042384, new Date(Date.UTC(2011, 1, 22)), '11 5925-4075', 'Descubrimiento']);
    const xlsx = Buffer.from(await libro.xlsx.writeBuffer());
    const r1 = (await esc.admin.subir(`/ramas/${esc.caminantes}/importar`, 'datos.xlsx', xlsx)).json();
    expect(r1).toMatchObject({ creadas: 1, incompletas: 0 });

    const latin1 = Buffer.from('Apellido,Nombre,DNI,Fecha de nacimiento,Teléfono de emergencia\r\nNúñez,María José,40.111.222,08/03/08,1144445555\r\n', 'latin1');
    const r2 = (await esc.admin.subir(`/ramas/${esc.caminantes}/importar`, 'datos.csv', latin1)).json();
    expect(r2).toMatchObject({ creadas: 1, incompletas: 0 });
    const fichas = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json().fichas;
    expect(fichas.map((f: { apellido: string; nombre: string; fechaNacimiento: string }) => [f.apellido, f.nombre, f.fechaNacimiento])).toEqual([
      ['Álvarez', 'Gabriel', '2011-02-22'],
      ['Núñez', 'María José', '2008-03-08'],
    ]);
  });

  it('solo puede importar quien administra la rama', async () => {
    const { usuarioCon } = await import('./ayudas');
    const u = await usuarioCon(e, esc, 'edu@ejemplo.com', 'Jefe de rama', { alcance: 'rama', ramaId: esc.caminantes });
    expect((await u.subir(`/ramas/${esc.caminantes}/importar`, 'p.csv', csv([fila(1)]))).statusCode).toBe(403);
  });
});
