import {
  asignacionesEnRama,
  permisosEfectivos,
  puede,
  puedeVerSensibles,
  sanearPermisos,
  type Accion,
  type AsignacionConRol,
  type Contexto,
  type Modulo,
  type Objetivo,
  type RespuestaYo,
} from '@scouttracker/shared';
import type { Db } from '../db';
import { sinPermiso } from '../errores';

export interface AsignacionCargada extends AsignacionConRol {
  id: string;
  rolId: string;
  rolNombre: string;
}

export interface Sesion {
  sesionId: string;
  usuarioId: string;
  nombre: string;
  email: string;
  esAdminPlataforma: boolean;
  /** Solo de grupos activos donde el usuario está activo (RF-002, RF-014). */
  asignaciones: AsignacionCargada[];
}

export async function cargarAsignaciones(db: Db, usuarioId: string): Promise<AsignacionCargada[]> {
  const filas = await db
    .selectFrom('asignaciones as a')
    .innerJoin('roles as r', 'r.id', 'a.rol_id')
    .innerJoin('grupos as g', 'g.id', 'a.grupo_id')
    .innerJoin('miembros as m', (j) => j.onRef('m.grupo_id', '=', 'a.grupo_id').onRef('m.usuario_id', '=', 'a.usuario_id'))
    .select([
      'a.id',
      'a.grupo_id',
      'a.alcance',
      'a.rama_id',
      'a.equipo_id',
      'r.id as rol_id',
      'r.nombre as rol_nombre',
      'r.permisos',
      'r.ver_sensibles',
    ])
    .where('a.usuario_id', '=', usuarioId)
    .where('g.activo', '=', true)
    .where('m.activo', '=', true)
    .execute();
  return filas.map((f) => ({
    id: f.id,
    grupoId: f.grupo_id,
    alcance: f.alcance,
    ramaId: f.rama_id,
    equipoId: f.equipo_id,
    rolId: f.rol_id,
    rolNombre: f.rol_nombre,
    rol: { permisos: sanearPermisos(f.permisos), verSensibles: f.ver_sensibles },
  }));
}

export function exigir(s: Sesion, modulo: Modulo, accion: Accion, o: Objetivo, mensaje?: string): void {
  if (!puede(s.asignaciones, modulo, accion, o)) throw sinPermiso(mensaje);
}

export function verSensibles(s: Sesion, o: Objetivo): boolean {
  return puedeVerSensibles(s.asignaciones, o);
}

/** Admin de grupo: Administración con alcance de grupo. */
export function esAdminGrupo(s: Sesion, grupoId: string, accion: Accion = 'editar'): boolean {
  return puede(s.asignaciones, 'administracion', accion, { grupoId });
}

export function exigirAdminGrupo(s: Sesion, grupoId: string, accion: Accion = 'editar'): void {
  if (!esAdminGrupo(s, grupoId, accion)) throw sinPermiso('Solo el admin del grupo puede hacer esto');
}

/** Administración de una rama: alcance de grupo o de esa rama. */
export function exigirAdminRama(s: Sesion, grupoId: string, ramaId: string, accion: Accion = 'editar'): void {
  if (!puede(s.asignaciones, 'administracion', accion, { grupoId, ramaId })) {
    throw sinPermiso('No tenés permiso de administración en esta rama');
  }
}

/** RF-021: grupos y ramas en los que el usuario puede trabajar, con sus permisos. */
export async function calcularContextos(db: Db, s: Sesion): Promise<Contexto[]> {
  const grupoIds = [...new Set(s.asignaciones.map((a) => a.grupoId))];
  if (grupoIds.length === 0) return [];
  const ramas = await db
    .selectFrom('ramas as r')
    .innerJoin('grupos as g', 'g.id', 'r.grupo_id')
    .select(['r.id', 'r.nombre', 'r.comunidad', 'r.grupo_id', 'g.nombre as grupo_nombre'])
    .where('r.grupo_id', 'in', grupoIds)
    .orderBy('g.nombre')
    .orderBy('r.nombre')
    .execute();
  const equipos = await db.selectFrom('equipos').select(['id', 'rama_id']).where('grupo_id', 'in', grupoIds).execute();
  const equiposPorRama = new Map<string, Set<string>>();
  for (const e of equipos) {
    if (!equiposPorRama.has(e.rama_id)) equiposPorRama.set(e.rama_id, new Set());
    equiposPorRama.get(e.rama_id)!.add(e.id);
  }
  const contextos: Contexto[] = [];
  for (const r of ramas) {
    const asigs = asignacionesEnRama(s.asignaciones, r.grupo_id, r.id, equiposPorRama.get(r.id) ?? new Set());
    if (asigs.length === 0) continue;
    const soloEquipo = asigs.every((a) => a.alcance === 'equipo');
    const { permisos, verSensibles } = permisosEfectivos(asigs);
    contextos.push({
      grupoId: r.grupo_id,
      grupoNombre: r.grupo_nombre,
      ramaId: r.id,
      ramaNombre: r.nombre,
      comunidad: r.comunidad,
      soloEquipos: soloEquipo ? [...new Set(asigs.map((a) => a.equipoId!))] : null,
      permisos,
      verSensibles,
    });
  }
  return contextos;
}

export async function respuestaYo(db: Db, s: Sesion): Promise<RespuestaYo> {
  const contextos = await calcularContextos(db, s);
  const grupoIds = [...new Set(s.asignaciones.filter((a) => a.alcance === 'grupo').map((a) => a.grupoId))].filter((g) =>
    esAdminGrupo(s, g, 'ver'),
  );
  const grupos = grupoIds.length
    ? await db.selectFrom('grupos').select(['id', 'nombre']).where('id', 'in', grupoIds).orderBy('nombre').execute()
    : [];
  return {
    usuario: { id: s.usuarioId, nombre: s.nombre, email: s.email, esAdminPlataforma: s.esAdminPlataforma },
    contextos,
    gruposAdministrables: grupos.map((g) => ({ grupoId: g.id, grupoNombre: g.nombre })),
    ramasAdministrables: contextos
      .filter((c) => puede(s.asignaciones, 'administracion', 'ver', { grupoId: c.grupoId, ramaId: c.ramaId }))
      .map((c) => c.ramaId),
  };
}
