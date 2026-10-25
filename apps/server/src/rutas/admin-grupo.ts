import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  CODIGOS_ERROR,
  sanearPermisos,
  TODOS_LOS_PERMISOS,
  type AsignacionDTO,
  type RamaDTO,
  type RolDTO,
  type UsuarioAdminDTO,
} from '@scouttracker/shared';
import { sesionDe, type Dependencias } from '../app';
import { json } from '../db';
import { conflicto, ErrorHttp, noEncontrado, validacion } from '../errores';
import { exigirAdminGrupo } from '../servicios/acceso';
import { contarAdminsActivos, ROL_ADMIN_GRUPO } from '../servicios/grupos';
import { agregarAsignacion, invitarUsuario, reenviarInvitacion } from '../servicios/usuarios';

const pGrupo = z.object({ grupoId: z.string().uuid() });
const pUsuario = pGrupo.extend({ usuarioId: z.string().uuid() });
const pRol = pGrupo.extend({ rolId: z.string().uuid() });

const esquemaAsignacion = z.object({
  rolId: z.string().uuid(),
  alcance: z.enum(['grupo', 'rama', 'equipo']),
  ramaId: z.string().uuid().nullish(),
  equipoId: z.string().uuid().nullish(),
});

const esquemaRol = z.object({
  nombre: z.string().trim().min(1).max(100),
  permisos: z.record(z.string(), z.array(z.string())),
  verSensibles: z.boolean(),
});

/** Corta con GRUPO_DESACTIVADO antes de evaluar permisos, para que el mensaje sea claro (RF-002). */
export async function exigirGrupoActivo(deps: Dependencias, grupoId: string): Promise<void> {
  const g = await deps.db.selectFrom('grupos').select('activo').where('id', '=', grupoId).executeTakeFirst();
  if (!g) throw noEncontrado('El grupo no existe');
  if (!g.activo) throw new ErrorHttp(403, CODIGOS_ERROR.grupoDesactivado, 'El grupo está desactivado');
}

const esUnico = (e: unknown) => (e as { code?: string }).code === '23505';

/** Admin de grupo: ramas, usuarios, asignaciones y roles (RF-005, RF-009 a RF-019). */
export async function rutasAdminGrupo(app: FastifyInstance, deps: Dependencias) {
  // ---- Ramas (RF-005)
  app.get('/grupos/:grupoId/ramas', async (req): Promise<RamaDTO[]> => {
    const { grupoId } = pGrupo.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(sesionDe(req), grupoId, 'ver');
    return deps.db.selectFrom('ramas').select(['id', 'nombre', 'comunidad']).where('grupo_id', '=', grupoId).orderBy('nombre').execute();
  });

  app.post('/grupos/:grupoId/ramas', async (req, reply) => {
    const { grupoId } = pGrupo.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(sesionDe(req), grupoId, 'crear');
    const d = z.object({ nombre: z.string().trim().min(1).max(100), comunidad: z.string().trim().max(200).nullish() }).parse(req.body);
    try {
      const r = await deps.db
        .insertInto('ramas')
        .values({ grupo_id: grupoId, nombre: d.nombre, comunidad: d.comunidad || null })
        .returning('id')
        .executeTakeFirstOrThrow();
      return reply.status(201).send({ id: r.id });
    } catch (e) {
      if (esUnico(e)) throw conflicto('NOMBRE_REPETIDO', 'Ya existe una rama con ese nombre');
      throw e;
    }
  });

  app.patch('/grupos/:grupoId/ramas/:ramaId', async (req) => {
    const { grupoId, ramaId } = pGrupo.extend({ ramaId: z.string().uuid() }).parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(sesionDe(req), grupoId, 'editar');
    const d = z.object({ nombre: z.string().trim().min(1).max(100).optional(), comunidad: z.string().trim().max(200).nullish() }).parse(req.body);
    const cambios: { nombre?: string; comunidad?: string | null } = {};
    if (d.nombre !== undefined) cambios.nombre = d.nombre;
    if (d.comunidad !== undefined) cambios.comunidad = d.comunidad || null;
    if (Object.keys(cambios).length === 0) return { ok: true };
    try {
      const r = await deps.db.updateTable('ramas').set(cambios).where('id', '=', ramaId).where('grupo_id', '=', grupoId).executeTakeFirst();
      if (Number(r.numUpdatedRows) === 0) throw noEncontrado('La rama no existe');
    } catch (e) {
      if (esUnico(e)) throw conflicto('NOMBRE_REPETIDO', 'Ya existe una rama con ese nombre');
      throw e;
    }
    return { ok: true };
  });

  /** Ramas y equipos del grupo, para elegir el alcance de una asignación. */
  app.get('/grupos/:grupoId/estructura', async (req) => {
    const { grupoId } = pGrupo.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(sesionDe(req), grupoId, 'ver');
    const ramas = await deps.db.selectFrom('ramas').select(['id', 'nombre', 'comunidad']).where('grupo_id', '=', grupoId).orderBy('nombre').execute();
    const equipos = await deps.db
      .selectFrom('equipos')
      .select(['id', 'nombre', 'rama_id', 'activo'])
      .where('grupo_id', '=', grupoId)
      .orderBy('nombre')
      .execute();
    return {
      ramas: ramas.map((r) => ({
        ...r,
        equipos: equipos.filter((e) => e.rama_id === r.id).map((e) => ({ id: e.id, nombre: e.nombre, activo: e.activo })),
      })),
    };
  });

  // ---- Usuarios (RF-009, RF-014 a RF-016)
  app.get('/grupos/:grupoId/usuarios', async (req): Promise<UsuarioAdminDTO[]> => {
    const { grupoId } = pGrupo.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(sesionDe(req), grupoId, 'ver');
    const usuarios = await deps.db
      .selectFrom('miembros as m')
      .innerJoin('usuarios as u', 'u.id', 'm.usuario_id')
      .select(['u.id', 'u.nombre', 'u.email', 'm.activo', sql<boolean>`u.password_hash IS NULL`.as('pendiente')])
      .where('m.grupo_id', '=', grupoId)
      .orderBy('u.nombre')
      .execute();
    const asignaciones = await deps.db
      .selectFrom('asignaciones as a')
      .innerJoin('roles as r', 'r.id', 'a.rol_id')
      .leftJoin('ramas as ra', 'ra.id', 'a.rama_id')
      .leftJoin('equipos as e', 'e.id', 'a.equipo_id')
      .select(['a.id', 'a.usuario_id', 'a.rol_id', 'r.nombre as rol_nombre', 'a.alcance', 'a.rama_id', 'a.equipo_id', 'ra.nombre as rama_nombre', 'e.nombre as equipo_nombre'])
      .where('a.grupo_id', '=', grupoId)
      .orderBy('a.creado_en')
      .execute();
    return usuarios.map((u) => ({
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      activo: u.activo,
      pendienteActivacion: u.pendiente,
      asignaciones: asignaciones
        .filter((a) => a.usuario_id === u.id)
        .map(
          (a): AsignacionDTO => ({
            id: a.id,
            rolId: a.rol_id,
            rolNombre: a.rol_nombre,
            alcance: a.alcance,
            ramaId: a.rama_id,
            equipoId: a.equipo_id,
            alcanceNombre:
              a.alcance === 'grupo' ? 'Todo el grupo' : a.alcance === 'rama' ? `Rama ${a.rama_nombre}` : `Equipo ${a.equipo_nombre} (${a.rama_nombre})`,
          }),
        ),
    }));
  });

  app.post('/grupos/:grupoId/usuarios', async (req, reply) => {
    const { grupoId } = pGrupo.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(sesionDe(req), grupoId, 'crear');
    const d = esquemaAsignacion
      .extend({ nombre: z.string().trim().min(1).max(200), email: z.string().trim().toLowerCase().email() })
      .parse(req.body);
    return reply.status(201).send(await invitarUsuario(deps, grupoId, d));
  });

  app.post('/grupos/:grupoId/usuarios/:usuarioId/reenviar-invitacion', async (req) => {
    const { grupoId, usuarioId } = pUsuario.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(sesionDe(req), grupoId, 'crear');
    return { mailEnviado: await reenviarInvitacion(deps, grupoId, usuarioId) };
  });

  app.post('/grupos/:grupoId/usuarios/:usuarioId/asignaciones', async (req, reply) => {
    const { grupoId, usuarioId } = pUsuario.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(sesionDe(req), grupoId, 'editar');
    const miembro = await deps.db
      .selectFrom('miembros')
      .select('usuario_id')
      .where('usuario_id', '=', usuarioId)
      .where('grupo_id', '=', grupoId)
      .executeTakeFirst();
    if (!miembro) throw noEncontrado('El usuario no es del grupo');
    const id = await agregarAsignacion(deps.db, usuarioId, grupoId, esquemaAsignacion.parse(req.body));
    return reply.status(201).send({ id });
  });

  app.delete('/grupos/:grupoId/asignaciones/:asignacionId', async (req) => {
    const { grupoId, asignacionId } = pGrupo.extend({ asignacionId: z.string().uuid() }).parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(sesionDe(req), grupoId, 'editar');
    const a = await deps.db
      .selectFrom('asignaciones as a')
      .innerJoin('roles as r', 'r.id', 'a.rol_id')
      .select(['a.id', 'a.alcance', 'r.sistema'])
      .where('a.id', '=', asignacionId)
      .where('a.grupo_id', '=', grupoId)
      .executeTakeFirst();
    if (!a) throw noEncontrado('La asignación no existe');
    if (a.sistema === ROL_ADMIN_GRUPO && a.alcance === 'grupo' && (await contarAdminsActivos(deps.db, grupoId, { asignacionId })) === 0) {
      throw conflicto('ULTIMO_ADMIN', 'El grupo no puede quedarse sin admin');
    }
    await deps.db.deleteFrom('asignaciones').where('id', '=', asignacionId).execute();
    return { ok: true };
  });

  // RF-014 / RF-015: el estado es por grupo; las asignaciones se conservan.
  for (const [accion, activo] of [
    ['desactivar', false],
    ['reactivar', true],
  ] as const) {
    app.post(`/grupos/:grupoId/usuarios/:usuarioId/${accion}`, async (req) => {
      const { grupoId, usuarioId } = pUsuario.parse(req.params);
      await exigirGrupoActivo(deps, grupoId);
      exigirAdminGrupo(sesionDe(req), grupoId, 'editar');
      if (!activo && (await contarAdminsActivos(deps.db, grupoId, { usuarioId })) === 0) {
        throw conflicto('ULTIMO_ADMIN', 'El grupo no puede quedarse sin admin activo');
      }
      const r = await deps.db
        .updateTable('miembros')
        .set({ activo })
        .where('usuario_id', '=', usuarioId)
        .where('grupo_id', '=', grupoId)
        .executeTakeFirst();
      if (Number(r.numUpdatedRows) === 0) throw noEncontrado('El usuario no es del grupo');
      if (!activo) {
        // RNF-021: si ya no está activo en ningún grupo (y no es admin de plataforma), se cierran sus sesiones.
        const otro = await deps.db
          .selectFrom('miembros as m')
          .innerJoin('usuarios as u', 'u.id', 'm.usuario_id')
          .select('m.grupo_id')
          .where('m.usuario_id', '=', usuarioId)
          .where((eb) => eb.or([eb('m.activo', '=', true), eb('u.es_admin_plataforma', '=', true)]))
          .executeTakeFirst();
        if (!otro) await deps.db.deleteFrom('sesiones').where('usuario_id', '=', usuarioId).execute();
      }
      return { ok: true };
    });
  }

  // ---- Roles (RF-017, RF-018, RF-020)
  app.get('/grupos/:grupoId/roles', async (req): Promise<RolDTO[]> => {
    const { grupoId } = pGrupo.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(sesionDe(req), grupoId, 'ver');
    const roles = await deps.db
      .selectFrom('roles as r')
      .select(['r.id', 'r.nombre', 'r.permisos', 'r.ver_sensibles', 'r.sistema'])
      .select((eb) =>
        eb.selectFrom('asignaciones as a').select(sql<number>`count(distinct a.usuario_id)::int`.as('n')).whereRef('a.rol_id', '=', 'r.id').as('cantidad'),
      )
      .where('r.grupo_id', '=', grupoId)
      .orderBy('r.creado_en')
      .execute();
    return roles.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      permisos: sanearPermisos(r.permisos),
      verSensibles: r.ver_sensibles,
      sistema: r.sistema !== null,
      cantidadUsuarios: r.cantidad ?? 0,
    }));
  });

  app.post('/grupos/:grupoId/roles', async (req, reply) => {
    const { grupoId } = pGrupo.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(sesionDe(req), grupoId, 'crear');
    const d = esquemaRol.partial({ verSensibles: true }).parse(req.body);
    try {
      const r = await deps.db
        .insertInto('roles')
        .values({
          grupo_id: grupoId,
          nombre: d.nombre,
          permisos: json(sanearPermisos(d.permisos)),
          // RF-020: un rol nuevo no tiene el permiso salvo que se le dé explícitamente.
          ver_sensibles: d.verSensibles === true,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return reply.status(201).send({ id: r.id });
    } catch (e) {
      if (esUnico(e)) throw conflicto('NOMBRE_REPETIDO', 'Ya existe un rol con ese nombre');
      throw e;
    }
  });

  // RF-018: los cambios valen para todos los usuarios con el rol desde su siguiente acción en línea,
  // porque los permisos se leen de la base en cada petición.
  app.patch('/grupos/:grupoId/roles/:rolId', async (req) => {
    const { grupoId, rolId } = pRol.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(sesionDe(req), grupoId, 'editar');
    const d = esquemaRol.partial().parse(req.body);
    const rol = await deps.db.selectFrom('roles').select(['sistema']).where('id', '=', rolId).where('grupo_id', '=', grupoId).executeTakeFirst();
    if (!rol) throw noEncontrado('El rol no existe');
    const cambios: { nombre?: string; permisos?: string; ver_sensibles?: boolean } = {};
    if (d.nombre !== undefined) cambios.nombre = d.nombre;
    if (rol.sistema === ROL_ADMIN_GRUPO) {
      if (d.permisos !== undefined || d.verSensibles === false) {
        throw validacion('Los permisos del rol "Admin de grupo" no se pueden recortar');
      }
      cambios.permisos = json(TODOS_LOS_PERMISOS);
    } else {
      if (d.permisos !== undefined) cambios.permisos = json(sanearPermisos(d.permisos));
      if (d.verSensibles !== undefined) cambios.ver_sensibles = d.verSensibles;
    }
    try {
      await deps.db.updateTable('roles').set(cambios).where('id', '=', rolId).execute();
    } catch (e) {
      if (esUnico(e)) throw conflicto('NOMBRE_REPETIDO', 'Ya existe un rol con ese nombre');
      throw e;
    }
    return { ok: true };
  });

  app.delete('/grupos/:grupoId/roles/:rolId', async (req) => {
    const { grupoId, rolId } = pRol.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(sesionDe(req), grupoId, 'eliminar');
    const rol = await deps.db.selectFrom('roles').select(['sistema']).where('id', '=', rolId).where('grupo_id', '=', grupoId).executeTakeFirst();
    if (!rol) throw noEncontrado('El rol no existe');
    if (rol.sistema) throw validacion('El rol "Admin de grupo" no se puede borrar');
    const usado = await deps.db.selectFrom('asignaciones').select('id').where('rol_id', '=', rolId).executeTakeFirst();
    if (usado) throw conflicto('ROL_EN_USO', 'El rol está asignado a usuarios. Quitá esas asignaciones antes de borrarlo.');
    await deps.db.deleteFrom('roles').where('id', '=', rolId).execute();
    return { ok: true };
  });
}
