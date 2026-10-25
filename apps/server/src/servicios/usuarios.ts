import { CODIGOS_ERROR, type Alcance } from '@scouttracker/shared';
import type { Dependencias } from '../app';
import type { Db } from '../db';
import { conflicto, noEncontrado, validacion } from '../errores';
import { crearEnlace } from './enlaces';

export interface DatosAsignacion {
  rolId: string;
  alcance: Alcance;
  ramaId?: string | null;
  equipoId?: string | null;
}

/** Valida que rol, rama y equipo existan y sean del grupo; completa la rama de un equipo. */
export async function resolverAsignacion(db: Db, grupoId: string, d: DatosAsignacion) {
  const rol = await db.selectFrom('roles').select('id').where('id', '=', d.rolId).where('grupo_id', '=', grupoId).executeTakeFirst();
  if (!rol) throw validacion('El rol no existe en este grupo', { rolId: 'Rol inválido' });
  if (d.alcance === 'grupo') return { rol_id: d.rolId, alcance: 'grupo' as const, rama_id: null, equipo_id: null };
  if (d.alcance === 'rama') {
    if (!d.ramaId) throw validacion('Elegí la rama', { ramaId: 'Requerido' });
    const r = await db.selectFrom('ramas').select('id').where('id', '=', d.ramaId).where('grupo_id', '=', grupoId).executeTakeFirst();
    if (!r) throw validacion('La rama no existe en este grupo', { ramaId: 'Rama inválida' });
    return { rol_id: d.rolId, alcance: 'rama' as const, rama_id: d.ramaId, equipo_id: null };
  }
  if (!d.equipoId) throw validacion('Elegí el equipo', { equipoId: 'Requerido' });
  const e = await db
    .selectFrom('equipos')
    .select(['id', 'rama_id', 'activo'])
    .where('id', '=', d.equipoId)
    .where('grupo_id', '=', grupoId)
    .executeTakeFirst();
  if (!e) throw validacion('El equipo no existe en este grupo', { equipoId: 'Equipo inválido' });
  if (!e.activo) throw validacion('El equipo está desactivado', { equipoId: 'Equipo inactivo' });
  return { rol_id: d.rolId, alcance: 'equipo' as const, rama_id: e.rama_id, equipo_id: e.id };
}

export async function agregarAsignacion(db: Db, usuarioId: string, grupoId: string, d: DatosAsignacion): Promise<string> {
  const valores = await resolverAsignacion(db, grupoId, d);
  const r = await db
    .insertInto('asignaciones')
    .values({ usuario_id: usuarioId, grupo_id: grupoId, ...valores })
    .onConflict((oc) => oc.doNothing())
    .returning('id')
    .executeTakeFirst();
  if (!r) throw conflicto('ASIGNACION_EXISTENTE', 'El usuario ya tiene ese rol con ese alcance');
  return r.id;
}

async function enviarInvitacion(deps: Dependencias, usuarioId: string, grupoNombre: string): Promise<boolean> {
  const u = await deps.db.selectFrom('usuarios').select(['nombre', 'email']).where('id', '=', usuarioId).executeTakeFirstOrThrow();
  const token = await crearEnlace(deps.db, usuarioId, 'invitacion', deps.ahora());
  return deps.mailer.enviar({
    tipo: 'invitacion',
    para: u.email,
    asunto: `ScoutTracker: invitación a ${grupoNombre}`,
    texto:
      `Hola ${u.nombre}:\n\nTe invitaron a usar ScoutTracker en ${grupoNombre}. Para activar tu cuenta y definir tu contraseña ` +
      `entrá a este enlace (vence en 7 días y sirve una sola vez):\n\n${deps.config.urlPublica}/activar?token=${token}\n\n` +
      `Después instalá la app e iniciá sesión con este mail.`,
  });
}

export interface ResultadoInvitacion {
  usuarioId: string;
  /** Se creó un usuario nuevo y se le envió el enlace de activación. */
  nuevo: boolean;
  mailEnviado: boolean;
}

/**
 * RF-009 / RF-003: invita por mail con un rol y un alcance.
 * - Mail nuevo: crea el usuario pendiente de activación y envía la invitación.
 * - Mail que ya es usuario del grupo: error USUARIO_EXISTENTE para ofrecer agregar una asignación.
 * - Usuario de otro grupo: se lo suma al grupo con la asignación y se le avisa por mail.
 */
export async function invitarUsuario(
  deps: Dependencias,
  grupoId: string,
  datos: { nombre: string; email: string } & DatosAsignacion,
): Promise<ResultadoInvitacion> {
  const grupo = await deps.db.selectFrom('grupos').select(['nombre']).where('id', '=', grupoId).executeTakeFirst();
  if (!grupo) throw noEncontrado('El grupo no existe');
  const email = datos.email.trim().toLowerCase();
  await resolverAsignacion(deps.db, grupoId, datos);

  const existente = await deps.db.selectFrom('usuarios').select(['id', 'password_hash']).where('email', '=', email).executeTakeFirst();
  if (existente) {
    const miembro = await deps.db
      .selectFrom('miembros')
      .select('usuario_id')
      .where('usuario_id', '=', existente.id)
      .where('grupo_id', '=', grupoId)
      .executeTakeFirst();
    if (miembro) {
      throw conflicto(CODIGOS_ERROR.usuarioExistente, 'Ese mail ya es usuario del grupo. ¿Querés agregarle una asignación de rol?', {
        usuarioId: existente.id,
      });
    }
    await deps.db.insertInto('miembros').values({ usuario_id: existente.id, grupo_id: grupoId }).execute();
    await agregarAsignacion(deps.db, existente.id, grupoId, datos);
    if (!existente.password_hash) {
      return { usuarioId: existente.id, nuevo: true, mailEnviado: await enviarInvitacion(deps, existente.id, grupo.nombre) };
    }
    const enviado = await deps.mailer.enviar({
      tipo: 'invitacion',
      para: email,
      asunto: `ScoutTracker: te sumaron a ${grupo.nombre}`,
      texto: `Te sumaron a ${grupo.nombre} en ScoutTracker. Entrá a la app con tu usuario de siempre y elegí el grupo.`,
    });
    return { usuarioId: existente.id, nuevo: false, mailEnviado: enviado };
  }

  const usuarioId = await deps.db.transaction().execute(async (trx) => {
    const u = await trx.insertInto('usuarios').values({ nombre: datos.nombre.trim(), email }).returning('id').executeTakeFirstOrThrow();
    await trx.insertInto('miembros').values({ usuario_id: u.id, grupo_id: grupoId }).execute();
    return u.id;
  });
  await agregarAsignacion(deps.db, usuarioId, grupoId, datos);
  return { usuarioId, nuevo: true, mailEnviado: await enviarInvitacion(deps, usuarioId, grupo.nombre) };
}

/** Reenvía la invitación a un usuario que todavía no la activó; invalida la anterior (RN-21). */
export async function reenviarInvitacion(deps: Dependencias, grupoId: string, usuarioId: string): Promise<boolean> {
  const fila = await deps.db
    .selectFrom('usuarios as u')
    .innerJoin('miembros as m', 'm.usuario_id', 'u.id')
    .innerJoin('grupos as g', 'g.id', 'm.grupo_id')
    .select(['u.password_hash', 'g.nombre'])
    .where('u.id', '=', usuarioId)
    .where('m.grupo_id', '=', grupoId)
    .executeTakeFirst();
  if (!fila) throw noEncontrado('El usuario no es del grupo');
  if (fila.password_hash) throw validacion('El usuario ya activó su cuenta');
  return enviarInvitacion(deps, usuarioId, fila.nombre);
}
