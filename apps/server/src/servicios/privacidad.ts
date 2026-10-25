import { calcularEdad, estadoTada, hoyAR, partesFecha, sumarAnios } from '@scouttracker/shared';
import { sql } from 'kysely';
import type { Dependencias } from '../app';
import { auditar } from './auditoria';

/** RN-12 */
export const ANIOS_HASTA_ANONIMIZAR = 2;

/** Borra los archivos de una ficha (documentos y autorizaciones de actividades) del almacenamiento y de la base. */
async function borrarArchivosDeFicha(deps: Dependencias, fichaId: string): Promise<number> {
  const archivos = await deps.db
    .selectFrom('documentos as d')
    .innerJoin('archivos as a', 'a.id', 'd.archivo_id')
    .select(['a.id', 'a.clave'])
    .where('d.ficha_id', '=', fichaId)
    .union(
      deps.db
        .selectFrom('inscripciones as i')
        .innerJoin('archivos as a', 'a.id', 'i.autorizacion_archivo_id')
        .select(['a.id', 'a.clave'])
        .where('i.ficha_id', '=', fichaId),
    )
    .execute();
  for (const a of archivos) await deps.almacenamiento.borrar(a.clave);
  if (archivos.length > 0) await deps.db.deleteFrom('archivos').where('id', 'in', archivos.map((a) => a.id)).execute();
  return archivos.length;
}

/**
 * RF-118: suprime de forma definitiva la ficha, sus documentos, su historial y sus archivos.
 * Queda solo el registro de la supresión, sin datos personales (RNF-045).
 */
export async function suprimirFicha(deps: Dependencias, fichaId: string, usuarioId: string): Promise<void> {
  const f = await deps.db.selectFrom('fichas').select(['id', 'grupo_id']).where('id', '=', fichaId).executeTakeFirstOrThrow();
  const archivos = await borrarArchivosDeFicha(deps, fichaId);
  await deps.db.deleteFrom('fichas').where('id', '=', fichaId).execute();
  await auditar(deps.db, { accion: 'supresion', grupoId: f.grupo_id, usuarioId, fichaId, detalle: { archivos } });
}

/** Campos del historial que contienen datos personales y se borran al anonimizar. */
const CAMPOS_HISTORIAL_PERSONALES = [
  'apellido',
  'nombre',
  'dni',
  'fechaNacimiento',
  'religionId',
  'telEmergencia1',
  'telEmergencia2',
  'telPropio',
  'rolComunidad',
  'mistica',
];

/**
 * RF-117 / RN-12: anonimiza las fichas archivadas hace 2 años o más. Conserva rama, año de
 * nacimiento, equipo, etapa, promesa, elemento, estado de TADA y asistencia; borra el resto,
 * los archivos y las autorizaciones de actividades.
 */
export async function anonimizarVencidas(deps: Dependencias): Promise<number> {
  const ahora = deps.ahora();
  const hoy = hoyAR(ahora);
  const limite = new Date(`${sumarAnios(hoy, -ANIOS_HASTA_ANONIMIZAR)}T23:59:59.999-03:00`);
  const vencidas = await deps.db
    .selectFrom('fichas')
    .select(['id', 'grupo_id', 'fecha_nacimiento', 'tiene_tada', 'archivada_en'])
    .where('estado', '=', 'archivada')
    .where('archivada_en', '<=', limite)
    .execute();
  for (const f of vencidas) {
    const edadAlArchivar = f.fecha_nacimiento ? calcularEdad(f.fecha_nacimiento, hoyAR(f.archivada_en!)) : null;
    await borrarArchivosDeFicha(deps, f.id);
    await deps.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('documentos').where('ficha_id', '=', f.id).execute();
      await trx
        .updateTable('inscripciones')
        .set({ autorizacion: 'noPresentada', autorizacion_fecha: null, autorizacion_en: null, autorizacion_archivo_id: null })
        .where('ficha_id', '=', f.id)
        .execute();
      await trx
        .deleteFrom('historial')
        .where('ficha_id', '=', f.id)
        .where((eb) => eb.or([eb('campo', 'in', CAMPOS_HISTORIAL_PERSONALES), eb('campo', 'like', 'doc.%'), eb('campo', 'like', 'archivo.%'), eb('campo', 'like', 'cp.%')]))
        .execute();
      await trx
        .updateTable('fichas')
        .set({
          estado: 'anonimizada',
          anonimizada_en: ahora,
          anio_nacimiento: f.fecha_nacimiento ? partesFecha(f.fecha_nacimiento).anio : null,
          estado_tada_final: estadoTada(edadAlArchivar, f.tiene_tada),
          apellido: null,
          nombre: null,
          dni: null,
          fecha_nacimiento: null,
          religion_id: null,
          categoria_miembro_id: null,
          tel_emergencia_1: null,
          tel_emergencia_2: null,
          tel_propio: null,
          raid_id: null,
          cordi: null,
          guardian_id: null,
          rol_comunidad: null,
          mistica: null,
          ingreso_movimiento_id: null,
          fecha_revision_diario: null,
          cuotas: '{}',
          campos_propios: '{}',
          incompleta_motivos: [],
          version: sql<number>`version + 1`,
        })
        .where('id', '=', f.id)
        .execute();
    });
    await auditar(deps.db, { accion: 'anonimizacion', grupoId: f.grupo_id, usuarioId: null, fichaId: f.id });
  }
  return vencidas.length;
}
