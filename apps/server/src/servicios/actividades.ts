import {
  CODIGOS_ERROR,
  compararNombres,
  hoyAR,
  prevaleceRegistro,
  puede,
  puedeVerActividad,
  puedeVerSensibles,
  type ActividadDTO,
  type AsistenciaAnio,
  type InscripcionDTO,
  type Objetivo,
  type RegistroActividad,
  type ResultadoRegistro,
  type TipoActividadDTO,
  type UbicacionActividad,
} from '@scouttracker/shared';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { BaseDeDatos, Db, FilaActividad } from '../db';
import { ErrorHttp, noEncontrado, sinPermiso } from '../errores';
import type { Sesion } from './acceso';
import { objetivoFicha } from './fichas';

/** Objetivo para pedir permisos sobre la actividad misma (crear, editar, cancelar). */
export const objetivoActividad = (a: Pick<FilaActividad, 'grupo_id' | 'rama_id' | 'equipo_id'>): Objetivo => ({
  grupoId: a.grupo_id,
  ramaId: a.rama_id,
  equipoId: a.equipo_id,
});

export const ubicacionActividad = (a: FilaActividad): UbicacionActividad => ({
  grupoId: a.grupo_id,
  alcance: a.alcance,
  ramaId: a.rama_id,
  equipoId: a.equipo_id,
});

/** Carga una actividad de un grupo activo que el usuario puede ver (RN-19). */
export async function cargarActividad(db: Db, s: Sesion, id: string): Promise<FilaActividad> {
  const a = await db
    .selectFrom('actividades as a')
    .innerJoin('grupos as g', 'g.id', 'a.grupo_id')
    .selectAll('a')
    .select('g.activo as grupo_activo')
    .where('a.id', '=', id)
    .executeTakeFirst();
  if (!a) throw noEncontrado('La actividad no existe');
  if (!a.grupo_activo) throw new ErrorHttp(403, CODIGOS_ERROR.grupoDesactivado, 'El grupo está desactivado');
  const { grupo_activo: _, ...fila } = a;
  if (!puedeVerActividad(s.asignaciones, ubicacionActividad(fila))) throw sinPermiso('No tenés acceso a esta actividad');
  return fila;
}

export async function tiposDeGrupo(db: Db | Kysely<BaseDeDatos>, grupoId: string): Promise<TipoActividadDTO[]> {
  const filas = await db
    .selectFrom('tipos_actividad')
    .select(['id', 'nombre', 'color', 'requiere_autorizacion', 'activo'])
    .where('grupo_id', '=', grupoId)
    .orderBy('orden')
    .orderBy('nombre')
    .execute();
  return filas.map((t) => ({ id: t.id, nombre: t.nombre, color: t.color, requiereAutorizacion: t.requiere_autorizacion, activo: t.activo }));
}

/** RF-064: inscribe a los protagonistas activos del alcance de la actividad. */
export async function inscribirAlcance(trx: Transaction<BaseDeDatos>, a: FilaActividad): Promise<number> {
  let fichas = trx
    .selectFrom('fichas')
    .select(['id'])
    .where('grupo_id', '=', a.grupo_id)
    .where('estado', 'in', ['activa', 'incompleta']);
  if (a.alcance === 'rama') fichas = fichas.where('rama_id', '=', a.rama_id!);
  if (a.alcance === 'equipo') fichas = fichas.where('equipo_id', '=', a.equipo_id!);
  const ids = (await fichas.execute()).map((f) => f.id);
  if (ids.length === 0) return 0;
  await trx
    .insertInto('inscripciones')
    .values(ids.map((fichaId) => ({ actividad_id: a.id, ficha_id: fichaId, grupo_id: a.grupo_id })))
    .onConflict((oc) => oc.doNothing())
    .execute();
  return ids.length;
}

/**
 * Actividades de una rama que el usuario puede ver: las de la rama, las de sus equipos y las
 * del grupo (RN-19), que terminan después de `desde` y empiezan antes de `hasta`.
 */
export async function actividadesDeRama(
  db: Db,
  s: Sesion,
  rama: { id: string; grupo_id: string },
  rango: { desde: Date; hasta?: Date },
): Promise<FilaActividad[]> {
  let q = db
    .selectFrom('actividades')
    .selectAll()
    .where('grupo_id', '=', rama.grupo_id)
    .where((eb) => eb.or([eb('alcance', '=', 'grupo'), eb('rama_id', '=', rama.id)]))
    .where('fin', '>=', rango.desde);
  if (rango.hasta) q = q.where('inicio', '<', rango.hasta);
  const filas = await q.orderBy('inicio').execute();
  return filas.filter((a) => puedeVerActividad(s.asignaciones, ubicacionActividad(a)));
}

/**
 * Arma las actividades que ve el usuario. Las inscripciones se limitan a la rama indicada y a
 * las fichas que puede ver; la autorización solo va con el permiso de datos sensibles.
 * `soloVigentes` deja afuera las fichas archivadas o anonimizadas (para la vista sin conexión).
 */
export async function serializarActividades(
  db: Db,
  s: Sesion,
  filas: FilaActividad[],
  op: { ramaId: string | null; soloVigentes?: boolean },
): Promise<ActividadDTO[]> {
  if (filas.length === 0) return [];
  let q = db
    .selectFrom('inscripciones as i')
    .innerJoin('fichas as f', 'f.id', 'i.ficha_id')
    .leftJoin('archivos as ar', 'ar.id', 'i.autorizacion_archivo_id')
    .select([
      'i.actividad_id',
      'i.ficha_id',
      'i.confirmacion',
      'i.presente',
      'i.autorizacion',
      'i.autorizacion_fecha',
      'f.grupo_id',
      'f.rama_id',
      'f.equipo_id',
      'f.apellido',
      'f.nombre',
      'ar.nombre as archivo_nombre',
      'ar.mime as archivo_mime',
      'ar.tamano as archivo_tamano',
    ])
    .where('i.actividad_id', 'in', filas.map((a) => a.id));
  if (op.ramaId) q = q.where('f.rama_id', '=', op.ramaId);
  if (op.soloVigentes) q = q.where('f.estado', 'in', ['activa', 'incompleta']);
  const inscripciones = await q.execute();

  const porActividad = new Map<string, InscripcionDTO[]>();
  for (const i of inscripciones) {
    const o = objetivoFicha(i);
    if (!puede(s.asignaciones, 'padron', 'ver', o)) continue;
    const dto: InscripcionDTO = {
      fichaId: i.ficha_id,
      apellido: i.apellido,
      nombre: i.nombre,
      equipoId: i.equipo_id,
      confirmacion: i.confirmacion,
      presente: i.presente,
    };
    if (puedeVerSensibles(s.asignaciones, o)) {
      dto.autorizacion = {
        estado: i.autorizacion,
        fecha: i.autorizacion_fecha,
        archivo: i.archivo_nombre ? { nombre: i.archivo_nombre, mime: i.archivo_mime!, tamano: i.archivo_tamano! } : null,
      };
    }
    if (!porActividad.has(i.actividad_id)) porActividad.set(i.actividad_id, []);
    porActividad.get(i.actividad_id)!.push(dto);
  }
  return filas.map((a) => ({
    id: a.id,
    grupoId: a.grupo_id,
    tipoId: a.tipo_id,
    nombre: a.nombre,
    inicio: a.inicio.toISOString(),
    fin: a.fin.toISOString(),
    lugar: a.lugar,
    alcance: a.alcance,
    ramaId: a.rama_id,
    equipoId: a.equipo_id,
    canceladaEn: a.cancelada_en?.toISOString() ?? null,
    inscripciones: (porActividad.get(a.id) ?? []).sort(compararNombres),
  }));
}

/** Primer instante del año calendario en Argentina. */
const inicioDeAnio = (anio: number) => new Date(`${anio}-01-01T00:00:00-03:00`);

/**
 * RF-069: por ficha, actividades del año calendario ya terminadas (sin las canceladas) en las
 * que estuvo inscripta, y en cuántas estuvo presente.
 */
export async function asistenciaDelAnio(db: Db, fichaIds: string[], ahora: Date): Promise<Record<string, AsistenciaAnio>> {
  if (fichaIds.length === 0) return {};
  const anio = Number(hoyAR(ahora).slice(0, 4));
  const filas = await db
    .selectFrom('inscripciones as i')
    .innerJoin('actividades as a', 'a.id', 'i.actividad_id')
    .select((eb) => [
      'i.ficha_id',
      eb.fn.countAll<number>().as('total'),
      sql<number>`count(*) FILTER (WHERE i.presente)`.as('presentes'),
    ])
    .where('i.ficha_id', 'in', fichaIds)
    .where('a.cancelada_en', 'is', null)
    .where('a.fin', '<', ahora)
    .where('a.inicio', '>=', inicioDeAnio(anio))
    .where('a.inicio', '<', inicioDeAnio(anio + 1))
    .groupBy('i.ficha_id')
    .execute();
  return Object.fromEntries(filas.map((f) => [f.ficha_id, { presentes: Number(f.presentes), total: Number(f.total) }]));
}

/**
 * RF-057 / RN-08: aplica los registros de asistencia, confirmación y autorización que hizo un
 * dispositivo (con o sin conexión), en el orden en que se hicieron. Cada registro se resuelve
 * por separado: uno rechazado no impide aplicar los demás.
 */
export async function aplicarRegistros(db: Db, s: Sesion, registros: RegistroActividad[], ahora: Date): Promise<ResultadoRegistro[]> {
  const actividades = new Map<string, (FilaActividad & { requiere: boolean }) | null>();
  const ordenados = [...registros].sort((a, b) => a.en.localeCompare(b.en));
  const resultados = new Map<string, ResultadoRegistro>();

  for (const r of ordenados) {
    const rechazar = (motivo: string) => resultados.set(r.id, { id: r.id, estado: 'rechazado', motivo });
    if (!actividades.has(r.actividadId)) {
      const a = await db
        .selectFrom('actividades as a')
        .innerJoin('grupos as g', 'g.id', 'a.grupo_id')
        .innerJoin('tipos_actividad as t', 't.id', 'a.tipo_id')
        .selectAll('a')
        .select(['g.activo as grupo_activo', 't.requiere_autorizacion'])
        .where('a.id', '=', r.actividadId)
        .executeTakeFirst();
      const { grupo_activo, requiere_autorizacion, ...fila } = a ?? ({} as never);
      const visible = !!a && grupo_activo && puedeVerActividad(s.asignaciones, ubicacionActividad(fila));
      actividades.set(r.actividadId, visible ? { ...fila, requiere: requiere_autorizacion } : null);
    }
    const a = actividades.get(r.actividadId);
    if (!a) {
      rechazar('La actividad no existe o ya no tenés acceso');
      continue;
    }
    if (a.cancelada_en) {
      rechazar('La actividad está cancelada');
      continue;
    }
    if (r.campo === 'autorizacion' && !a.requiere) {
      rechazar('Este tipo de actividad no pide autorización');
      continue;
    }
    // La hora del dispositivo decide los conflictos (RN-08), pero no puede quedar en el futuro.
    const en = new Date(Math.min(new Date(r.en).getTime() || ahora.getTime(), ahora.getTime()));

    const resultado = await db.transaction().execute(async (trx): Promise<ResultadoRegistro> => {
      const i = await trx
        .selectFrom('inscripciones as i')
        .innerJoin('fichas as f', 'f.id', 'i.ficha_id')
        .select([
          'i.confirmacion',
          'i.confirmacion_en',
          'i.presente',
          'i.presente_en',
          'i.autorizacion',
          'i.autorizacion_en',
          'f.grupo_id',
          'f.rama_id',
          'f.equipo_id',
        ])
        .where('i.actividad_id', '=', a.id)
        .where('i.ficha_id', '=', r.fichaId)
        .forUpdate('i')
        .executeTakeFirst();
      if (!i) return { id: r.id, estado: 'rechazado', motivo: 'El protagonista no está inscripto en la actividad' };
      const o = objetivoFicha(i);
      if (!puede(s.asignaciones, 'actividades', 'editar', o)) {
        return { id: r.id, estado: 'rechazado', motivo: 'No tenés permiso para registrar en esta actividad' };
      }
      if (r.campo === 'autorizacion' && !puedeVerSensibles(s.asignaciones, o)) {
        return { id: r.id, estado: 'rechazado', motivo: 'Registrar autorizaciones requiere el permiso de datos sensibles' };
      }
      const cambio = { en: en.toISOString(), anterior: r.anterior, valor: r.valor };
      const actualizar = trx.updateTable('inscripciones').where('actividad_id', '=', a.id).where('ficha_id', '=', r.fichaId);
      if (r.campo === 'presente') {
        if (!prevaleceRegistro('presente', { valor: i.presente, en: i.presente_en?.toISOString() ?? null }, cambio)) {
          return { id: r.id, estado: 'descartado', motivo: 'Otro educador lo marcó presente' };
        }
        await actualizar.set({ presente: r.valor, presente_en: en }).execute();
      } else if (r.campo === 'confirmacion') {
        if (!prevaleceRegistro('confirmacion', { valor: i.confirmacion, en: i.confirmacion_en?.toISOString() ?? null }, cambio)) {
          return { id: r.id, estado: 'descartado', motivo: 'Otro educador la cambió después' };
        }
        await actualizar.set({ confirmacion: r.valor, confirmacion_en: en }).execute();
      } else {
        if (!prevaleceRegistro('autorizacion', { valor: i.autorizacion, en: i.autorizacion_en?.toISOString() ?? null }, cambio)) {
          return { id: r.id, estado: 'descartado', motivo: 'Otro educador la cambió después' };
        }
        const fecha = r.valor === 'presentada' ? (r.fecha ?? hoyAR(en)) : null;
        await actualizar.set({ autorizacion: r.valor, autorizacion_fecha: fecha, autorizacion_en: en }).execute();
      }
      return { id: r.id, estado: 'aplicado' };
    });
    resultados.set(r.id, resultado);
  }
  return registros.map((r) => resultados.get(r.id)!);
}
