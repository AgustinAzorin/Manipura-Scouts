import { sql } from 'kysely';
import type { Dependencias } from '../app';
import { anonimizarVencidas } from './privacidad';

/** RN-20 */
export const DIAS_EQUIPO_DESACTIVADO = 90;

/**
 * RF-008 / RN-20: elimina los equipos desactivados hace 90 días. Sus integrantes quedan
 * "Sin equipo" (y pierden la función de cordi); el cambio queda en el historial. Sus actividades
 * pasan a la rama para no perder la asistencia (RN-12).
 */
export async function eliminarEquiposVencidos(deps: Dependencias): Promise<number> {
  const limite = new Date(deps.ahora().getTime() - DIAS_EQUIPO_DESACTIVADO * 24 * 60 * 60 * 1000);
  const equipos = await deps.db
    .selectFrom('equipos')
    .select(['id', 'nombre', 'grupo_id', 'logo_archivo_id'])
    .where('activo', '=', false)
    .where('desactivado_en', '<=', limite)
    .execute();
  for (const e of equipos) {
    await deps.db.transaction().execute(async (trx) => {
      const integrantes = await trx
        .updateTable('fichas')
        .set({ equipo_id: null, cordi: null, version: sql<number>`version + 1`, actualizado_en: new Date() })
        .where('equipo_id', '=', e.id)
        .returning(['id', 'version'])
        .execute();
      if (integrantes.length > 0) {
        await trx
          .insertInto('historial')
          .values(
            integrantes.map((f) => ({
              grupo_id: e.grupo_id,
              ficha_id: f.id,
              usuario_id: null,
              campo: 'equipoId',
              valor_anterior: e.nombre,
              valor_nuevo: null,
              version: f.version,
            })),
          )
          .execute();
      }
      await trx.updateTable('actividades').set({ alcance: 'rama', equipo_id: null }).where('equipo_id', '=', e.id).execute();
      await trx.deleteFrom('equipos').where('id', '=', e.id).execute();
    });
    if (e.logo_archivo_id) {
      const a = await deps.db.deleteFrom('archivos').where('id', '=', e.logo_archivo_id).returning('clave').executeTakeFirst();
      if (a) await deps.almacenamiento.borrar(a.clave);
    }
  }
  return equipos.length;
}

/** Limpieza de sesiones y enlaces vencidos. */
export async function limpiarVencidos(deps: Dependencias): Promise<void> {
  const ahora = deps.ahora();
  await deps.db.deleteFrom('sesiones').where('vence_en', '<', ahora).execute();
  await deps.db.deleteFrom('enlaces').where('vence_en', '<', ahora).execute();
}

/** Tareas diarias. Se ejecutan al arrancar el servidor y luego cada hora (son idempotentes). */
export async function ejecutarTareas(deps: Dependencias) {
  const equipos = await eliminarEquiposVencidos(deps);
  const anonimizadas = await anonimizarVencidas(deps);
  await limpiarVencidos(deps);
  return { equipos, anonimizadas };
}
