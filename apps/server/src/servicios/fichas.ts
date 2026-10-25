import {
  CAMPOS_FICHA,
  CAMPOS_SENSIBLES,
  CATALOGOS,
  CODIGOS_ERROR,
  CONCEPTOS_CUOTA,
  DEF_CAMPO,
  DEF_DOCUMENTO,
  DEF_DOCUMENTOS,
  NOMBRE_CONCEPTO_CUOTA,
  NOMBRE_CORDI,
  NOMBRE_ESTADO_CUOTA,
  NOMBRE_ESTADO_DOCUMENTO,
  formatearFecha,
  puede,
  puedeVerSensibles,
  sanearCuotas,
  type CampoFicha,
  type CampoPropioDef,
  type CambioHistorialDTO,
  type Catalogo,
  type DatosFicha,
  type DocumentoDTO,
  type EstadoDocumento,
  type FichaDTO,
  type Objetivo,
  type RamaConfigDTO,
  type TipoDocumento,
} from '@scouttracker/shared';
import type { Kysely } from 'kysely';
import type { BaseDeDatos, Db, FilaFicha } from '../db';
import { ErrorHttp, noEncontrado } from '../errores';
import type { Sesion } from './acceso';

export const COLUMNA: Record<CampoFicha, keyof FilaFicha> = {
  apellido: 'apellido',
  nombre: 'nombre',
  dni: 'dni',
  fechaNacimiento: 'fecha_nacimiento',
  religionId: 'religion_id',
  categoriaMiembroId: 'categoria_miembro_id',
  telEmergencia1: 'tel_emergencia_1',
  telEmergencia2: 'tel_emergencia_2',
  telPropio: 'tel_propio',
  equipoId: 'equipo_id',
  promesaId: 'promesa_id',
  etapaId: 'etapa_id',
  elementoId: 'elemento_id',
  raidId: 'raid_id',
  cordi: 'cordi',
  guardianId: 'guardian_id',
  rolComunidad: 'rol_comunidad',
  tieneTada: 'tiene_tada',
  mistica: 'mistica',
  ingresoMovimientoId: 'ingreso_movimiento_id',
  fechaRevisionDiario: 'fecha_revision_diario',
};

export interface Rama {
  id: string;
  grupo_id: string;
  nombre: string;
  comunidad: string | null;
  campos_ocultos: string[];
}

/** Carga una rama de un grupo activo; corta con 404 o GRUPO_DESACTIVADO. */
export async function cargarRama(db: Db, ramaId: string): Promise<Rama> {
  const r = await db
    .selectFrom('ramas as r')
    .innerJoin('grupos as g', 'g.id', 'r.grupo_id')
    .select(['r.id', 'r.grupo_id', 'r.nombre', 'r.comunidad', 'r.campos_ocultos', 'g.activo'])
    .where('r.id', '=', ramaId)
    .executeTakeFirst();
  if (!r) throw noEncontrado('La rama no existe');
  if (!r.activo) throw new ErrorHttp(403, CODIGOS_ERROR.grupoDesactivado, 'El grupo está desactivado');
  return r;
}

export async function cargarFicha(db: Db, fichaId: string): Promise<FilaFicha> {
  const f = await db
    .selectFrom('fichas as f')
    .innerJoin('grupos as g', 'g.id', 'f.grupo_id')
    .selectAll('f')
    .select('g.activo as grupo_activo')
    .where('f.id', '=', fichaId)
    .executeTakeFirst();
  if (!f) throw noEncontrado('La ficha no existe');
  if (!f.grupo_activo) throw new ErrorHttp(403, CODIGOS_ERROR.grupoDesactivado, 'El grupo está desactivado');
  const { grupo_activo: _, ...fila } = f;
  return fila;
}

export const objetivoFicha = (f: Pick<FilaFicha, 'grupo_id' | 'rama_id' | 'equipo_id'>): Objetivo => ({
  grupoId: f.grupo_id,
  ramaId: f.rama_id,
  equipoId: f.equipo_id,
});

export async function camposPropiosDeRama(db: Db | Kysely<BaseDeDatos>, ramaId: string): Promise<CampoPropioDef[]> {
  const filas = await db
    .selectFrom('campos_propios')
    .select(['id', 'nombre', 'tipo', 'seccion', 'sensible', 'opciones', 'activo'])
    .where('rama_id', '=', ramaId)
    .orderBy('orden')
    .orderBy('creado_en')
    .execute();
  return filas.map((c) => ({ ...c, seccion: c.seccion as CampoPropioDef['seccion'] }));
}

export async function configRama(db: Db, rama: Rama): Promise<RamaConfigDTO> {
  const [catalogos, equipos, camposPropios] = await Promise.all([
    db
      .selectFrom('catalogo_valores')
      .select(['id', 'catalogo', 'nombre', 'activo', 'orden', 'logo_archivo_id', 'es_adulto'])
      .where('rama_id', '=', rama.id)
      .orderBy('catalogo')
      .orderBy('orden')
      .orderBy('nombre')
      .execute(),
    db
      .selectFrom('equipos')
      .select(['id', 'nombre', 'activo', 'desactivado_en', 'logo_archivo_id'])
      .where('rama_id', '=', rama.id)
      .orderBy('nombre')
      .execute(),
    camposPropiosDeRama(db, rama.id),
  ]);
  return {
    id: rama.id,
    grupoId: rama.grupo_id,
    nombre: rama.nombre,
    comunidad: rama.comunidad,
    camposOcultos: rama.campos_ocultos.filter((c): c is CampoFicha => (CAMPOS_FICHA as readonly string[]).includes(c)),
    catalogos: catalogos.map((c) => ({
      id: c.id,
      catalogo: c.catalogo as Catalogo,
      nombre: c.nombre,
      activo: c.activo,
      orden: c.orden,
      logo: c.logo_archivo_id,
      esAdulto: c.es_adulto,
    })),
    equipos: equipos.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      activo: e.activo,
      desactivadoEn: e.desactivado_en?.toISOString() ?? null,
      logo: e.logo_archivo_id,
    })),
    camposPropios,
  };
}

export interface FilaDocumento {
  ficha_id: string;
  tipo: string;
  estado: string;
  fecha_entrega: string | null;
  archivo_nombre: string | null;
  archivo_mime: string | null;
  archivo_tamano: number | null;
}

export async function documentosDeFichas(db: Db, fichaIds: string[]): Promise<Map<string, FilaDocumento[]>> {
  const mapa = new Map<string, FilaDocumento[]>();
  if (fichaIds.length === 0) return mapa;
  const filas = await db
    .selectFrom('documentos as d')
    .leftJoin('archivos as a', 'a.id', 'd.archivo_id')
    .select(['d.ficha_id', 'd.tipo', 'd.estado', 'd.fecha_entrega', 'a.nombre as archivo_nombre', 'a.mime as archivo_mime', 'a.tamano as archivo_tamano'])
    .where('d.ficha_id', 'in', fichaIds)
    .execute();
  for (const f of filas) {
    if (!mapa.has(f.ficha_id)) mapa.set(f.ficha_id, []);
    mapa.get(f.ficha_id)!.push(f);
  }
  return mapa;
}

export function datosDeFila(f: FilaFicha): DatosFicha {
  const d: Record<string, unknown> = {};
  for (const c of CAMPOS_FICHA) d[c] = f[COLUMNA[c]] ?? null;
  return d as DatosFicha;
}

/**
 * Arma la ficha que ve un usuario: sin campos sensibles si no tiene el permiso (RF-020, RNF-018),
 * sin cuotas o documentos si no puede ver esos módulos.
 */
export function serializarFicha(
  s: Sesion,
  f: FilaFicha,
  docs: FilaDocumento[] | undefined,
  camposPropios: CampoPropioDef[],
): FichaDTO {
  const o = objetivoFicha(f);
  const sensibles = puedeVerSensibles(s.asignaciones, o);
  const datos = datosDeFila(f);
  if (!sensibles) for (const c of CAMPOS_SENSIBLES) delete datos[c];
  const valoresPropios: Record<string, unknown> = {};
  for (const cp of camposPropios) {
    if (!cp.activo || (cp.sensible && !sensibles)) continue;
    if (f.campos_propios[cp.id] !== undefined) valoresPropios[cp.id] = f.campos_propios[cp.id];
  }
  const dto: FichaDTO = {
    ...datos,
    id: f.id,
    grupoId: f.grupo_id,
    ramaId: f.rama_id,
    estado: f.estado,
    version: f.version,
    incompletaMotivos: f.incompleta_motivos,
    camposPropios: valoresPropios,
    archivadaEn: f.archivada_en?.toISOString() ?? null,
    creadoEn: f.creado_en.toISOString(),
    actualizadoEn: f.actualizado_en.toISOString(),
  };
  if (puede(s.asignaciones, 'cuotas', 'ver', o)) dto.cuotas = sanearCuotas(f.cuotas);
  if (puede(s.asignaciones, 'documentos', 'ver', o)) {
    const porTipo = new Map((docs ?? []).map((d) => [d.tipo, d]));
    dto.documentos = DEF_DOCUMENTOS.filter((def) => sensibles || !def.sensible).map((def): DocumentoDTO => {
      const d = porTipo.get(def.tipo);
      return {
        tipo: def.tipo,
        estado: (d?.estado as EstadoDocumento) ?? 'noPresentado',
        fechaEntrega: d?.fecha_entrega ?? null,
        archivo: d?.archivo_nombre ? { nombre: d.archivo_nombre, mime: d.archivo_mime!, tamano: d.archivo_tamano! } : null,
      };
    });
  }
  return dto;
}

// ---------------------------------------------------------------------------
// Historial (RF-026)

/** Nombres legibles para guardar en el historial (catálogos y equipos por su nombre). */
export interface Nombres {
  catalogo: Map<string, string>;
  equipo: Map<string, string>;
}

export async function cargarNombres(db: Db | Kysely<BaseDeDatos>, ramaId: string): Promise<Nombres> {
  const [cat, eq] = await Promise.all([
    db.selectFrom('catalogo_valores').select(['id', 'nombre']).where('rama_id', '=', ramaId).execute(),
    db.selectFrom('equipos').select(['id', 'nombre']).where('rama_id', '=', ramaId).execute(),
  ]);
  return { catalogo: new Map(cat.map((c) => [c.id, c.nombre])), equipo: new Map(eq.map((e) => [e.id, e.nombre])) };
}

export function valorLegible(campo: CampoFicha, v: unknown, n: Nombres): string | null {
  if (v === null || v === undefined || v === '') return null;
  const def = DEF_CAMPO[campo];
  switch (def.tipo) {
    case 'catalogo':
      return n.catalogo.get(String(v)) ?? String(v);
    case 'equipo':
      return n.equipo.get(String(v)) ?? String(v);
    case 'booleano':
      return v ? 'Sí' : 'No';
    case 'fecha':
      return formatearFecha(String(v));
    case 'cordi':
      return NOMBRE_CORDI[v as keyof typeof NOMBRE_CORDI] ?? String(v);
    default:
      return String(v);
  }
}

export const valorPropioLegible = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? formatearFecha(String(v)) : String(v);

export const valorCuotaLegible = (v: unknown): string | null =>
  v ? (NOMBRE_ESTADO_CUOTA[v as keyof typeof NOMBRE_ESTADO_CUOTA] ?? String(v)) : null;

export const valorDocumentoLegible = (estado: string, fecha: string | null): string =>
  `${NOMBRE_ESTADO_DOCUMENTO[estado as EstadoDocumento] ?? estado}${fecha ? ` (${formatearFecha(fecha)})` : ''}`;

/** Campos especiales del historial que no son columnas de la ficha. */
export const CAMPOS_EVENTO: Record<string, string> = {
  _alta: 'Alta de la ficha',
  _importacion: 'Importación',
  _archivo: 'Baja (archivada)',
  _reactivacion: 'Reactivación',
  _pase: 'Pase de rama',
  _estado: 'Estado de la ficha',
};

/** Etiqueta del campo y si su valor es sensible. */
export function describirCampo(campo: string, camposPropios: CampoPropioDef[]): { etiqueta: string; sensible: boolean } {
  if (campo in CAMPOS_EVENTO) return { etiqueta: CAMPOS_EVENTO[campo]!, sensible: false };
  if (campo.startsWith('cuota.')) {
    const c = campo.slice(6) as (typeof CONCEPTOS_CUOTA)[number];
    return { etiqueta: `Cuota ${NOMBRE_CONCEPTO_CUOTA[c] ?? c}`, sensible: false };
  }
  if (campo.startsWith('doc.') || campo.startsWith('archivo.')) {
    const tipo = campo.slice(campo.indexOf('.') + 1) as TipoDocumento;
    const def = DEF_DOCUMENTO[tipo];
    return { etiqueta: `${campo.startsWith('archivo.') ? 'Archivo: ' : ''}${def?.nombre ?? tipo}`, sensible: def?.sensible ?? true };
  }
  if (campo.startsWith('cp.')) {
    const cp = camposPropios.find((c) => c.id === campo.slice(3));
    return { etiqueta: cp?.nombre ?? 'Campo propio', sensible: cp?.sensible ?? true };
  }
  const def = DEF_CAMPO[campo as CampoFicha];
  return { etiqueta: def?.etiqueta ?? campo, sensible: def?.sensible ?? true };
}

export async function historialDeFicha(
  db: Db,
  s: Sesion,
  f: FilaFicha,
  desdeVersion = 0,
): Promise<CambioHistorialDTO[]> {
  const sensibles = puedeVerSensibles(s.asignaciones, objetivoFicha(f));
  const camposPropios = await camposPropiosDeRama(db, f.rama_id);
  const filas = await db
    .selectFrom('historial as h')
    .leftJoin('usuarios as u', 'u.id', 'h.usuario_id')
    .select(['h.id', 'h.campo', 'h.valor_anterior', 'h.valor_nuevo', 'h.creado_en', 'u.nombre as usuario_nombre'])
    .where('h.ficha_id', '=', f.id)
    .where('h.version', '>', desdeVersion)
    .orderBy('h.id', 'desc')
    .execute();
  return filas.map((h) => {
    const { etiqueta, sensible } = describirCampo(h.campo, camposPropios);
    const oculto = sensible && !sensibles;
    return {
      id: String(h.id),
      usuarioNombre: h.usuario_nombre ?? 'Sistema',
      campo: h.campo,
      etiqueta,
      valorAnterior: oculto ? null : h.valor_anterior,
      valorNuevo: oculto ? null : h.valor_nuevo,
      oculto,
      creadoEn: h.creado_en.toISOString(),
    };
  });
}

export const esCatalogo = (c: string): c is Catalogo => (CATALOGOS as readonly string[]).includes(c);
