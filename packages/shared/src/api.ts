/** Tipos de las respuestas de la API compartidos entre el servidor y la app. */
import type { ActividadDTO, AsistenciaAnio, TipoActividadDTO } from './actividades';
import type { FechaISO } from './fechas';
import type {
  CampoFicha,
  CampoPropioDef,
  Catalogo,
  Cuotas,
  DatosFicha,
  EstadoDocumento,
  EstadoFicha,
  TipoDocumento,
} from './ficha';
import type { Alcance, Permisos } from './permisos';

export interface ErrorApi {
  codigo: string;
  mensaje: string;
  campos?: Record<string, string>;
}

/** Códigos de error que la app trata de forma especial. */
export const CODIGOS_ERROR = {
  noAutenticado: 'NO_AUTENTICADO',
  usuarioDesactivado: 'USUARIO_DESACTIVADO',
  grupoDesactivado: 'GRUPO_DESACTIVADO',
  sinPermiso: 'SIN_PERMISO',
  bloqueado: 'BLOQUEADO',
  conflictoEdicion: 'CONFLICTO_EDICION',
  dniDuplicado: 'DNI_DUPLICADO',
  validacion: 'VALIDACION',
  noEncontrado: 'NO_ENCONTRADO',
  enlaceVencido: 'ENLACE_VENCIDO',
  usuarioExistente: 'USUARIO_EXISTENTE',
  confirmarReemplazo: 'CONFIRMAR_REEMPLAZO',
} as const;

export interface UsuarioYo {
  id: string;
  nombre: string;
  email: string;
  esAdminPlataforma: boolean;
}

export interface RespuestaLogin {
  token: string;
  venceEn: string;
  usuario: UsuarioYo;
}

/** RF-021: un grupo y una rama en los que el usuario puede trabajar. */
export interface Contexto {
  grupoId: string;
  grupoNombre: string;
  ramaId: string;
  ramaNombre: string;
  comunidad: string | null;
  /** Solo tiene asignaciones de equipo en esta rama: ve únicamente esos equipos. */
  soloEquipos: string[] | null;
  permisos: Permisos;
  verSensibles: boolean;
}

export interface GrupoAdministrable {
  grupoId: string;
  grupoNombre: string;
}

export interface RespuestaYo {
  usuario: UsuarioYo;
  contextos: Contexto[];
  /** Grupos en los que puede administrar usuarios y roles (Administración con alcance de grupo). */
  gruposAdministrables: GrupoAdministrable[];
  /** Ramas (por id) en las que puede administrar catálogos, equipos, campos e importar. */
  ramasAdministrables: string[];
}

export interface CatalogoValorDTO {
  id: string;
  catalogo: Catalogo;
  nombre: string;
  activo: boolean;
  orden: number;
  /** Versión del logo para invalidar la caché; null si no tiene. */
  logo: string | null;
  /** Solo categoría de miembro: valor que corresponde a adultos (no se importa, RF-049). */
  esAdulto: boolean;
}

export interface EquipoDTO {
  id: string;
  nombre: string;
  activo: boolean;
  desactivadoEn: string | null;
  logo: string | null;
}

export interface RamaConfigDTO {
  id: string;
  grupoId: string;
  nombre: string;
  comunidad: string | null;
  camposOcultos: CampoFicha[];
  catalogos: CatalogoValorDTO[];
  equipos: EquipoDTO[];
  camposPropios: CampoPropioDef[];
}

export interface ArchivoDTO {
  nombre: string;
  mime: string;
  tamano: number;
}

export interface DocumentoDTO {
  tipo: TipoDocumento;
  estado: EstadoDocumento;
  fechaEntrega: FechaISO | null;
  archivo: ArchivoDTO | null;
}

export interface FichaDTO extends DatosFicha {
  id: string;
  grupoId: string;
  ramaId: string;
  estado: EstadoFicha;
  version: number;
  incompletaMotivos: string[];
  /** Solo si el usuario puede ver Cuotas. */
  cuotas?: Cuotas;
  /** Solo si puede ver Documentos; sin los documentos sensibles si no tiene ese permiso. */
  documentos?: DocumentoDTO[];
  camposPropios: Record<string, unknown>;
  archivadaEn: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

/** Lo que la app guarda para consultar sin conexión (RF-054). */
export interface SnapshotRama {
  generadoEn: string;
  contexto: Contexto;
  rama: RamaConfigDTO;
  fichas: FichaDTO[];
  /** Tipos de actividad del grupo (RF-063). */
  tiposActividad: TipoActividadDTO[];
  /** Actividades de la rama recientes y futuras, con los inscriptos de la rama (RF-054, RF-071). */
  actividades: ActividadDTO[];
  /** RF-069: asistencia del año calendario por ficha. */
  asistenciaAnio: Record<string, AsistenciaAnio>;
}

export interface CambioHistorialDTO {
  id: string;
  usuarioNombre: string;
  campo: string;
  etiqueta: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
  /** RF-026: valor de un campo sensible para quien no tiene el permiso. */
  oculto: boolean;
  creadoEn: string;
}

/** RF-025 */
export interface ConflictoEdicion extends ErrorApi {
  codigo: 'CONFLICTO_EDICION';
  versionActual: number;
  cambios: CambioHistorialDTO[];
}

export interface OmisionImportacion {
  fila: number;
  motivo: string;
}

/** RF-053 */
export interface ResumenImportacion {
  filasLeidas: number;
  creadas: number;
  incompletas: number;
  omitidas: OmisionImportacion[];
  /** Filas de adultos (educadores, colaboradores) que no se importan. */
  adultos: number[];
  /** Detalle de por qué quedó incompleta cada ficha, por número de fila. */
  detalleIncompletas: { fila: number; motivos: string[] }[];
  /** Encabezados de la planilla que no corresponden a ningún campo y no se importaron. */
  columnasIgnoradas: string[];
}

export interface UsuarioAdminDTO {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  pendienteActivacion: boolean;
  asignaciones: AsignacionDTO[];
}

export interface AsignacionDTO {
  id: string;
  rolId: string;
  rolNombre: string;
  alcance: Alcance;
  ramaId: string | null;
  equipoId: string | null;
  /** Descripción legible del alcance: "Grupo", "Rama Caminantes", "Equipo Baden Powell". */
  alcanceNombre: string;
}

export interface RolDTO {
  id: string;
  nombre: string;
  permisos: Permisos;
  verSensibles: boolean;
  sistema: boolean;
  cantidadUsuarios: number;
}

export interface GrupoDTO {
  id: string;
  nombre: string;
  activo: boolean;
  cantidadAdmins: number;
}

export interface RamaDTO {
  id: string;
  nombre: string;
  comunidad: string | null;
}
