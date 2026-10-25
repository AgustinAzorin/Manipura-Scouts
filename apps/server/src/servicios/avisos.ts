import {
  aniosCumplidos,
  asignacionVeActividad,
  cubre,
  esAnioBisiesto,
  horaAR,
  hoyAR,
  momentoAviso,
  nombreCompleto,
  preferenciasCompletas,
  recibeAviso,
  sanearPermisos,
  textoAvisoActividad,
  textoCambioActividad,
  textoCancelacion,
  tienePermiso,
  type Antelacion,
  type AsignacionConRol,
  type CanalAviso,
  type Destino,
  type TipoAviso,
} from '@scouttracker/shared';
import type { Transaction } from 'kysely';
import type { Dependencias } from '../app';
import type { BaseDeDatos, Db, FilaActividad } from '../db';
import { validacion } from '../errores';
import { ubicacionActividad } from './actividades';
import { notificarError } from './monitoreo';

interface AsignacionDeUsuario extends AsignacionConRol {
  usuarioId: string;
  email: string;
  nombre: string;
  rolId: string;
}

export interface Destinatario {
  usuarioId: string;
  email: string;
}

/** Asignaciones de los usuarios activos y con la cuenta activada de un grupo activo. */
async function asignacionesDelGrupo(db: Db, grupoId: string): Promise<AsignacionDeUsuario[]> {
  const filas = await db
    .selectFrom('asignaciones as a')
    .innerJoin('roles as r', 'r.id', 'a.rol_id')
    .innerJoin('grupos as g', 'g.id', 'a.grupo_id')
    .innerJoin('usuarios as u', 'u.id', 'a.usuario_id')
    .innerJoin('miembros as m', (j) => j.onRef('m.grupo_id', '=', 'a.grupo_id').onRef('m.usuario_id', '=', 'a.usuario_id'))
    .select(['a.usuario_id', 'a.alcance', 'a.rama_id', 'a.equipo_id', 'r.id as rol_id', 'r.permisos', 'r.ver_sensibles', 'u.email', 'u.nombre'])
    .where('a.grupo_id', '=', grupoId)
    .where('g.activo', '=', true)
    .where('m.activo', '=', true)
    .where('u.password_hash', 'is not', null)
    .execute();
  return filas.map((f) => ({
    usuarioId: f.usuario_id,
    email: f.email,
    nombre: f.nombre,
    rolId: f.rol_id,
    grupoId,
    alcance: f.alcance,
    ramaId: f.rama_id,
    equipoId: f.equipo_id,
    rol: { permisos: sanearPermisos(f.permisos), verSensibles: f.ver_sensibles },
  }));
}

function unicos(asigs: AsignacionDeUsuario[]): Destinatario[] {
  const vistos = new Map<string, Destinatario>();
  for (const a of asigs) if (!vistos.has(a.usuarioId)) vistos.set(a.usuarioId, { usuarioId: a.usuarioId, email: a.email });
  return [...vistos.values()];
}

/** Filtra por el destino elegido: rama (y sus equipos), equipo o rol (RF-079, RF-086). */
function filtrarPorDestino(asigs: AsignacionDeUsuario[], destino: Destino): AsignacionDeUsuario[] {
  switch (destino.tipo) {
    case 'alcance':
    case 'grupo':
      return asigs;
    case 'rama':
      return asigs.filter((a) => a.alcance !== 'grupo' && a.ramaId === destino.id);
    case 'equipo':
      return asigs.filter((a) => a.equipoId === destino.id);
    case 'rol':
      return asigs.filter((a) => a.rolId === destino.id);
  }
}

/** RF-079: usuarios que ven la actividad (RN-19), limitados por el destino elegido. */
export async function destinatariosDeActividad(db: Db, a: FilaActividad): Promise<Destinatario[]> {
  const ubicacion = ubicacionActividad(a);
  const asigs = (await asignacionesDelGrupo(db, a.grupo_id)).filter(
    (x) => asignacionVeActividad(x, ubicacion) && tienePermiso(x.rol.permisos, 'actividades', 'ver'),
  );
  return unicos(filtrarPorDestino(asigs, a.destino_avisos));
}

/** RF-086: todo el grupo, una rama, un equipo o un rol. */
export async function destinatariosDeGrupo(db: Db, grupoId: string, destino: Destino): Promise<Destinatario[]> {
  return unicos(filtrarPorDestino(await asignacionesDelGrupo(db, grupoId), destino));
}

/** RF-083: educadores de la rama del protagonista (con asignación de rama o de su equipo) que pueden ver su ficha. */
async function destinatariosDeCumpleanios(db: Db, f: { grupo_id: string; rama_id: string; equipo_id: string | null }): Promise<Destinatario[]> {
  const o = { grupoId: f.grupo_id, ramaId: f.rama_id, equipoId: f.equipo_id };
  const asigs = (await asignacionesDelGrupo(db, f.grupo_id)).filter(
    (a) => a.alcance !== 'grupo' && a.ramaId === f.rama_id && cubre(a, o) && tienePermiso(a.rol.permisos, 'padron', 'ver'),
  );
  return unicos(asigs);
}

/** Verifica que la rama, el equipo o el rol del destino sean del grupo. Devuelve su nombre legible. */
export async function validarDestino(db: Db | Transaction<BaseDeDatos>, grupoId: string, destino: Destino): Promise<string> {
  switch (destino.tipo) {
    case 'alcance':
      return 'Usuarios del alcance de la actividad';
    case 'grupo':
      return 'Todo el grupo';
    case 'rama': {
      const r = await db.selectFrom('ramas').select('nombre').where('id', '=', destino.id).where('grupo_id', '=', grupoId).executeTakeFirst();
      if (!r) throw validacion('La rama no es de este grupo');
      return `Rama ${r.nombre}`;
    }
    case 'equipo': {
      const e = await db.selectFrom('equipos').select('nombre').where('id', '=', destino.id).where('grupo_id', '=', grupoId).executeTakeFirst();
      if (!e) throw validacion('El equipo no es de este grupo');
      return `Equipo ${e.nombre}`;
    }
    case 'rol': {
      const r = await db.selectFrom('roles').select('nombre').where('id', '=', destino.id).where('grupo_id', '=', grupoId).executeTakeFirst();
      if (!r) throw validacion('El rol no es de este grupo');
      return `Rol ${r.nombre}`;
    }
  }
}

export interface Notificacion {
  tipo: TipoAviso;
  titulo: string;
  cuerpo: string;
  /** RF-081: pantalla que abre la app al tocar la notificación. */
  ruta?: string;
  /** RF-084: llega aunque el usuario haya desactivado ese tipo de aviso. */
  importante?: boolean;
  canales?: CanalAviso[];
}

export interface ResultadoEnvio {
  push: number;
  mails: number;
  /** RF-082: mails que no salieron por el tope diario (quedan registrados en `mails`). */
  mailsOmitidos: number;
}

/**
 * Envía una notificación por push y por mail a cada destinatario, según sus preferencias (RF-084).
 * Los mails respetan el tope de RN-14: desde el envío 91 del día, los avisos salen solo por push.
 */
export async function enviarAviso(deps: Dependencias, destinatarios: Destinatario[], n: Notificacion): Promise<ResultadoEnvio> {
  const resultado: ResultadoEnvio = { push: 0, mails: 0, mailsOmitidos: 0 };
  if (destinatarios.length === 0) return resultado;
  const canales = n.canales ?? ['push', 'mail'];
  const ids = destinatarios.map((d) => d.usuarioId);
  const filas = await deps.db.selectFrom('preferencias_avisos').select(['usuario_id', 'tipo', 'canal', 'activo']).where('usuario_id', 'in', ids).execute();
  const prefs = (usuarioId: string) => preferenciasCompletas(filas.filter((f) => f.usuario_id === usuarioId));
  const conPush = destinatarios.filter((d) => canales.includes('push') && recibeAviso(prefs(d.usuarioId), n.tipo, 'push', n.importante));
  const conMail = destinatarios.filter((d) => canales.includes('mail') && recibeAviso(prefs(d.usuarioId), n.tipo, 'mail', n.importante));

  if (conPush.length) {
    const dispositivos = await deps.db.selectFrom('dispositivos').select('token').where('usuario_id', 'in', conPush.map((d) => d.usuarioId)).execute();
    if (dispositivos.length) {
      try {
        const { tokensInvalidos } = await deps.push.enviar(
          dispositivos.map((d) => ({ token: d.token, titulo: n.titulo, cuerpo: n.cuerpo, datos: n.ruta ? { ruta: n.ruta } : undefined })),
        );
        if (tokensInvalidos.length) await deps.db.deleteFrom('dispositivos').where('token', 'in', tokensInvalidos).execute();
        resultado.push = dispositivos.length - tokensInvalidos.length;
      } catch (e) {
        await notificarError(deps, e, 'envío de push').catch(() => {});
      }
    }
  }
  for (const d of conMail) {
    const texto = `${n.cuerpo}\n\n—\nScoutTracker. Para dejar de recibir estos mails, cambiá tus preferencias en la app: Menú → Avisos.`;
    if (await deps.mailer.enviar({ para: d.email, asunto: n.titulo, texto, tipo: 'aviso' })) resultado.mails++;
    else resultado.mailsOmitidos++;
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Avisos programados de las actividades (RF-078, RF-061, RF-062, RF-085)

/**
 * Deja programados los avisos de la actividad con las antelaciones indicadas. Los que ya pasaron
 * al programarlos no se envían; si cambió la fecha, los que ya habían salido vuelven a programarse.
 */
export async function programarAvisos(trx: Transaction<BaseDeDatos>, a: FilaActividad, antelaciones: Antelacion[], ahora: Date): Promise<void> {
  await trx.deleteFrom('avisos_actividad').where('actividad_id', '=', a.id).where('antelacion', 'not in', antelaciones.length ? antelaciones : ['-' as Antelacion]).execute();
  for (const antelacion of antelaciones) {
    const enviarEn = momentoAviso(a.inicio.toISOString(), antelacion);
    const futuro = enviarEn.getTime() > ahora.getTime();
    const previo = await trx.selectFrom('avisos_actividad').select(['enviar_en', 'enviado_en']).where('actividad_id', '=', a.id).where('antelacion', '=', antelacion).executeTakeFirst();
    if (!previo) {
      await trx
        .insertInto('avisos_actividad')
        .values({ grupo_id: a.grupo_id, actividad_id: a.id, antelacion, enviar_en: enviarEn, ...(futuro ? {} : { enviado_en: ahora, omitido: true }) })
        .execute();
    } else if (previo.enviar_en.getTime() !== enviarEn.getTime()) {
      const cambios = futuro ? { enviar_en: enviarEn, enviado_en: null, omitido: false } : previo.enviado_en ? { enviar_en: enviarEn } : { enviar_en: enviarEn, enviado_en: ahora, omitido: true };
      await trx.updateTable('avisos_actividad').set(cambios).where('actividad_id', '=', a.id).where('antelacion', '=', antelacion).execute();
    }
  }
}

export async function tieneAvisos(db: Db, actividadId: string): Promise<boolean> {
  return !!(await db.selectFrom('avisos_actividad').select('id').where('actividad_id', '=', actividadId).executeTakeFirst());
}

/** RF-085: avisa a los mismos destinatarios el cambio de fecha, hora o lugar. */
export async function avisarCambio(deps: Dependencias, a: FilaActividad): Promise<void> {
  const texto = textoCambioActividad({ nombre: a.nombre, inicio: a.inicio.toISOString(), fin: a.fin.toISOString(), lugar: a.lugar });
  await enviarAviso(deps, await destinatariosDeActividad(deps.db, a), { tipo: 'actividades', ...texto, ruta: `/actividad/${a.id}` });
}

/** RF-062 / RF-085: anula los avisos pendientes y avisa la cancelación. */
export async function avisarCancelacion(deps: Dependencias, a: FilaActividad): Promise<void> {
  await deps.db.updateTable('avisos_actividad').set({ anulado_en: deps.ahora() }).where('actividad_id', '=', a.id).where('enviado_en', 'is', null).execute();
  const texto = textoCancelacion({ nombre: a.nombre, inicio: a.inicio.toISOString(), fin: a.fin.toISOString() });
  await enviarAviso(deps, await destinatariosDeActividad(deps.db, a), { tipo: 'actividades', ...texto, ruta: `/actividad/${a.id}` });
}

/** Un aviso que debió salir hace más de 30 minutos (servidor caído) ya no se manda. */
const TOLERANCIA_ATRASO_MS = 30 * 60 * 1000;

/** RN-15: hora del aviso de cumpleaños. */
export const HORA_AVISO_CUMPLEANIOS = '09:00';

/**
 * Envía los avisos programados que llegaron a su hora y los de cumpleaños del día. Se ejecuta cada
 * minuto. Cada aviso se marca antes de enviarlo, así dos ejecuciones simultáneas no lo duplican.
 */
export async function procesarAvisos(deps: Dependencias): Promise<{ actividades: number; omitidos: number; cumpleanios: number }> {
  const ahora = deps.ahora();
  const r = { actividades: 0, omitidos: 0, cumpleanios: 0 };

  const vencidos = await deps.db
    .updateTable('avisos_actividad as av')
    .set({ enviado_en: ahora })
    .from('actividades as a')
    .whereRef('a.id', '=', 'av.actividad_id')
    .where('av.enviado_en', 'is', null)
    .where('av.anulado_en', 'is', null)
    .where('av.enviar_en', '<=', ahora)
    .where('a.cancelada_en', 'is', null)
    .returning(['av.id', 'av.antelacion', 'av.enviar_en', 'av.actividad_id'])
    .execute();
  for (const av of vencidos) {
    if (ahora.getTime() - av.enviar_en.getTime() > TOLERANCIA_ATRASO_MS) {
      await deps.db.updateTable('avisos_actividad').set({ omitido: true }).where('id', '=', av.id).execute();
      r.omitidos++;
      continue;
    }
    const a = await deps.db
      .selectFrom('actividades as a')
      .innerJoin('grupos as g', 'g.id', 'a.grupo_id')
      .selectAll('a')
      .where('a.id', '=', av.actividad_id)
      .where('g.activo', '=', true)
      .executeTakeFirst();
    if (!a) continue;
    const texto = textoAvisoActividad({ nombre: a.nombre, inicio: a.inicio.toISOString(), fin: a.fin.toISOString(), lugar: a.lugar }, av.antelacion);
    await enviarAviso(deps, await destinatariosDeActividad(deps.db, a), { tipo: 'actividades', ...texto, ruta: `/actividad/${a.id}` });
    r.actividades++;
  }

  // RF-083 / RN-15: cumpleaños del día, a partir de las 9:00 de Argentina.
  if (horaAR(ahora.toISOString()) >= HORA_AVISO_CUMPLEANIOS) {
    const hoy = hoyAR(ahora);
    const mesDia = [hoy.slice(5)];
    // El 29/02 se festeja el 28/02 en años no bisiestos.
    if (mesDia[0] === '02-28' && !esAnioBisiesto(Number(hoy.slice(0, 4)))) mesDia.push('02-29');
    const fichas = await deps.db
      .selectFrom('fichas as f')
      .innerJoin('grupos as g', 'g.id', 'f.grupo_id')
      .select(['f.id', 'f.grupo_id', 'f.rama_id', 'f.equipo_id', 'f.apellido', 'f.nombre', 'f.fecha_nacimiento'])
      .where('g.activo', '=', true)
      .where('f.estado', 'in', ['activa', 'incompleta'])
      .where((eb) => eb(eb.fn<string>('to_char', [eb.ref('f.fecha_nacimiento'), eb.val('MM-DD')]), 'in', mesDia))
      .execute();
    for (const f of fichas) {
      const nuevo = await deps.db.insertInto('cumpleanios_avisados').values({ ficha_id: f.id, fecha: hoy }).onConflict((oc) => oc.doNothing()).returning('ficha_id').executeTakeFirst();
      if (!nuevo) continue;
      const edad = aniosCumplidos(f.fecha_nacimiento!, hoy);
      await enviarAviso(deps, await destinatariosDeCumpleanios(deps.db, f), {
        tipo: 'cumpleanios',
        titulo: `Cumpleaños de ${nombreCompleto(f)}`,
        cuerpo: `Hoy cumple ${edad} años.`,
        ruta: `/ficha/${f.id}`,
      });
      r.cumpleanios++;
    }
  }
  return r;
}
