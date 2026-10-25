import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActividadDTO, AvisoManualDTO, FeriadoDTO, SnapshotRama, TipoActividadDTO } from '@scouttracker/shared';
import { procesarAvisos } from '../src/servicios/avisos';
import { ejecutarTareas } from '../src/servicios/tareas';
import { crearEntorno, escenarioBase, fichaValida, usuarioCon, type Cliente, type Entorno, type Escenario } from './ayudas';

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

/** Usuario con un celular registrado para push (RF-080). */
async function conCelular(email: string, rol: string, alcance: Parameters<typeof usuarioCon>[4], token = `ExponentPushToken[${email}]`): Promise<Cliente> {
  const c = await usuarioCon(e, esc, email, rol, alcance);
  expect((await c.post('/dispositivos', { token, plataforma: 'android' })).statusCode).toBe(200);
  return c;
}

const crearActividad = async (extra: Record<string, unknown> = {}, cliente: Cliente = esc.admin): Promise<ActividadDTO> => {
  const r = await cliente.post('/actividades', {
    grupoId: esc.grupoId,
    tipoId: tipos['Reunión de sábado'],
    nombre: 'Reunión',
    // Sábado 31/10/2026 de 14:00 a 18:00 (hora de Argentina).
    inicio: '2026-10-31T17:00:00Z',
    fin: '2026-10-31T21:00:00Z',
    lugar: 'Sede',
    alcance: 'rama',
    ramaId: esc.caminantes,
    ...extra,
  });
  if (r.statusCode !== 201) throw new Error(r.body);
  return r.json();
};

const irA = async (instante: string) => {
  e.reloj.ahora = new Date(instante);
  return procesarAvisos(e.deps);
};
const pushA = (email: string) => e.push.enviados.filter((m) => m.token === `ExponentPushToken[${email}]`);
const mailsA = (email: string) => e.mails.enviados.filter((m) => m.para === email && m.tipo === 'aviso');

describe('RF-078 / RN-16 avisos programados', () => {
  it('sábado 14:00 con avisos de 1 día y 1 hora: salen el viernes 14:00 y el sábado 13:00', async () => {
    await conCelular('edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const a = await crearActividad({ avisos: ['1d', '1h'] });
    expect(a.avisos).toEqual(['1h', '1d']);
    expect((await irA('2026-10-30T16:59:00Z')).actividades).toBe(0);
    expect((await irA('2026-10-30T17:00:00Z')).actividades).toBe(1);
    expect(pushA('edu@scout.test')).toEqual([expect.objectContaining({ titulo: 'Reunión', datos: { ruta: `/actividad/${a.id}` } })]);
    expect(pushA('edu@scout.test')[0]!.cuerpo).toContain('Empieza en 1 día');
    expect((await irA('2026-10-31T16:00:30Z')).actividades).toBe(1);
    expect(pushA('edu@scout.test')).toHaveLength(2);
    // No se repiten.
    expect((await irA('2026-10-31T16:05:00Z')).actividades).toBe(0);
  });

  it('un tercer aviso o uno repetido no se permiten', async () => {
    const base = { grupoId: esc.grupoId, tipoId: tipos['Raid'], nombre: 'R', inicio: '2026-11-07T12:00:00Z', fin: '2026-11-07T20:00:00Z', alcance: 'rama', ramaId: esc.caminantes };
    expect((await esc.admin.post('/actividades', { ...base, avisos: ['1d', '1h', '1w'] })).statusCode).toBe(400);
    expect((await esc.admin.post('/actividades', { ...base, avisos: ['1d', '1d'] })).statusCode).toBe(400);
    const a = await crearActividad({ avisos: ['1d'] });
    expect((await esc.admin.patch(`/actividades/${a.id}`, { avisos: ['1d', '1h', '0m'] })).statusCode).toBe(400);
  });

  it('un aviso cuyo momento ya pasó al programarlo no se envía; uno muy atrasado se omite', async () => {
    await conCelular('edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    // Faltan 3 días: el de 1 semana ya pasó.
    await crearActividad({ inicio: '2026-10-27T17:00:00Z', fin: '2026-10-27T21:00:00Z', avisos: ['1w', '1d'] });
    expect((await irA('2026-10-24T15:01:00Z')).actividades).toBe(0);
    // El servidor estuvo caído el día anterior: al volver, ese aviso ya no sirve.
    expect(await irA('2026-10-26T19:00:00Z')).toMatchObject({ actividades: 0, omitidos: 1 });
    expect(pushA('edu@scout.test')).toEqual([]);
  });
});

describe('RF-079 destinatarios y RF-080 a RF-082 envío', () => {
  it('a "rol Jefe de rama" solo le llega a ese rol dentro del alcance de la actividad', async () => {
    await conCelular('jefe@scout.test', 'Jefe de rama', { alcance: 'rama', ramaId: esc.caminantes });
    await conCelular('edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    await conCelular('jefeunidad@scout.test', 'Jefe de rama', { alcance: 'rama', ramaId: esc.unidad });
    await crearActividad({ avisos: ['1h'], destinoAvisos: { tipo: 'rol', id: esc.roles['Jefe de rama'] } });
    await irA('2026-10-31T16:00:00Z');
    expect(pushA('jefe@scout.test')).toHaveLength(1);
    expect(pushA('edu@scout.test')).toHaveLength(0);
    expect(pushA('jefeunidad@scout.test')).toHaveLength(0);
  });

  it('al alcance: los de la rama, sus equipos y el grupo; no otras ramas', async () => {
    await conCelular('baden@scout.test', 'Educador', { alcance: 'equipo', ramaId: esc.caminantes, equipoId: esc.equipos['Baden Powell'] });
    await conCelular('unidad@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.unidad });
    await crearActividad({ avisos: ['1h'] });
    await irA('2026-10-31T16:00:00Z');
    expect(pushA('baden@scout.test')).toHaveLength(1);
    expect(pushA('unidad@scout.test')).toHaveLength(0);
    // El admin de grupo la ve: le llega por mail aunque no tenga celular registrado.
    expect(mailsA('mauro@scout.test')).toHaveLength(1);
  });

  it('a 10 destinatarios les llega el mail; con el tope de RN-14 sale solo por push y queda registrado', async () => {
    const emails = Array.from({ length: 9 }, (_, i) => `edu${i}@scout.test`);
    for (const m of emails) await conCelular(m, 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    await crearActividad({ avisos: ['1h'] });
    await crearActividad({ avisos: ['1h'], nombre: 'Otra', inicio: '2026-11-07T17:00:00Z', fin: '2026-11-07T21:00:00Z' });
    await irA('2026-10-31T16:00:00Z');
    expect([...emails, 'mauro@scout.test'].every((m) => mailsA(m).length === 1)).toBe(true);
    // El 07/11 ya salieron 90 mails.
    await e.db.insertInto('mails').values(Array.from({ length: 90 }, () => ({ tipo: 'aviso', enviado: true, detalle: null, creado_en: '2026-11-07T12:00:00Z' }))).execute();
    const antes = e.mails.enviados.length;
    await irA('2026-11-07T16:00:00Z');
    expect(e.mails.enviados.length).toBe(antes);
    expect(pushA('edu0@scout.test')).toHaveLength(2);
    const omitidos = await e.db.selectFrom('mails').selectAll().where('enviado', '=', false).execute();
    expect(omitidos).toHaveLength(10);
    expect(omitidos[0]!.detalle).toBe('tope diario alcanzado');
  });

  it('un token de un celular sin la app se borra; al cerrar sesión el celular deja de recibir', async () => {
    const edu = await conCelular('edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    await conCelular('otro@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    e.push.invalidos.add('ExponentPushToken[otro@scout.test]');
    await crearActividad({ avisos: ['1h'] });
    await irA('2026-10-31T16:00:00Z');
    expect((await e.db.selectFrom('dispositivos').select('token').execute()).map((d) => d.token)).toEqual(['ExponentPushToken[edu@scout.test]']);
    await edu.post('/auth/logout');
    expect(await e.db.selectFrom('dispositivos').select('token').execute()).toEqual([]);
  });
});

describe('RF-083 / RN-15 aviso de cumpleaños', () => {
  it('a las 9:00 del 22/02 les llega a los educadores de su rama, una sola vez', async () => {
    await conCelular('edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    await conCelular('unidad@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.unidad });
    const f = (await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ fechaNacimiento: '2011-02-22', apellido: 'Paz', nombre: 'Ana' }))).json();
    const archivada = (await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ dni: '41000000', fechaNacimiento: '2011-02-22' }))).json();
    await esc.admin.post(`/fichas/${archivada.id}/archivar`);
    expect((await irA('2027-02-22T11:59:00Z')).cumpleanios).toBe(0); // 8:59 en Argentina
    expect((await irA('2027-02-22T12:00:00Z')).cumpleanios).toBe(1);
    expect(pushA('edu@scout.test')).toEqual([expect.objectContaining({ titulo: 'Cumpleaños de Paz, Ana', cuerpo: 'Hoy cumple 16 años.', datos: { ruta: `/ficha/${f.id}` } })]);
    expect(pushA('unidad@scout.test')).toEqual([]);
    // El admin de grupo no es educador de la rama.
    expect(mailsA('mauro@scout.test')).toEqual([]);
    expect((await irA('2027-02-22T15:00:00Z')).cumpleanios).toBe(0);
  });

  it('el 29/02 se avisa el 28/02 en años no bisiestos', async () => {
    await conCelular('edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ fechaNacimiento: '2012-02-29' }));
    expect((await irA('2027-02-28T12:30:00Z')).cumpleanios).toBe(1);
  });
});

describe('RF-084 preferencias', () => {
  it('sin el mail de cumpleaños no recibe el mail y sí el push', async () => {
    const edu = await conCelular('edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const p = (await edu.put('/yo/avisos', { tipo: 'cumpleanios', canal: 'mail', activo: false })).json();
    expect(p).toMatchObject({ cumpleanios: { push: true, mail: false }, actividades: { push: true, mail: true } });
    await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ fechaNacimiento: '2011-02-22' }));
    await irA('2027-02-22T12:00:00Z');
    expect(pushA('edu@scout.test')).toHaveLength(1);
    expect(mailsA('edu@scout.test')).toHaveLength(0);
  });

  it('un aviso manual "importante" llega aunque los manuales estén desactivados', async () => {
    const edu = await conCelular('edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    await edu.put('/yo/avisos', { tipo: 'manuales', canal: 'push', activo: false });
    const aviso = { titulo: 'Reunión de padres', texto: 'El sábado a las 10.', destino: { tipo: 'grupo' }, canales: ['push'] };
    await esc.admin.post(`/grupos/${esc.grupoId}/avisos`, aviso);
    expect(pushA('edu@scout.test')).toHaveLength(0);
    await esc.admin.post(`/grupos/${esc.grupoId}/avisos`, { ...aviso, importante: true });
    expect(pushA('edu@scout.test')).toHaveLength(1);
  });
});

describe('RF-061 / RF-062 / RF-085 cambios y cancelaciones', () => {
  it('mover un campamento del 14/03 al 21/03 avisa la fecha nueva y reprograma los avisos', async () => {
    await conCelular('edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const a = await crearActividad({ tipoId: tipos['Campamento'], nombre: 'Campamento', inicio: '2027-03-14T12:00:00Z', fin: '2027-03-16T19:00:00Z', avisos: ['1d'] });
    await esc.admin.patch(`/actividades/${a.id}`, { inicio: '2027-03-21T12:00:00Z', fin: '2027-03-23T19:00:00Z' });
    expect(pushA('edu@scout.test')).toEqual([expect.objectContaining({ titulo: 'Cambio en Campamento', cuerpo: expect.stringContaining('21/03/2027') })]);
    expect((await irA('2027-03-13T12:00:00Z')).actividades).toBe(0);
    expect((await irA('2027-03-20T12:00:00Z')).actividades).toBe(1);
    // Cambiar solo el nombre no avisa.
    await esc.admin.patch(`/actividades/${a.id}`, { nombre: 'Campamento de otoño' });
    expect(pushA('edu@scout.test')).toHaveLength(2);
  });

  it('cancelar anula los avisos pendientes y avisa la cancelación', async () => {
    await conCelular('edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const a = await crearActividad({ avisos: ['1h'] });
    await esc.admin.post(`/actividades/${a.id}/cancelar`);
    expect(pushA('edu@scout.test')).toEqual([expect.objectContaining({ titulo: 'Cancelada: Reunión' })]);
    expect((await irA('2026-10-31T16:00:00Z')).actividades).toBe(0);
  });

  it('una actividad sin avisos programados no avisa cambios ni cancelación', async () => {
    await conCelular('edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const a = await crearActividad();
    await esc.admin.patch(`/actividades/${a.id}`, { lugar: 'Plaza' });
    await esc.admin.post(`/actividades/${a.id}/cancelar`);
    expect(e.push.enviados).toEqual([]);
  });
});

describe('RF-086 / RF-087 avisos manuales', () => {
  it('a la rama Caminantes solo les llega a los usuarios con alcance sobre Caminantes', async () => {
    await conCelular('edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    await conCelular('baden@scout.test', 'Educador', { alcance: 'equipo', ramaId: esc.caminantes, equipoId: esc.equipos['Baden Powell'] });
    await conCelular('unidad@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.unidad });
    const r = await esc.admin.post(`/grupos/${esc.grupoId}/avisos`, { titulo: 'Fogón', texto: 'Traigan leña.', destino: { tipo: 'rama', id: esc.caminantes }, canales: ['push', 'mail'] });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ destino: 'Rama Caminantes', destinatarios: 2, remitente: 'Mauro' });
    expect(pushA('edu@scout.test')).toHaveLength(1);
    expect(pushA('baden@scout.test')).toHaveLength(1);
    expect(pushA('unidad@scout.test')).toHaveLength(0);
    expect(mailsA('edu@scout.test')).toHaveLength(1);
  });

  it('solo el admin de grupo envía; el historial muestra los 3 enviados', async () => {
    const edu = await usuarioCon(e, esc, 'edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const aviso = (n: number) => ({ titulo: `Aviso ${n}`, texto: 'Texto', destino: { tipo: 'grupo' }, canales: ['mail'] });
    expect((await edu.post(`/grupos/${esc.grupoId}/avisos`, aviso(0))).statusCode).toBe(403);
    for (const n of [1, 2, 3]) await esc.admin.post(`/grupos/${esc.grupoId}/avisos`, aviso(n));
    const historial: AvisoManualDTO[] = (await esc.admin.get(`/grupos/${esc.grupoId}/avisos`)).json();
    expect(historial.map((h) => h.titulo).sort()).toEqual(['Aviso 1', 'Aviso 2', 'Aviso 3']);
    expect(historial[0]).toMatchObject({ remitente: 'Mauro', destino: 'Todo el grupo', canales: ['mail'], destinatarios: 2 });
    expect((await edu.get(`/grupos/${esc.grupoId}/avisos`)).statusCode).toBe(403);
  });
});

describe('RF-075 / RF-076 feriados', () => {
  it('trae los feriados nacionales de la fuente pública y los muestra en el calendario', async () => {
    e.feriados.feriados[2026] = [{ fecha: '2026-05-25', nombre: 'Día de la Revolución de Mayo' }, { fecha: '2026-12-25', nombre: 'Navidad' }];
    expect((await ejecutarTareas(e.deps)).feriados).toEqual([2026]);
    const lista: FeriadoDTO[] = (await esc.admin.get(`/grupos/${esc.grupoId}/feriados?anio=2026`)).json();
    expect(lista).toContainEqual({ id: null, fecha: '2026-05-25', nombre: 'Día de la Revolución de Mayo', origen: 'nacional' });
    const s: SnapshotRama = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json();
    expect(s.feriados.map((f) => f.nombre)).toEqual(['Navidad']);
    // Si la fuente no responde, quedan los que había.
    e.feriados.disponible = false;
    // Pasó más de una semana: se vuelve a consultar.
    e.reloj.ahora = new Date('2026-11-01T15:00:00Z');
    await ejecutarTareas(e.deps);
    expect((await esc.admin.get(`/grupos/${esc.grupoId}/feriados?anio=2026`)).json()).toHaveLength(2);
  });

  it('el admin de grupo carga y borra feriados propios; los nacionales no se borran', async () => {
    const r = await esc.admin.post(`/grupos/${esc.grupoId}/feriados`, { fecha: '2026-11-20', nombre: 'Día de la Soberanía' });
    expect(r.statusCode).toBe(201);
    expect((await esc.admin.post(`/grupos/${esc.grupoId}/feriados`, { fecha: '2026-11-20', nombre: 'Día de la Soberanía' })).statusCode).toBe(409);
    const edu = await usuarioCon(e, esc, 'edu@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    expect((await edu.post(`/grupos/${esc.grupoId}/feriados`, { fecha: '2026-11-21', nombre: 'X' })).statusCode).toBe(403);
    expect((await edu.get(`/grupos/${esc.grupoId}/feriados?anio=2026`)).json()).toEqual([{ id: r.json().id, fecha: '2026-11-20', nombre: 'Día de la Soberanía', origen: 'manual' }]);
    expect((await esc.admin.delete(`/feriados/${r.json().id}`)).statusCode).toBe(200);
    e.feriados.feriados[2026] = [{ fecha: '2026-12-25', nombre: 'Navidad' }];
    await ejecutarTareas(e.deps);
    const nacional = await e.db.selectFrom('feriados').select('id').executeTakeFirstOrThrow();
    expect((await esc.admin.delete(`/feriados/${nacional.id}`)).statusCode).toBe(404);
  });
});

describe('RF-077 recordatorios personales', () => {
  it('un recordatorio de A no lo ve B', async () => {
    const a = await usuarioCon(e, esc, 'a@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const b = await usuarioCon(e, esc, 'b@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const r = await a.post('/recordatorios', { grupoId: esc.grupoId, fecha: '2026-11-02', hora: '18:30', titulo: 'Llamar a la sede' });
    expect(r.statusCode).toBe(201);
    expect((await a.get(`/ramas/${esc.caminantes}/snapshot`)).json().recordatorios).toEqual([{ id: r.json().id, fecha: '2026-11-02', hora: '18:30', titulo: 'Llamar a la sede' }]);
    expect((await b.get(`/ramas/${esc.caminantes}/snapshot`)).json().recordatorios).toEqual([]);
    expect((await b.get(`/recordatorios?grupoId=${esc.grupoId}&desde=2026-01-01&hasta=2026-12-31`)).json()).toEqual([]);
    expect((await b.delete(`/recordatorios/${r.json().id}`)).statusCode).toBe(404);
    expect((await a.delete(`/recordatorios/${r.json().id}`)).statusCode).toBe(200);
  });

  it('si otro usuario inicia sesión en el mismo celular, los avisos pasan a él', async () => {
    const a = await usuarioCon(e, esc, 'a@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const b = await usuarioCon(e, esc, 'b@scout.test', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    await a.post('/dispositivos', { token: 'ExponentPushToken[compartido]', plataforma: 'ios' });
    await b.post('/dispositivos', { token: 'ExponentPushToken[compartido]', plataforma: 'ios' });
    const filas = await e.db.selectFrom('dispositivos as d').innerJoin('usuarios as u', 'u.id', 'd.usuario_id').select('u.email').execute();
    expect(filas).toEqual([{ email: 'b@scout.test' }]);
  });
});
