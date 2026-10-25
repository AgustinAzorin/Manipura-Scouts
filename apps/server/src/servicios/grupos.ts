import { TODOS_LOS_PERMISOS, type Permisos } from '@scouttracker/shared';
import { json, type Db } from '../db';

export const ROL_ADMIN_GRUPO = 'adminGrupo';

/** Roles con los que arranca cada grupo. El admin de grupo puede editarlos o borrarlos (salvo el suyo). */
const ROLES_INICIALES: { nombre: string; permisos: Permisos; verSensibles: boolean; sistema: string | null }[] = [
  { nombre: 'Admin de grupo', permisos: TODOS_LOS_PERMISOS, verSensibles: true, sistema: ROL_ADMIN_GRUPO },
  {
    nombre: 'Jefe de rama',
    permisos: {
      padron: ['ver', 'crear', 'editar', 'eliminar'],
      documentos: ['ver', 'crear', 'editar', 'eliminar'],
      cuotas: ['ver', 'crear', 'editar', 'eliminar'],
      actividades: ['ver', 'crear', 'editar', 'eliminar'],
      calendario: ['ver', 'crear', 'editar', 'eliminar'],
      fichaActividad: ['ver', 'crear', 'editar', 'eliminar'],
      graficos: ['ver'],
      exportacion: ['ver'],
    },
    verSensibles: true,
    sistema: null,
  },
  {
    nombre: 'Educador',
    permisos: {
      padron: ['ver', 'crear', 'editar'],
      documentos: ['ver', 'crear', 'editar'],
      cuotas: ['ver', 'editar'],
      actividades: ['ver', 'crear', 'editar'],
      calendario: ['ver', 'crear', 'editar'],
      fichaActividad: ['ver', 'crear', 'editar'],
      graficos: ['ver'],
    },
    verSensibles: true,
    sistema: null,
  },
  {
    nombre: 'Solo lectura',
    permisos: { padron: ['ver'], actividades: ['ver'], calendario: ['ver'], fichaActividad: ['ver'], graficos: ['ver'] },
    verSensibles: false,
    sistema: null,
  },
];

/** RF-001: crea un grupo activo, sin usuarios ni fichas, con sus roles iniciales. */
export async function crearGrupo(db: Db, nombre: string): Promise<string> {
  return db.transaction().execute(async (trx) => {
    const g = await trx.insertInto('grupos').values({ nombre }).returning('id').executeTakeFirstOrThrow();
    await trx
      .insertInto('roles')
      .values(
        ROLES_INICIALES.map((r) => ({
          grupo_id: g.id,
          nombre: r.nombre,
          permisos: json(r.permisos),
          ver_sensibles: r.verSensibles,
          sistema: r.sistema,
        })),
      )
      .execute();
    return g.id;
  });
}

export async function rolAdminGrupo(db: Db, grupoId: string): Promise<string> {
  const r = await db
    .selectFrom('roles')
    .select('id')
    .where('grupo_id', '=', grupoId)
    .where('sistema', '=', ROL_ADMIN_GRUPO)
    .executeTakeFirstOrThrow();
  return r.id;
}

/** Cantidad de admins de grupo activos (asignación del rol de sistema con alcance de grupo). */
export async function contarAdminsActivos(db: Db, grupoId: string, excepto?: { usuarioId?: string; asignacionId?: string }) {
  let q = db
    .selectFrom('asignaciones as a')
    .innerJoin('roles as r', 'r.id', 'a.rol_id')
    .innerJoin('miembros as m', (j) => j.onRef('m.usuario_id', '=', 'a.usuario_id').onRef('m.grupo_id', '=', 'a.grupo_id'))
    .innerJoin('usuarios as u', 'u.id', 'a.usuario_id')
    .select((eb) => eb.fn.count<number>('a.usuario_id').distinct().as('n'))
    .where('a.grupo_id', '=', grupoId)
    .where('a.alcance', '=', 'grupo')
    .where('r.sistema', '=', ROL_ADMIN_GRUPO)
    .where('m.activo', '=', true);
  if (excepto?.usuarioId) q = q.where('a.usuario_id', '!=', excepto.usuarioId);
  if (excepto?.asignacionId) q = q.where('a.id', '!=', excepto.asignacionId);
  const r = await q.executeTakeFirstOrThrow();
  return Number(r.n);
}
