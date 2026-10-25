/** Actividades, asistencia y autorizaciones (RF-057 a RF-071). Reglas que usan el servidor y la app. */
import type { ArchivoDTO } from './api';
import { formatearFecha, hoyAR, type FechaISO } from './fechas';
import { tienePermiso, type Alcance, type AsignacionConRol } from './permisos';

// ---------------------------------------------------------------------------
// Tipos de actividad (RF-063)

export interface TipoActividadDTO {
  id: string;
  nombre: string;
  color: string;
  /** RN-17: exige registrar la autorización de cada inscripto. */
  requiereAutorizacion: boolean;
  activo: boolean;
}

/** Colores para elegir en un tipo de actividad: contraste ≥ 4,5:1 con texto blanco (RNF-029). */
export const COLORES_TIPO_ACTIVIDAD: readonly { color: string; nombre: string }[] = [
  { color: '#1F4D2B', nombre: 'Verde' },
  { color: '#0B4F8A', nombre: 'Azul' },
  { color: '#A11D1D', nombre: 'Rojo' },
  { color: '#B03A00', nombre: 'Naranja' },
  { color: '#7A4B00', nombre: 'Marrón' },
  { color: '#5B2C83', nombre: 'Violeta' },
  { color: '#00676B', nombre: 'Turquesa' },
  { color: '#4A5247', nombre: 'Gris' },
];

export const esColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v);

/** Tipos con los que arranca cada grupo. El admin de grupo puede editarlos o desactivarlos. */
export const TIPOS_ACTIVIDAD_INICIALES: readonly Omit<TipoActividadDTO, 'id' | 'activo'>[] = [
  { nombre: 'Reunión de sábado', color: '#1F4D2B', requiereAutorizacion: false },
  { nombre: 'Campamento', color: '#0B4F8A', requiereAutorizacion: true },
  { nombre: 'Raid', color: '#B03A00', requiereAutorizacion: true },
  { nombre: 'Acantonamiento', color: '#5B2C83', requiereAutorizacion: true },
];

// ---------------------------------------------------------------------------
// Inscripción: confirmación, asistencia y autorización (sección 3.3)

export const CONFIRMACIONES = ['sinRespuesta', 'va', 'noVa'] as const;
export type Confirmacion = (typeof CONFIRMACIONES)[number];

export const NOMBRE_CONFIRMACION: Record<Confirmacion, string> = {
  sinRespuesta: 'Sin respuesta',
  va: 'Va',
  noVa: 'No va',
};

export const ESTADOS_AUTORIZACION_ACTIVIDAD = ['noPresentada', 'presentada'] as const;
export type EstadoAutorizacionActividad = (typeof ESTADOS_AUTORIZACION_ACTIVIDAD)[number];

export const NOMBRE_AUTORIZACION_ACTIVIDAD: Record<EstadoAutorizacionActividad, string> = {
  noPresentada: 'No presentada',
  presentada: 'Presentada',
};

export interface AutorizacionActividadDTO {
  estado: EstadoAutorizacionActividad;
  fecha: FechaISO | null;
  archivo: ArchivoDTO | null;
}

export interface InscripcionDTO {
  fichaId: string;
  /** Nombre para los reportes de actividades pasadas, aunque la ficha ya no esté en la nómina. */
  apellido: string | null;
  nombre: string | null;
  equipoId: string | null;
  confirmacion: Confirmacion;
  presente: boolean;
  /**
   * Solo con el permiso de datos sensibles, porque las autorizaciones lo son (glosario, RF-020,
   * RNF-018). Sin ese permiso no se envía ni se guarda en el dispositivo.
   */
  autorizacion?: AutorizacionActividadDTO;
}

export interface ActividadDTO {
  id: string;
  grupoId: string;
  tipoId: string;
  nombre: string;
  /** Instantes ISO (UTC). Se muestran en hora de Argentina (RNF-042). */
  inicio: string;
  fin: string;
  lugar: string | null;
  alcance: Alcance;
  ramaId: string | null;
  equipoId: string | null;
  canceladaEn: string | null;
  /** Inscriptos que el usuario puede ver, de la rama en la que trabaja. */
  inscripciones: InscripcionDTO[];
}

/** Presentes e inscripciones en actividades ya ocurridas del año (RF-069). */
export interface AsistenciaAnio {
  presentes: number;
  total: number;
}

export function porcentajeAsistencia(a: AsistenciaAnio | undefined): number | null {
  return a && a.total > 0 ? Math.round((a.presentes / a.total) * 100) : null;
}

/** RN-17 / RF-066: falta la autorización de un inscripto. Sin el permiso de verla, no se sabe. */
export function faltaAutorizacion(i: InscripcionDTO, requiere: boolean): boolean {
  return requiere && !!i.autorizacion && i.autorizacion.estado !== 'presentada';
}

export interface TotalesActividad {
  inscriptos: number;
  confirmados: number;
  noVan: number;
  sinRespuesta: number;
  presentes: number;
  ausentes: number;
  /**
   * RF-071: inscriptos que van o llegaron y no entregaron la autorización. Los que no van no
   * cuentan: no necesitan autorización. Null si la actividad no la pide o no se puede ver.
   */
  sinAutorizacion: number | null;
}

/** RF-058, RF-065 y RF-071. Un inscripto sin marcar como presente cuenta como ausente. */
export function totalesActividad(inscripciones: InscripcionDTO[], requiereAutorizacion: boolean): TotalesActividad {
  const presentes = inscripciones.filter((i) => i.presente).length;
  const veAutorizaciones = inscripciones.some((i) => i.autorizacion);
  return {
    inscriptos: inscripciones.length,
    confirmados: inscripciones.filter((i) => i.confirmacion === 'va').length,
    noVan: inscripciones.filter((i) => i.confirmacion === 'noVa').length,
    sinRespuesta: inscripciones.filter((i) => i.confirmacion === 'sinRespuesta').length,
    presentes,
    ausentes: inscripciones.length - presentes,
    sinAutorizacion:
      requiereAutorizacion && veAutorizaciones
        ? inscripciones.filter((i) => (i.confirmacion === 'va' || i.presente) && faltaAutorizacion(i, true)).length
        : null,
  };
}

/**
 * RF-067: confirmación de cada protagonista para la próxima actividad suya que todavía no
 * empezó (las canceladas no cuentan).
 */
export function confirmacionesProximas(actividades: ActividadDTO[], ahora: Date = new Date()): Map<string, Confirmacion> {
  const mapa = new Map<string, Confirmacion>();
  const proximas = actividades
    .filter((a) => !a.canceladaEn && new Date(a.inicio).getTime() > ahora.getTime())
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  for (const a of proximas) {
    for (const i of a.inscripciones) if (!mapa.has(i.fichaId)) mapa.set(i.fichaId, i.confirmacion);
  }
  return mapa;
}

export type EstadoActividad = 'cancelada' | 'proxima' | 'enCurso' | 'terminada';

export function estadoActividad(a: Pick<ActividadDTO, 'inicio' | 'fin' | 'canceladaEn'>, ahora: Date = new Date()): EstadoActividad {
  if (a.canceladaEn) return 'cancelada';
  const t = ahora.getTime();
  if (t < new Date(a.inicio).getTime()) return 'proxima';
  return t <= new Date(a.fin).getTime() ? 'enCurso' : 'terminada';
}

// ---------------------------------------------------------------------------
// Visibilidad (RN-19)

export interface UbicacionActividad {
  grupoId: string;
  alcance: Alcance;
  ramaId: string | null;
  equipoId: string | null;
}

/**
 * RN-19: una asignación ve las actividades de su alcance y de los niveles superiores
 * (equipo → rama → grupo), no las de niveles hermanos. Quien tiene alcance de grupo o de rama
 * ve también las de los equipos que abarca.
 */
export function asignacionVeActividad(a: AsignacionConRol, act: UbicacionActividad): boolean {
  if (a.grupoId !== act.grupoId) return false;
  if (a.alcance === 'grupo' || act.alcance === 'grupo') return true;
  if (a.ramaId !== act.ramaId) return false;
  if (a.alcance === 'rama' || act.alcance === 'rama') return true;
  return a.equipoId === act.equipoId;
}

export function puedeVerActividad(asignaciones: AsignacionConRol[], act: UbicacionActividad): boolean {
  return asignaciones.some((a) => asignacionVeActividad(a, act) && tienePermiso(a.rol.permisos, 'actividades', 'ver'));
}

// ---------------------------------------------------------------------------
// Registros hechos en el dispositivo y su sincronización (RF-057, RN-08)

interface BaseRegistro {
  /** Id generado en el dispositivo; el servidor responde por él. */
  id: string;
  actividadId: string;
  fichaId: string;
  /** Hora del dispositivo al registrar (RN-08). */
  en: string;
}

export type RegistroActividad =
  | (BaseRegistro & { campo: 'presente'; valor: boolean; anterior: boolean })
  | (BaseRegistro & { campo: 'confirmacion'; valor: Confirmacion; anterior: Confirmacion })
  | (BaseRegistro & {
      campo: 'autorizacion';
      valor: EstadoAutorizacionActividad;
      anterior: EstadoAutorizacionActividad;
      fecha: FechaISO | null;
    });

export type CampoRegistro = RegistroActividad['campo'];

/** RF-055: sin conexión solo se registran asistencia y autorizaciones (RF-058, RF-059). */
export const CAMPOS_SIN_CONEXION: readonly CampoRegistro[] = ['presente', 'autorizacion'];

export interface ResultadoRegistro {
  id: string;
  /** aplicado: quedó en el servidor; descartado: perdió el conflicto (RN-08); rechazado: no se puede aplicar. */
  estado: 'aplicado' | 'descartado' | 'rechazado';
  motivo?: string;
}

/**
 * RN-08: decide si un registro se aplica sobre el valor que tiene el servidor.
 *
 * Hay conflicto solo si el valor del servidor ya no es el que el dispositivo veía al registrar
 * (otro educador lo cambió mientras tanto). Sin conflicto el registro se aplica, así un educador
 * puede corregir su propia marca. Con conflicto, en asistencia prevalece "Presente" y en los demás
 * campos el cambio más reciente según la hora de los dispositivos.
 */
export function prevaleceRegistro<T>(
  campo: CampoRegistro,
  actual: { valor: T; en: string | null },
  registro: { valor: T; anterior: T; en: string },
): boolean {
  if (actual.valor === registro.anterior) return true;
  if (campo === 'presente') return registro.valor === true;
  return !actual.en || new Date(registro.en).getTime() > new Date(actual.en).getTime();
}

const mismaClave = (a: RegistroActividad, b: RegistroActividad) =>
  a.actividadId === b.actividadId && a.fichaId === b.fichaId && a.campo === b.campo;

/**
 * Agrega un registro a la cola de pendientes. Si ya había uno del mismo campo, se reemplaza
 * conservando el valor que el dispositivo vio primero (el que importa para detectar conflictos);
 * si el cambio vuelve a ese valor, no queda nada que enviar.
 */
export function encolarRegistro(cola: RegistroActividad[], r: RegistroActividad): RegistroActividad[] {
  const previo = cola.find((x) => mismaClave(x, r));
  if (!previo) return [...cola, r];
  const resto = cola.filter((x) => x !== previo);
  const combinado = { ...r, id: previo.id, anterior: previo.anterior } as RegistroActividad;
  const sinCambio = combinado.valor === combinado.anterior && (combinado.campo !== 'autorizacion' || combinado.valor === 'noPresentada');
  return sinCambio ? resto : [...resto, combinado];
}

/** Aplica sobre una inscripción los registros pendientes del dispositivo, para mostrarlos. */
export function aplicarPendientes(a: ActividadDTO, cola: RegistroActividad[]): ActividadDTO {
  const propios = cola.filter((r) => r.actividadId === a.id);
  if (propios.length === 0) return a;
  return {
    ...a,
    inscripciones: a.inscripciones.map((i) => {
      let nueva = i;
      for (const r of propios) {
        if (r.fichaId !== i.fichaId) continue;
        if (r.campo === 'presente') nueva = { ...nueva, presente: r.valor };
        else if (r.campo === 'confirmacion') nueva = { ...nueva, confirmacion: r.valor };
        else if (nueva.autorizacion) nueva = { ...nueva, autorizacion: { ...nueva.autorizacion, estado: r.valor, fecha: r.fecha } };
      }
      return nueva;
    }),
  };
}

// ---------------------------------------------------------------------------
// Fechas y horas de actividades (RNF-042: hora de Argentina, UTC-3 fijo)

const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const esHora = (v: unknown): v is string => typeof v === 'string' && RE_HORA.test(v);

/** Acepta "9", "9:30", "09.30" o "0930" y devuelve "HH:MM"; null si no es una hora válida. */
export function interpretarHora(texto: string): string | null {
  const t = texto.trim().replace('.', ':');
  let h: number;
  let m = 0;
  if (/^\d{1,2}$/.test(t)) h = Number(t);
  else if (/^\d{1,2}:\d{2}$/.test(t)) [h, m] = t.split(':').map(Number) as [number, number];
  else if (/^\d{4}$/.test(t)) [h, m] = [Number(t.slice(0, 2)), Number(t.slice(2))];
  else return null;
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Instante ISO a partir de una fecha y una hora de Argentina. */
export function instanteAR(fecha: FechaISO, hora: string): string {
  return new Date(`${fecha}T${hora}:00-03:00`).toISOString();
}

export const fechaAR = (instante: string): FechaISO => hoyAR(new Date(instante));

export function horaAR(instante: string): string {
  return new Date(new Date(instante).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

/** "14/03/2026 de 14:00 a 18:00" o "14/03/2026 09:00 al 16/03/2026 13:00". */
export function formatearRango(inicio: string, fin: string): string {
  const [fi, ff] = [fechaAR(inicio), fechaAR(fin)];
  if (fi === ff) return `${formatearFecha(fi)} de ${horaAR(inicio)} a ${horaAR(fin)}`;
  return `${formatearFecha(fi)} ${horaAR(inicio)} al ${formatearFecha(ff)} ${horaAR(fin)}`;
}
