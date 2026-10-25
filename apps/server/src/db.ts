import { readFileSync } from 'node:fs';
import { Kysely, PostgresDialect, type ColumnType, type Generated, type Selectable } from 'kysely';
import pg from 'pg';

// Las columnas `date` se leen como texto "AAAA-MM-DD" para no mezclar zonas horarias.
pg.types.setTypeParser(1082, (v: string) => v);
// bigint (bigserial) como número: los ids de historial y auditoría no superan 2^53.
pg.types.setTypeParser(20, (v: string) => Number(v));

type Creado = ColumnType<Date, Date | string | undefined, Date | string>;
type Instante = ColumnType<Date, Date | string, Date | string>;
type JsonCol<T> = ColumnType<T, string, string>;

export interface TablaGrupos {
  id: Generated<string>;
  nombre: string;
  activo: Generated<boolean>;
  creado_en: Creado;
}

export interface TablaRamas {
  id: Generated<string>;
  grupo_id: string;
  nombre: string;
  comunidad: string | null;
  campos_ocultos: ColumnType<string[], string[] | undefined, string[]>;
  creado_en: Creado;
}

export interface TablaArchivos {
  id: Generated<string>;
  grupo_id: string;
  clave: string;
  nombre: string;
  mime: string;
  tamano: number;
  creado_en: Creado;
}

export interface TablaEquipos {
  id: Generated<string>;
  grupo_id: string;
  rama_id: string;
  nombre: string;
  activo: Generated<boolean>;
  desactivado_en: Instante | null;
  logo_archivo_id: string | null;
  creado_en: Creado;
}

export interface TablaUsuarios {
  id: Generated<string>;
  nombre: string;
  email: string;
  password_hash: string | null;
  es_admin_plataforma: Generated<boolean>;
  intentos_fallidos: Generated<number>;
  bloqueado_hasta: Instante | null;
  creado_en: Creado;
}

export interface TablaMiembros {
  usuario_id: string;
  grupo_id: string;
  activo: Generated<boolean>;
  creado_en: Creado;
}

export interface TablaEnlaces {
  id: Generated<string>;
  usuario_id: string;
  tipo: 'invitacion' | 'recuperacion';
  token_hash: string;
  vence_en: Instante;
  usado_en: Instante | null;
  creado_en: Creado;
}

export interface TablaSesiones {
  id: Generated<string>;
  usuario_id: string;
  token_hash: string;
  creado_en: Creado;
  vence_en: Instante;
}

export interface TablaRoles {
  id: Generated<string>;
  grupo_id: string;
  nombre: string;
  permisos: JsonCol<Record<string, string[]>>;
  ver_sensibles: Generated<boolean>;
  sistema: string | null;
  creado_en: Creado;
}

export interface TablaAsignaciones {
  id: Generated<string>;
  usuario_id: string;
  grupo_id: string;
  rol_id: string;
  alcance: 'grupo' | 'rama' | 'equipo';
  rama_id: string | null;
  equipo_id: string | null;
  creado_en: Creado;
}

export interface TablaCatalogoValores {
  id: Generated<string>;
  grupo_id: string;
  rama_id: string;
  catalogo: string;
  nombre: string;
  activo: Generated<boolean>;
  orden: Generated<number>;
  logo_archivo_id: string | null;
  es_adulto: Generated<boolean>;
  creado_en: Creado;
}

export interface TablaCamposPropios {
  id: Generated<string>;
  grupo_id: string;
  rama_id: string;
  nombre: string;
  tipo: 'texto' | 'booleano' | 'fecha' | 'lista';
  seccion: string;
  sensible: Generated<boolean>;
  opciones: ColumnType<string[], string[] | undefined, string[]>;
  activo: Generated<boolean>;
  orden: Generated<number>;
  creado_en: Creado;
}

export interface TablaFichas {
  id: Generated<string>;
  grupo_id: string;
  rama_id: string;
  equipo_id: string | null;
  estado: 'activa' | 'incompleta' | 'archivada' | 'anonimizada';
  incompleta_motivos: ColumnType<string[], string[] | undefined, string[]>;
  apellido: string | null;
  nombre: string | null;
  dni: string | null;
  fecha_nacimiento: string | null;
  religion_id: string | null;
  categoria_miembro_id: string | null;
  tel_emergencia_1: string | null;
  tel_emergencia_2: string | null;
  tel_propio: string | null;
  promesa_id: string | null;
  etapa_id: string | null;
  elemento_id: string | null;
  raid_id: string | null;
  cordi: 'coordinador' | 'subcoordinador' | null;
  guardian_id: string | null;
  rol_comunidad: string | null;
  tiene_tada: Generated<boolean>;
  mistica: string | null;
  ingreso_movimiento_id: string | null;
  fecha_revision_diario: string | null;
  cuotas: ColumnType<Record<string, string | null>, string | undefined, string>;
  campos_propios: ColumnType<Record<string, unknown>, string | undefined, string>;
  anio_nacimiento: number | null;
  estado_tada_final: string | null;
  version: Generated<number>;
  archivada_en: Instante | null;
  anonimizada_en: Instante | null;
  creado_en: Creado;
  actualizado_en: Creado;
}

export interface TablaDocumentos {
  id: Generated<string>;
  grupo_id: string;
  ficha_id: string;
  tipo: string;
  estado: string;
  fecha_entrega: string | null;
  archivo_id: string | null;
  actualizado_en: Creado;
}

export interface TablaHistorial {
  id: Generated<number>;
  grupo_id: string;
  ficha_id: string;
  usuario_id: string | null;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  version: number;
  creado_en: Creado;
}

export interface TablaAuditoria {
  id: Generated<number>;
  grupo_id: string | null;
  usuario_id: string | null;
  accion: string;
  ficha_id: string | null;
  detalle: ColumnType<Record<string, unknown>, string | undefined, string>;
  creado_en: Creado;
}

export interface TablaMails {
  id: Generated<number>;
  tipo: string;
  enviado: boolean;
  detalle: string | null;
  creado_en: Creado;
}

export interface TablaErroresNotificados {
  firma: string;
  primera_vez: Creado;
  ultima_vez: Creado;
  cantidad: Generated<number>;
}

export interface BaseDeDatos {
  grupos: TablaGrupos;
  ramas: TablaRamas;
  archivos: TablaArchivos;
  equipos: TablaEquipos;
  usuarios: TablaUsuarios;
  miembros: TablaMiembros;
  enlaces: TablaEnlaces;
  sesiones: TablaSesiones;
  roles: TablaRoles;
  asignaciones: TablaAsignaciones;
  catalogo_valores: TablaCatalogoValores;
  campos_propios: TablaCamposPropios;
  fichas: TablaFichas;
  documentos: TablaDocumentos;
  historial: TablaHistorial;
  auditoria: TablaAuditoria;
  mails: TablaMails;
  errores_notificados: TablaErroresNotificados;
}

export type Db = Kysely<BaseDeDatos>;
export type FilaFicha = Selectable<TablaFichas>;
export type FilaRol = Selectable<TablaRoles>;

/**
 * SSL hacia la base (por ejemplo Supabase). Con DATABASE_SSL_CA (ruta al certificado raíz del
 * proveedor) se cifra y se verifica el servidor; DATABASE_SSL=sin-verificar cifra sin verificar,
 * solo como último recurso. La URL no debe traer `sslmode`, que tendría prioridad sobre esto.
 */
export function opcionesSsl(entorno: NodeJS.ProcessEnv = process.env): pg.PoolConfig['ssl'] {
  if (entorno.DATABASE_SSL_CA) return { ca: readFileSync(entorno.DATABASE_SSL_CA, 'utf8') };
  if (entorno.DATABASE_SSL === 'sin-verificar') return { rejectUnauthorized: false };
  return undefined;
}

export function crearDb(connectionString: string): Db {
  return new Kysely<BaseDeDatos>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max: 10, ssl: opcionesSsl() }) }),
  });
}

export const json = (v: unknown): string => JSON.stringify(v);
