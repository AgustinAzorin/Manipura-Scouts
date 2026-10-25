import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { GrupoDTO } from '@scouttracker/shared';
import { sesionDe, type Dependencias } from '../app';
import { noEncontrado, sinPermiso } from '../errores';
import type { Sesion } from '../servicios/acceso';
import { crearGrupo, rolAdminGrupo, ROL_ADMIN_GRUPO } from '../servicios/grupos';
import { invitarUsuario } from '../servicios/usuarios';

function exigirAdminPlataforma(s: Sesion) {
  if (!s.esAdminPlataforma) throw sinPermiso('Solo el admin de plataforma puede hacer esto');
}

const idParam = z.object({ grupoId: z.string().uuid() });

/**
 * Administración de plataforma (RF-001 a RF-004). El admin de plataforma ve solo nombre,
 * estado y cantidad de admins de cada grupo: nunca fichas (RN-18).
 */
export async function rutasPlataforma(app: FastifyInstance, deps: Dependencias) {
  app.get('/plataforma/grupos', async (req): Promise<GrupoDTO[]> => {
    exigirAdminPlataforma(sesionDe(req));
    const filas = await deps.db
      .selectFrom('grupos as g')
      .select(['g.id', 'g.nombre', 'g.activo'])
      .select((eb) =>
        eb
          .selectFrom('asignaciones as a')
          .innerJoin('roles as r', 'r.id', 'a.rol_id')
          .select(sql<number>`count(distinct a.usuario_id)::int`.as('n'))
          .whereRef('a.grupo_id', '=', 'g.id')
          .where('r.sistema', '=', ROL_ADMIN_GRUPO)
          .where('a.alcance', '=', 'grupo')
          .as('cantidad_admins'),
      )
      .orderBy('g.nombre')
      .execute();
    return filas.map((g) => ({ id: g.id, nombre: g.nombre, activo: g.activo, cantidadAdmins: g.cantidad_admins ?? 0 }));
  });

  app.post('/plataforma/grupos', async (req, reply) => {
    exigirAdminPlataforma(sesionDe(req));
    const { nombre } = z.object({ nombre: z.string().trim().min(1).max(200) }).parse(req.body);
    const id = await crearGrupo(deps.db, nombre);
    return reply.status(201).send({ id });
  });

  // RF-002: desactivar y reactivar no borra datos; solo corta el acceso.
  for (const [accion, activo] of [
    ['desactivar', false],
    ['reactivar', true],
  ] as const) {
    app.post(`/plataforma/grupos/:grupoId/${accion}`, async (req) => {
      exigirAdminPlataforma(sesionDe(req));
      const { grupoId } = idParam.parse(req.params);
      const r = await deps.db.updateTable('grupos').set({ activo }).where('id', '=', grupoId).executeTakeFirst();
      if (Number(r.numUpdatedRows) === 0) throw noEncontrado('El grupo no existe');
      return { ok: true };
    });
  }

  // RF-003
  app.post('/plataforma/grupos/:grupoId/admins', async (req, reply) => {
    exigirAdminPlataforma(sesionDe(req));
    const { grupoId } = idParam.parse(req.params);
    const datos = z
      .object({ nombre: z.string().trim().min(1).max(200), email: z.string().trim().toLowerCase().email() })
      .parse(req.body);
    const rolId = await rolAdminGrupo(deps.db, grupoId).catch(() => {
      throw noEncontrado('El grupo no existe');
    });
    const r = await invitarUsuario(deps, grupoId, { ...datos, rolId, alcance: 'grupo' });
    return reply.status(201).send(r);
  });
}
