import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActividadDTO, RegistroActividad, SnapshotRama, TipoActividadDTO } from '@scouttracker/shared';
import { ejecutarTareas } from '../src/servicios/tareas';
import { crearEntorno, escenarioBase, fichaValida, login, usuarioCon, type Cliente, type Entorno, type Escenario } from './ayudas';

let e: Entorno;
let esc: Escenario;
let tipos: Record<string, string>;
beforeEach(async () => {
  e = await crearEntorno();
  esc = await escenarioBase(e);
  const lista: TipoActividadDTO[] = (await esc.admin.get(`/grupos/${esc.grupoId}/tipos-actividad`)).json();
  tipos = Object.fromEntries(lista.map((t) => [t.nombre, t.id]));
});
afterEach(async () => {
  await e.cerrar();
});

let dni = 40_000_000;
const crearFicha = async (extra: Record<string, unknown> = {}, rama = esc.caminantes) => {
  const r = await esc.admin.post(`/ramas/${rama}/fichas`, fichaValida({ dni: String(++dni), nombre: `N${dni}`, ...extra }));
  if (r.statusCode !== 201) throw new Error(r.body);
  return r.json() as { id: string };
};

const crearActividad = async (extra: Record<string, unknown> = {}, cliente: Cliente = esc.admin): Promise<ActividadDTO> => {
  const r = await cliente.post('/actividades', {
    grupoId: esc.grupoId,
    tipoId: tipos['Campamento'],
    nombre: 'Campamento de primavera',
    inicio: '2026-11-14T12:00:00Z',
    fin: '2026-11-16T19:00:00Z',
    lugar: 'Sierra de la Ventana',
    alcance: 'rama',
    ramaId: esc.caminantes,
    ...extra,
  });
  if (r.statusCode !== 201) throw new Error(r.body);
  return r.json();
};

let n = 0;
const registro = (actividadId: string, fichaId: string, campo: RegistroActividad['campo'], valor: unknown, anterior: unknown, en = '2026-10-24T14:00:00Z', extra = {}) => ({
  id: `r${++n}`,
  actividadId,
  fichaId,
  campo,
  valor,
  anterior,
  en,
  ...extra,
});

const sincronizar = async (cliente: Cliente, registros: unknown[]) => {
  const r = await cliente.post('/sincronizar', { registros });
  if (r.statusCode !== 200) throw new Error(r.body);
  return r.json().resultados as { id: string; estado: string; motivo?: string }[];
};

const snapshot = async (cliente: Cliente = esc.admin, rama = esc.caminantes): Promise<SnapshotRama> => (await cliente.get(`/ramas/${rama}/snapshot`)).json();

describe('RF-063 tipos de actividad', () => {
  it('el grupo arranca con tipos; Campamento requiere autorización y Reunión de sábado no', async () => {
    const lista: TipoActividadDTO[] = (await esc.admin.get(`/grupos/${esc.grupoId}/tipos-actividad`)).json();
    expect(lista.map((t) => [t.nombre, t.requiereAutorizacion])).toEqual([
      ['Reunión de sábado', false],
      ['Campamento', true],
      ['Raid', true],
      ['Acantonamiento', true],
    ]);
  });

  it('el admin de grupo crea y edita tipos; un educador no', async () => {
    const r = await esc.admin.post(`/grupos/${esc.grupoId}/tipos-actividad`, { nombre: 'Fogón', color: '#00676b', requiereAutorizacion: false });
    expect(r.statusCode).toBe(201);
    expect((await esc.admin.post(`/grupos/${esc.grupoId}/tipos-actividad`, { nombre: 'fogón', color: '#00676B', requiereAutorizacion: false })).statusCode).toBe(409);
    expect((await esc.admin.post(`/grupos/${esc.grupoId}/tipos-actividad`, { nombre: 'Otro', color: 'rojo', requiereAutorizacion: false })).statusCode).toBe(400);
    expect((await esc.admin.patch(`/tipos-actividad/${r.json().id}`, { requiereAutorizacion: true })).statusCode).toBe(200);
    const educador = await usuarioCon(e, esc, 'edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    expect((await educador.post(`/grupos/${esc.grupoId}/tipos-actividad`, { nombre: 'X', color: '#1F4D2B', requiereAutorizacion: false })).statusCode).toBe(403);
    // Los ve para poder crear actividades.
    expect((await educador.get(`/grupos/${esc.grupoId}/tipos-actividad`)).json()).toContainEqual(expect.objectContaining({ nombre: 'Fogón', color: '#00676B', requiereAutorizacion: true }));
  });
});

describe('RF-060 a RF-062 actividades', () => {
  it('un campamento del 14/03 al 16/03 de la rama aparece a los usuarios de la rama', async () => {
    const educador = await usuarioCon(e, esc, 'edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const a = await crearActividad({ inicio: '2027-03-14T12:00:00Z', fin: '2027-03-16T19:00:00Z' }, educador);
    const s = await snapshot(educador);
    expect(s.actividades.map((x) => x.id)).toEqual([a.id]);
    expect(s.tiposActividad.length).toBe(4);
    const otraRama = await usuarioCon(e, esc, 'unidad@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.unidad });
    expect((await snapshot(otraRama, esc.unidad)).actividades).toEqual([]);
    expect((await otraRama.get(`/actividades/${a.id}`)).statusCode).toBe(403);
  });

  it('rechaza una fecha de fin anterior a la de inicio, al crear y al editar', async () => {
    const r = await esc.admin.post('/actividades', {
      grupoId: esc.grupoId,
      tipoId: tipos['Campamento'],
      nombre: 'Al revés',
      inicio: '2026-11-16T12:00:00Z',
      fin: '2026-11-14T12:00:00Z',
      alcance: 'rama',
      ramaId: esc.caminantes,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.fin).toBeTruthy();
    const a = await crearActividad();
    expect((await esc.admin.patch(`/actividades/${a.id}`, { fin: '2026-11-13T00:00:00Z' })).statusCode).toBe(400);
  });

  it('el alcance de grupo solo lo crea quien tiene alcance de grupo', async () => {
    const educador = await usuarioCon(e, esc, 'edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const r = await educador.post('/actividades', {
      grupoId: esc.grupoId,
      tipoId: tipos['Reunión de sábado'],
      nombre: 'Reunión de grupo',
      inicio: '2026-11-07T17:00:00Z',
      fin: '2026-11-07T21:00:00Z',
      alcance: 'grupo',
    });
    expect(r.statusCode).toBe(403);
    const soloLectura = await usuarioCon(e, esc, 'lee@scout.test', 'Solo lectura', { alcance: 'rama', ramaId: esc.caminantes });
    expect((await soloLectura.post('/actividades', { grupoId: esc.grupoId, tipoId: tipos['Raid'], nombre: 'R', inicio: '2026-11-07T17:00:00Z', fin: '2026-11-07T21:00:00Z', alcance: 'rama', ramaId: esc.caminantes })).statusCode).toBe(403);
  });

  it('RF-061 editar cambia los datos; RF-062 cancelar la deja visible como cancelada y sin registros nuevos', async () => {
    const f = await crearFicha();
    const a = await crearActividad();
    expect((await esc.admin.patch(`/actividades/${a.id}`, { inicio: '2026-11-21T12:00:00Z', fin: '2026-11-23T19:00:00Z', lugar: 'Tandil' })).statusCode).toBe(200);
    expect((await esc.admin.post(`/actividades/${a.id}/cancelar`)).statusCode).toBe(200);
    const vista = (await esc.admin.get(`/actividades/${a.id}`)).json();
    expect(vista).toMatchObject({ lugar: 'Tandil', inicio: '2026-11-21T12:00:00.000Z', canceladaEn: e.reloj.ahora.toISOString() });
    expect((await snapshot()).actividades[0]!.canceladaEn).not.toBeNull();
    expect(await sincronizar(esc.admin, [registro(a.id, f.id, 'presente', true, false)])).toEqual([expect.objectContaining({ estado: 'rechazado', motivo: 'La actividad está cancelada' })]);
    expect((await esc.admin.patch(`/actividades/${a.id}`, { nombre: 'Otra' })).statusCode).toBe(400);
  });
});

describe('RF-064 inscripción', () => {
  it('una actividad de rama de 25 protagonistas arranca con 25 inscriptos "Sin respuesta"', async () => {
    for (let i = 0; i < 25; i++) await crearFicha();
    await crearFicha({}, esc.unidad);
    const archivada = await crearFicha();
    await esc.admin.post(`/fichas/${archivada.id}/archivar`);
    const a = await crearActividad();
    expect(a.inscripciones).toHaveLength(25);
    expect(a.inscripciones.every((i) => i.confirmacion === 'sinRespuesta' && !i.presente)).toBe(true);
  });

  it('una actividad de equipo inscribe solo al equipo; se pueden agregar y quitar inscriptos', async () => {
    const baden = await crearFicha({ equipoId: esc.equipos['Baden Powell'] });
    const frida = await crearFicha({ equipoId: esc.equipos['Frida Kahlo'] });
    const a = await crearActividad({ alcance: 'equipo', equipoId: esc.equipos['Baden Powell'], tipoId: tipos['Reunión de sábado'] });
    expect(a.inscripciones.map((i) => i.fichaId)).toEqual([baden.id]);
    expect((await esc.admin.put(`/actividades/${a.id}/inscripciones`, { agregar: [frida.id], quitar: [baden.id] })).statusCode).toBe(200);
    expect((await esc.admin.get(`/actividades/${a.id}`)).json().inscripciones.map((i: { fichaId: string }) => i.fichaId)).toEqual([frida.id]);
  });

  it('una actividad de grupo inscribe a todas las ramas y cada rama ve a los suyos', async () => {
    const cam = await crearFicha();
    const uni = await crearFicha({}, esc.unidad);
    const a = await crearActividad({ alcance: 'grupo', ramaId: null, tipoId: tipos['Acantonamiento'] });
    expect(a.inscripciones).toHaveLength(2);
    expect((await snapshot()).actividades[0]!.inscripciones.map((i) => i.fichaId)).toEqual([cam.id]);
    expect((await snapshot(esc.admin, esc.unidad)).actividades[0]!.inscripciones.map((i) => i.fichaId)).toEqual([uni.id]);
  });
});

describe('RN-19 visibilidad de actividades', () => {
  it('con alcance de equipo ve las de su equipo, su rama y su grupo, y no las de otros equipos', async () => {
    const deEquipo = await crearActividad({ alcance: 'equipo', equipoId: esc.equipos['Baden Powell'], nombre: 'Baden' });
    const deOtroEquipo = await crearActividad({ alcance: 'equipo', equipoId: esc.equipos['Frida Kahlo'], nombre: 'Frida' });
    const deRama = await crearActividad({ nombre: 'Rama' });
    const deGrupo = await crearActividad({ alcance: 'grupo', ramaId: null, nombre: 'Grupo' });
    const deOtraRama = await crearActividad({ ramaId: esc.unidad, nombre: 'Unidad' });
    const educador = await usuarioCon(e, esc, 'baden@scout.test', 'Educador', { alcance: 'equipo', ramaId: esc.caminantes, equipoId: esc.equipos['Baden Powell'] });
    const ids = (await snapshot(educador)).actividades.map((a) => a.id).sort();
    expect(ids).toEqual([deEquipo.id, deRama.id, deGrupo.id].sort());
    expect((await educador.get(`/actividades/${deOtroEquipo.id}`)).statusCode).toBe(403);
    expect((await educador.get(`/actividades/${deOtraRama.id}`)).statusCode).toBe(403);
  });
});

describe('RF-057 / RF-058 asistencia y sincronización', () => {
  it('20 registros hechos sin señal quedan en el servidor; 22 de 25 presentes', async () => {
    const fichas = [];
    for (let i = 0; i < 25; i++) fichas.push(await crearFicha());
    const a = await crearActividad({ tipoId: tipos['Reunión de sábado'] });
    const resultados = await sincronizar(esc.admin, fichas.slice(0, 20).map((f) => registro(a.id, f.id, 'presente', true, false)));
    expect(resultados.every((r) => r.estado === 'aplicado')).toBe(true);
    await sincronizar(esc.admin, fichas.slice(20, 22).map((f) => registro(a.id, f.id, 'presente', true, false)));
    const vista: ActividadDTO = (await esc.admin.get(`/actividades/${a.id}`)).json();
    expect(vista.inscripciones.filter((i) => i.presente)).toHaveLength(22);
    expect(vista.inscripciones.filter((i) => !i.presente)).toHaveLength(3);
  });

  it('reenviar el mismo lote (por ejemplo, tras cerrar la app sin respuesta) no cambia el resultado', async () => {
    const f = await crearFicha();
    const a = await crearActividad({ tipoId: tipos['Reunión de sábado'] });
    const lote = [registro(a.id, f.id, 'presente', true, false)];
    await sincronizar(esc.admin, lote);
    expect(await sincronizar(esc.admin, lote)).toEqual([expect.objectContaining({ estado: 'aplicado' })]);
    expect((await esc.admin.get(`/actividades/${a.id}`)).json().inscripciones[0].presente).toBe(true);
  });

  it('RN-08: marcado "Presente" por uno y "Ausente" por otro sin conexión, queda "Presente" en cualquier orden', async () => {
    const otro = await usuarioCon(e, esc, 'otro@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const [f1, f2] = [await crearFicha(), await crearFicha()];
    const a = await crearActividad({ tipoId: tipos['Reunión de sábado'] });
    // f1: primero sincroniza el que marcó presente.
    await sincronizar(esc.admin, [registro(a.id, f1.id, 'presente', true, false, '2026-10-24T14:00:00Z')]);
    expect(await sincronizar(otro, [registro(a.id, f1.id, 'presente', false, false, '2026-10-24T14:05:00Z')])).toEqual([expect.objectContaining({ estado: 'descartado' })]);
    // f2: primero sincroniza el que marcó ausente, aunque lo haya hecho más tarde.
    await sincronizar(otro, [registro(a.id, f2.id, 'presente', false, false, '2026-10-24T14:05:00Z')]);
    await sincronizar(esc.admin, [registro(a.id, f2.id, 'presente', true, false, '2026-10-24T14:00:00Z')]);
    const vista: ActividadDTO = (await esc.admin.get(`/actividades/${a.id}`)).json();
    expect(vista.inscripciones.map((i) => i.presente)).toEqual([true, true]);
  });

  it('un educador puede corregir su propia marca', async () => {
    const f = await crearFicha();
    const a = await crearActividad({ tipoId: tipos['Reunión de sábado'] });
    await sincronizar(esc.admin, [registro(a.id, f.id, 'presente', true, false)]);
    await sincronizar(esc.admin, [registro(a.id, f.id, 'presente', false, true, '2026-10-24T14:01:00Z')]);
    expect((await esc.admin.get(`/actividades/${a.id}`)).json().inscripciones[0].presente).toBe(false);
  });

  it('sin permiso de editar Actividades o sin inscripción, el registro se rechaza y los demás se aplican', async () => {
    const [f1, f2] = [await crearFicha(), await crearFicha()];
    const a = await crearActividad({ tipoId: tipos['Reunión de sábado'] });
    await esc.admin.put(`/actividades/${a.id}/inscripciones`, { quitar: [f2.id] });
    const soloLectura = await usuarioCon(e, esc, 'lee@scout.test', 'Solo lectura', { alcance: 'rama', ramaId: esc.caminantes });
    expect(await sincronizar(soloLectura, [registro(a.id, f1.id, 'presente', true, false)])).toEqual([expect.objectContaining({ estado: 'rechazado' })]);
    const r = await sincronizar(esc.admin, [registro(a.id, f2.id, 'presente', true, false), registro(a.id, f1.id, 'presente', true, false)]);
    expect(r.map((x) => x.estado)).toEqual(['rechazado', 'aplicado']);
  });

  it('una hora del dispositivo en el futuro no gana los conflictos para siempre', async () => {
    const f = await crearFicha();
    const a = await crearActividad({ tipoId: tipos['Reunión de sábado'] });
    await sincronizar(esc.admin, [registro(a.id, f.id, 'confirmacion', 'va', 'sinRespuesta', '2030-01-01T00:00:00Z')]);
    e.reloj.ahora = new Date(e.reloj.ahora.getTime() + 60_000);
    await sincronizar(esc.admin, [registro(a.id, f.id, 'confirmacion', 'noVa', 'sinRespuesta', '2026-10-24T15:00:30Z')]);
    expect((await esc.admin.get(`/actividades/${a.id}`)).json().inscripciones[0].confirmacion).toBe('noVa');
  });
});

describe('RF-065 confirmación y RF-067 columna "Va"', () => {
  it('"Va" cuenta en los confirmados y aparece para la próxima actividad', async () => {
    const [f1, f2] = [await crearFicha(), await crearFicha()];
    const a = await crearActividad();
    await sincronizar(esc.admin, [registro(a.id, f1.id, 'confirmacion', 'va', 'sinRespuesta'), registro(a.id, f2.id, 'confirmacion', 'noVa', 'sinRespuesta')]);
    const s = await snapshot();
    expect(s.actividades[0]!.inscripciones.map((i) => i.confirmacion)).toEqual(['va', 'noVa']);
  });

  it('en conflicto prevalece el último cambio por hora del dispositivo', async () => {
    const otro = await usuarioCon(e, esc, 'otro@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const f = await crearFicha();
    const a = await crearActividad();
    await sincronizar(esc.admin, [registro(a.id, f.id, 'confirmacion', 'va', 'sinRespuesta', '2026-10-24T14:10:00Z')]);
    expect(await sincronizar(otro, [registro(a.id, f.id, 'confirmacion', 'noVa', 'sinRespuesta', '2026-10-24T14:00:00Z')])).toEqual([expect.objectContaining({ estado: 'descartado' })]);
    expect(await sincronizar(otro, [registro(a.id, f.id, 'confirmacion', 'noVa', 'sinRespuesta', '2026-10-24T14:20:00Z')])).toEqual([expect.objectContaining({ estado: 'aplicado' })]);
  });
});

describe('RF-059 / RF-066 autorizaciones', () => {
  const PDF = Buffer.from('%PDF-1.4\n%prueba\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

  it('se registra "Presentada" con fecha; "Presente" sin autorización se guarda igual (RN-17)', async () => {
    const [f1, f2] = [await crearFicha(), await crearFicha()];
    const a = await crearActividad();
    expect(a.inscripciones[0]!.autorizacion).toEqual({ estado: 'noPresentada', fecha: null, archivo: null });
    const r = await sincronizar(esc.admin, [
      registro(a.id, f1.id, 'autorizacion', 'presentada', 'noPresentada', '2026-10-24T14:00:00Z', { fecha: '2026-10-20' }),
      registro(a.id, f2.id, 'autorizacion', 'presentada', 'noPresentada'),
      registro(a.id, f2.id, 'presente', true, false),
    ]);
    expect(r.every((x) => x.estado === 'aplicado')).toBe(true);
    await sincronizar(esc.admin, [registro(a.id, f2.id, 'autorizacion', 'noPresentada', 'presentada', '2026-10-24T14:30:00Z')]);
    const vista: ActividadDTO = (await esc.admin.get(`/actividades/${a.id}`)).json();
    expect(vista.inscripciones.map((i) => [i.autorizacion?.estado, i.autorizacion?.fecha, i.presente])).toEqual([
      ['presentada', '2026-10-20', false],
      ['noPresentada', null, true],
    ]);
  });

  it('una actividad que no pide autorización no la registra', async () => {
    const f = await crearFicha();
    const a = await crearActividad({ tipoId: tipos['Reunión de sábado'] });
    expect(await sincronizar(esc.admin, [registro(a.id, f.id, 'autorizacion', 'presentada', 'noPresentada')])).toEqual([expect.objectContaining({ estado: 'rechazado' })]);
  });

  it('sin el permiso de datos sensibles no se ve ni se registra la autorización', async () => {
    const f = await crearFicha();
    const a = await crearActividad();
    const rol = (await esc.admin.post(`/grupos/${esc.grupoId}/roles`, { nombre: 'Ayudante', permisos: { padron: ['ver'], actividades: ['ver', 'editar'] }, verSensibles: false })).json().id;
    esc.roles['Ayudante'] = rol;
    const ayudante = await usuarioCon(e, esc, 'ayu@scout.test', 'Ayudante', { alcance: 'rama', ramaId: esc.caminantes });
    const s = await snapshot(ayudante);
    expect(s.actividades[0]!.inscripciones[0]).not.toHaveProperty('autorizacion');
    expect(await sincronizar(ayudante, [registro(a.id, f.id, 'autorizacion', 'presentada', 'noPresentada')])).toEqual([expect.objectContaining({ estado: 'rechazado' })]);
    // La asistencia sí la puede registrar.
    expect(await sincronizar(ayudante, [registro(a.id, f.id, 'presente', true, false)])).toEqual([expect.objectContaining({ estado: 'aplicado' })]);
    expect((await ayudante.subir(`/actividades/${a.id}/inscripciones/${f.id}/autorizacion/archivo`, 'a.pdf', PDF)).statusCode).toBe(403);
  });

  it('el archivo se adjunta, se abre con enlace temporal auditado y se borra al suprimir la ficha', async () => {
    const f = await crearFicha();
    const a = await crearActividad();
    const r = await esc.admin.subir(`/actividades/${a.id}/inscripciones/${f.id}/autorizacion/archivo`, 'autorizacion.pdf', PDF);
    expect(r.statusCode).toBe(201);
    expect((await snapshot()).actividades[0]!.inscripciones[0]!.autorizacion?.archivo).toMatchObject({ nombre: 'autorizacion.pdf' });
    const enlace = await esc.admin.get(`/actividades/${a.id}/inscripciones/${f.id}/autorizacion/enlace`);
    expect(enlace.json().url).toContain('/archivos/');
    const auditoria = await e.db.selectFrom('auditoria').selectAll().where('accion', '=', 'apertura_documento').execute();
    expect(auditoria).toEqual([expect.objectContaining({ ficha_id: f.id, detalle: { tipo: 'autorizacionActividad', actividadId: a.id } })]);
    expect(e.almacenamiento.archivos.size).toBe(1);
    await esc.admin.delete(`/fichas/${f.id}`, { confirmar: true });
    expect(e.almacenamiento.archivos.size).toBe(0);
    expect(await e.db.selectFrom('inscripciones').selectAll().execute()).toEqual([]);
  });

  it('RN-12: al anonimizar se conserva la asistencia y se borra la autorización', async () => {
    const f = await crearFicha();
    const a = await crearActividad({ inicio: '2026-10-01T12:00:00Z', fin: '2026-10-03T19:00:00Z' });
    await esc.admin.subir(`/actividades/${a.id}/inscripciones/${f.id}/autorizacion/archivo`, 'autorizacion.pdf', PDF);
    await sincronizar(esc.admin, [registro(a.id, f.id, 'autorizacion', 'presentada', 'noPresentada'), registro(a.id, f.id, 'presente', true, false)]);
    await esc.admin.post(`/fichas/${f.id}/archivar`);
    e.reloj.ahora = new Date('2028-10-25T15:00:00Z');
    await ejecutarTareas(e.deps);
    const i = await e.db.selectFrom('inscripciones').selectAll().executeTakeFirstOrThrow();
    expect(i).toMatchObject({ presente: true, autorizacion: 'noPresentada', autorizacion_fecha: null, autorizacion_archivo_id: null });
    expect(e.almacenamiento.archivos.size).toBe(0);
  });
});

describe('RF-069 porcentaje de asistencia y RF-070 reporte', () => {
  it('inscripto en 10 actividades pasadas del año y presente en 8: 8 de 10', async () => {
    const f = await crearFicha();
    const otra = await crearFicha();
    for (let i = 0; i < 10; i++) {
      const dia = String(i + 1).padStart(2, '0');
      const a = await crearActividad({ tipoId: tipos['Reunión de sábado'], inicio: `2026-09-${dia}T17:00:00Z`, fin: `2026-09-${dia}T21:00:00Z` });
      if (i < 8) await sincronizar(esc.admin, [registro(a.id, f.id, 'presente', true, false)]);
    }
    // No cuentan: una del año anterior, una cancelada y una futura.
    await crearActividad({ inicio: '2025-09-01T17:00:00Z', fin: '2025-09-01T21:00:00Z' });
    const cancelada = await crearActividad({ inicio: '2026-09-20T17:00:00Z', fin: '2026-09-20T21:00:00Z' });
    await esc.admin.post(`/actividades/${cancelada.id}/cancelar`);
    await crearActividad();
    const s = await snapshot();
    expect(s.asistenciaAnio[f.id]).toEqual({ presentes: 8, total: 10 });
    expect(s.asistenciaAnio[otra.id]).toEqual({ presentes: 0, total: 10 });
  });

  it('el listado del año trae presentes y ausentes con sus nombres, aunque la ficha ya esté archivada', async () => {
    const [f1, f2] = [await crearFicha({ apellido: 'Gómez', nombre: 'Luz' }), await crearFicha({ apellido: 'Arias', nombre: 'Teo' })];
    const a = await crearActividad({ inicio: '2026-10-01T12:00:00Z', fin: '2026-10-03T19:00:00Z' });
    await sincronizar(esc.admin, [registro(a.id, f1.id, 'presente', true, false)]);
    await esc.admin.post(`/fichas/${f2.id}/archivar`);
    const lista: ActividadDTO[] = (await esc.admin.get(`/ramas/${esc.caminantes}/actividades?anio=2026`)).json();
    expect(lista[0]!.inscripciones.map((i) => [i.apellido, i.presente])).toEqual([
      ['Arias', false],
      ['Gómez', true],
    ]);
    // La vista sin conexión solo trae fichas vigentes.
    expect((await snapshot()).actividades[0]!.inscripciones.map((i) => i.apellido)).toEqual(['Gómez']);
  });
});

describe('RN-20 equipo eliminado', () => {
  it('sus actividades pasan a la rama y conservan la asistencia', async () => {
    const f = await crearFicha({ equipoId: esc.equipos['Lola Mora'] });
    const a = await crearActividad({ alcance: 'equipo', equipoId: esc.equipos['Lola Mora'], tipoId: tipos['Reunión de sábado'], inicio: '2026-10-01T12:00:00Z', fin: '2026-10-01T15:00:00Z' });
    await sincronizar(esc.admin, [registro(a.id, f.id, 'presente', true, false)]);
    await esc.admin.post(`/equipos/${esc.equipos['Lola Mora']}/desactivar`);
    e.reloj.ahora = new Date(e.reloj.ahora.getTime() + 91 * 24 * 3600 * 1000);
    expect((await ejecutarTareas(e.deps)).equipos).toBe(1);
    // La sesión del admin venció (RNF-015): vuelve a entrar.
    const admin = await login(e.app, 'mauro@scout.test');
    const vista = (await admin.get(`/actividades/${a.id}`)).json();
    expect(vista).toMatchObject({ alcance: 'rama', equipoId: null });
    expect(vista.inscripciones[0].presente).toBe(true);
  });
});
