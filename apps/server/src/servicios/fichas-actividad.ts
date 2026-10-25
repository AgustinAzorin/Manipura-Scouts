import {
  CODIGOS_ERROR,
  puede,
  type AnexoDTO,
  type CabeceraDTO,
  type FichaActividadDTO,
  type Objetivo,
  type UsuarioRamaDTO,
} from '@scouttracker/shared';
import type { Kysely } from 'kysely';
import type { BaseDeDatos, Db, FilaActividad, FilaAnexo, FilaFichaActividad } from '../db';
import { ErrorHttp, noEncontrado, sinPermiso } from '../errores';
import type { Sesion } from './acceso';

export interface FichaCargada {
  ficha: FilaFichaActividad;
  actividad: FilaActividad;
}

/**
 * Objetivo para los permisos del módulo Ficha de Actividad: la rama de la ficha y, si la
 * actividad es de un equipo, ese equipo (así una asignación de equipo alcanza a sus fichas).
 */
export const objetivoFichaActividad = ({ ficha, actividad }: FichaCargada): Objetivo => ({
  grupoId: ficha.grupo_id,
  ramaId: ficha.rama_id,
  equipoId: actividad.equipo_id,
});

export async function cargarFichaActividad(db: Db, id: string): Promise<FichaCargada> {
  const ficha = await db.selectFrom('fichas_actividad').selectAll().where('id', '=', id).executeTakeFirst();
  if (!ficha) throw noEncontrado('La Ficha de Actividad no existe');
  const actividad = await db
    .selectFrom('actividades as a')
    .innerJoin('grupos as g', 'g.id', 'a.grupo_id')
    .selectAll('a')
    .select('g.activo as grupo_activo')
    .where('a.id', '=', ficha.actividad_id)
    .executeTakeFirstOrThrow();
  if (!actividad.grupo_activo) throw new ErrorHttp(403, CODIGOS_ERROR.grupoDesactivado, 'El grupo está desactivado');
  const { grupo_activo: _, ...fila } = actividad;
  return { ficha, actividad: fila };
}

/** Ver la ficha: permiso de ver en el módulo, o ser el asignado de alguno de sus anexos (RF-095). */
export async function exigirVerFicha(db: Db, s: Sesion, f: FichaCargada): Promise<void> {
  if (puede(s.asignaciones, 'fichaActividad', 'ver', objetivoFichaActividad(f))) return;
  const asignado = await db.selectFrom('anexos').select('id').where('ficha_actividad_id', '=', f.ficha.id).where('asignado_a', '=', s.usuarioId).executeTakeFirst();
  if (!asignado) throw sinPermiso('No tenés acceso a esta Ficha de Actividad');
}

export function exigirEditarFicha(s: Sesion, f: FichaCargada): void {
  if (!puede(s.asignaciones, 'fichaActividad', 'editar', objetivoFichaActividad(f))) throw sinPermiso('No tenés permiso para editar esta Ficha de Actividad');
}

/** RF-095: completa el anexo el asignado o quien puede editar en Ficha de Actividad. */
export const puedeEditarAnexo = (s: Sesion, f: FichaCargada, a: Pick<FilaAnexo, 'asignado_a'>) =>
  a.asignado_a === s.usuarioId || puede(s.asignaciones, 'fichaActividad', 'editar', objetivoFichaActividad(f));

/**
 * Usuarios activos que trabajan en la rama: los asignados a la rama, a uno de sus equipos o al
 * grupo entero. Son los que se pueden elegir como responsables o para completar un anexo.
 */
export async function usuariosDeRama(db: Db | Kysely<BaseDeDatos>, grupoId: string, ramaId: string): Promise<UsuarioRamaDTO[]> {
  const filas = await db
    .selectFrom('asignaciones as a')
    .innerJoin('usuarios as u', 'u.id', 'a.usuario_id')
    .innerJoin('miembros as m', (j) => j.onRef('m.usuario_id', '=', 'a.usuario_id').onRef('m.grupo_id', '=', 'a.grupo_id'))
    .select(['u.id', 'u.nombre'])
    .distinct()
    .where('a.grupo_id', '=', grupoId)
    .where('m.activo', '=', true)
    .where((eb) => eb.or([eb('a.alcance', '=', 'grupo'), eb('a.rama_id', '=', ramaId)]))
    .orderBy('u.nombre')
    .execute();
  return filas;
}

/** RF-088: la cabecera de la rama; lo que no se configuró sale del grupo y de la rama. */
export async function cabeceraDeRama(db: Db, ramaId: string): Promise<CabeceraDTO> {
  const r = await db
    .selectFrom('ramas as r')
    .innerJoin('grupos as g', 'g.id', 'r.grupo_id')
    .leftJoin('cabeceras_ficha as c', 'c.rama_id', 'r.id')
    .select(['r.id', 'r.nombre', 'r.comunidad', 'g.nombre as grupo', 'c.nombre_grupo', 'c.nombre_comunidad', 'c.logo_archivo_id', 'c.educadores'])
    .where('r.id', '=', ramaId)
    .executeTakeFirstOrThrow();
  return {
    ramaId: r.id,
    nombreGrupo: r.nombre_grupo || r.grupo,
    nombreComunidad: r.nombre_comunidad || r.comunidad || r.nombre,
    logo: r.logo_archivo_id,
    educadores: r.educadores ?? [],
  };
}

export async function equiposActivos(db: Db, ramaId: string): Promise<number> {
  const r = await db.selectFrom('equipos').select((eb) => eb.fn.countAll<number>().as('n')).where('rama_id', '=', ramaId).where('activo', '=', true).executeTakeFirstOrThrow();
  return Number(r.n);
}

export function serializarAnexo(a: FilaAnexo, usuarios: UsuarioRamaDTO[], nombres: Map<string, string>, puedeEditar: boolean): AnexoDTO {
  return {
    id: a.id,
    numero: a.numero,
    asignadoA: a.asignado_a ? (usuarios.find((u) => u.id === a.asignado_a) ?? { id: a.asignado_a, nombre: nombres.get(a.asignado_a) ?? 'Usuario sin acceso' }) : null,
    completo: a.completo,
    actualizadoEn: a.actualizado_en.toISOString(),
    puedeEditar,
    titulo: a.titulo,
    categoriaId: a.categoria_id,
    edadDesde: a.edad_desde,
    edadHasta: a.edad_hasta,
    participantes: a.participantes,
    duracionMinutos: a.duracion_minutos,
    espacio: a.espacio,
    educadores: a.educadores,
    equipos: a.equipos,
    motivacion: a.motivacion,
    objetivos: a.objetivos,
    areas: a.areas,
    materiales: a.materiales,
    desarrollo: a.desarrollo,
  };
}

export async function serializarFichaActividad(db: Db, s: Sesion, f: FichaCargada): Promise<FichaActividadDTO> {
  const { ficha, actividad } = f;
  const [cabecera, usuarios, anexos, categorias, equipos, pdf] = await Promise.all([
    cabeceraDeRama(db, ficha.rama_id),
    usuariosDeRama(db, ficha.grupo_id, ficha.rama_id),
    db.selectFrom('anexos').selectAll().where('ficha_actividad_id', '=', ficha.id).orderBy('numero').execute(),
    db
      .selectFrom('catalogo_valores')
      .select(['id', 'nombre', 'activo'])
      .where('rama_id', '=', ficha.rama_id)
      .where('catalogo', '=', 'categoriaAnexo')
      .orderBy('orden')
      .orderBy('nombre')
      .execute(),
    equiposActivos(db, ficha.rama_id),
    ficha.pdf_archivo_id ? db.selectFrom('archivos').select('tamano').where('id', '=', ficha.pdf_archivo_id).executeTakeFirst() : undefined,
  ]);
  // Asignados que ya no trabajan en la rama: se muestran igual con su nombre.
  const otros = [...new Set(anexos.map((a) => a.asignado_a).filter((id): id is string => !!id && !usuarios.some((u) => u.id === id)))];
  const nombres = new Map(
    otros.length ? (await db.selectFrom('usuarios').select(['id', 'nombre']).where('id', 'in', otros).execute()).map((u) => [u.id, u.nombre]) : [],
  );
  const o = objetivoFichaActividad(f);
  const editar = puede(s.asignaciones, 'fichaActividad', 'editar', o);
  return {
    id: ficha.id,
    grupoId: ficha.grupo_id,
    ramaId: ficha.rama_id,
    estado: ficha.estado,
    actividad: { id: actividad.id, nombre: actividad.nombre, inicio: actividad.inicio.toISOString(), fin: actividad.fin.toISOString(), lugar: actividad.lugar },
    cabecera,
    diagnostico: ficha.diagnostico,
    porQue: ficha.por_que,
    aQueResponde: ficha.a_que_responde,
    dondeNecesidad: ficha.donde_necesidad,
    porQueLugar: ficha.por_que_lugar,
    objetivosEducativos: ficha.objetivos_educativos,
    objetivosDirigente: ficha.objetivos_dirigente,
    areas: ficha.areas,
    grilla: ficha.grilla,
    anexos: anexos.map((a) => serializarAnexo(a, usuarios, nombres, editar || a.asignado_a === s.usuarioId)),
    pdf: pdf && ficha.pdf_generado_en ? { final: ficha.pdf_final, generadoEn: ficha.pdf_generado_en.toISOString(), tamano: pdf.tamano } : null,
    pdfDesactualizado: !!ficha.pdf_generado_en && ficha.actualizado_en.getTime() > ficha.pdf_generado_en.getTime(),
    usuariosRama: usuarios,
    categorias,
    equiposActivos: equipos,
    permisos: { editar, eliminar: puede(s.asignaciones, 'fichaActividad', 'eliminar', o) },
  };
}

/** Estados de la sección 3.3: cualquier cambio vuelve la ficha a "en carga". */
export async function marcarEditada(db: Db | Kysely<BaseDeDatos>, fichaId: string, ahora: Date): Promise<void> {
  await db.updateTable('fichas_actividad').set({ estado: 'enCarga', actualizado_en: ahora }).where('id', '=', fichaId).execute();
}
