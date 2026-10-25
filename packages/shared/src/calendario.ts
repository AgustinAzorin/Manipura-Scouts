/** Calendario y avisos (RF-072 a RF-087). Reglas que usan el servidor y la app. */
import { fechaAR, formatearRango, horaAR, type ActividadDTO } from './actividades';
import { aISO, diasEnMes, esAnioBisiesto, formatearFecha, partesFecha, sumarDias, type FechaISO } from './fechas';
import { nombreCompleto } from './normalizar';

// ---------------------------------------------------------------------------
// Avisos programados de una actividad (RF-078, RN-16)

export const ANTELACIONES = ['0m', '1h', '1d', '1w'] as const;
export type Antelacion = (typeof ANTELACIONES)[number];

export const NOMBRE_ANTELACION: Record<Antelacion, string> = {
  '0m': 'En el momento',
  '1h': '1 hora antes',
  '1d': '1 día antes',
  '1w': '1 semana antes',
};

const MS_ANTELACION: Record<Antelacion, number> = {
  '0m': 0,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

/** RN-16: una actividad admite hasta 2 avisos programados. */
export const MAXIMO_AVISOS_ACTIVIDAD = 2;

/** Instante en que sale un aviso: el inicio de la actividad menos la antelación. */
export function momentoAviso(inicio: string, antelacion: Antelacion): Date {
  return new Date(new Date(inicio).getTime() - MS_ANTELACION[antelacion]);
}

/** Valida la lista de antelaciones: sin repetidas y hasta 2 (RN-16). Devuelve el error o null. */
export function validarAntelaciones(lista: readonly string[]): string | null {
  if (lista.some((a) => !(ANTELACIONES as readonly string[]).includes(a))) return 'Antelación inválida';
  if (new Set(lista).size !== lista.length) return 'Hay avisos repetidos';
  if (lista.length > MAXIMO_AVISOS_ACTIVIDAD) return `Una actividad admite hasta ${MAXIMO_AVISOS_ACTIVIDAD} avisos`;
  return null;
}

export interface AvisoActividadDTO {
  antelacion: Antelacion;
  enviarEn: string;
  enviadoEn: string | null;
}

// ---------------------------------------------------------------------------
// Destinatarios (RF-079, RF-086)

/**
 * A quién llega un aviso. "alcance" son los usuarios que ven la actividad (RN-19); "grupo" es
 * todo el grupo (solo avisos manuales). Rama y equipo son los usuarios asignados a esa rama (o a
 * sus equipos) o a ese equipo; rol, los usuarios con ese rol (dentro del alcance si es de una actividad).
 */
export type Destino = { tipo: 'alcance' } | { tipo: 'grupo' } | { tipo: 'rama'; id: string } | { tipo: 'equipo'; id: string } | { tipo: 'rol'; id: string };

export const TIPOS_AVISO = ['actividades', 'cumpleanios', 'manuales'] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];

export const NOMBRE_TIPO_AVISO: Record<TipoAviso, string> = {
  actividades: 'Actividades',
  cumpleanios: 'Cumpleaños',
  manuales: 'Avisos del grupo',
};

export const CANALES_AVISO = ['push', 'mail'] as const;
export type CanalAviso = (typeof CANALES_AVISO)[number];

export const NOMBRE_CANAL: Record<CanalAviso, string> = { push: 'Notificación', mail: 'Mail' };

/** RF-084: canal activo por tipo de aviso. Lo que no figura está activo. */
export type PreferenciasAvisos = Record<TipoAviso, Record<CanalAviso, boolean>>;

export function preferenciasCompletas(parciales: { tipo: string; canal: string; activo: boolean }[] = []): PreferenciasAvisos {
  const p = Object.fromEntries(TIPOS_AVISO.map((t) => [t, { push: true, mail: true }])) as PreferenciasAvisos;
  for (const x of parciales) {
    if ((TIPOS_AVISO as readonly string[]).includes(x.tipo) && (CANALES_AVISO as readonly string[]).includes(x.canal)) {
      p[x.tipo as TipoAviso][x.canal as CanalAviso] = x.activo;
    }
  }
  return p;
}

/** RF-084: un aviso manual "importante" llega aunque el usuario haya desactivado ese tipo. */
export function recibeAviso(p: PreferenciasAvisos, tipo: TipoAviso, canal: CanalAviso, importante = false): boolean {
  return importante || p[tipo][canal];
}

export interface AvisoManualDTO {
  id: string;
  remitente: string;
  destino: string;
  canales: CanalAviso[];
  importante: boolean;
  titulo: string;
  texto: string;
  destinatarios: number;
  creadoEn: string;
}

// ---------------------------------------------------------------------------
// Calendario (RF-072 a RF-077)

export interface FeriadoDTO {
  /** Null en los feriados nacionales, que no se pueden borrar. */
  id: string | null;
  fecha: FechaISO;
  nombre: string;
  origen: 'nacional' | 'manual';
}

export interface RecordatorioDTO {
  id: string;
  fecha: FechaISO;
  /** "HH:MM" o null si es para todo el día. */
  hora: string | null;
  titulo: string;
}

export type EventoCalendario =
  | { tipo: 'actividad'; actividad: ActividadDTO; color: string; titulo: string; hora: string | null }
  | { tipo: 'cumpleanios'; fichaId: string; titulo: string; hora: null }
  | { tipo: 'feriado'; feriado: FeriadoDTO; titulo: string; hora: null }
  | { tipo: 'recordatorio'; recordatorio: RecordatorioDTO; titulo: string; hora: string | null };

/** Día en que se festeja un cumpleaños en un año: el 29/02 cae el 28/02 en años no bisiestos. */
export function cumpleaniosEnAnio(nacimiento: FechaISO, anio: number): FechaISO {
  const { mes, dia } = partesFecha(nacimiento);
  return mes === 2 && dia === 29 && !esAnioBisiesto(anio) ? aISO(anio, 2, 28) : aISO(anio, mes, dia);
}

export interface Fuentes {
  actividades: ActividadDTO[];
  colorDeTipo: (tipoId: string) => string;
  /** Fichas activas (RF-074: las archivadas no aparecen). */
  fichas: { id: string; apellido?: string | null; nombre?: string | null; fechaNacimiento?: FechaISO | null; estado?: string }[];
  feriados: FeriadoDTO[];
  recordatorios: RecordatorioDTO[];
}

const ordenEvento = (e: EventoCalendario) => (e.tipo === 'feriado' ? 0 : e.tipo === 'cumpleanios' ? 1 : 2);

/**
 * Eventos de cada día entre `desde` y `hasta` (inclusive). Una actividad de varios días aparece
 * en todos; la hora se muestra solo el día en que empieza.
 */
export function eventosPorDia(desde: FechaISO, hasta: FechaISO, f: Fuentes): Map<FechaISO, EventoCalendario[]> {
  const mapa = new Map<FechaISO, EventoCalendario[]>();
  const agregar = (dia: FechaISO, e: EventoCalendario) => {
    if (dia < desde || dia > hasta) return;
    if (!mapa.has(dia)) mapa.set(dia, []);
    mapa.get(dia)!.push(e);
  };
  for (const a of f.actividades) {
    const [ini, fin] = [fechaAR(a.inicio), fechaAR(a.fin)];
    for (let d = ini < desde ? desde : ini; d <= fin && d <= hasta; d = sumarDias(d, 1)) {
      agregar(d, { tipo: 'actividad', actividad: a, color: f.colorDeTipo(a.tipoId), titulo: a.nombre, hora: d === ini ? horaAR(a.inicio) : null });
    }
  }
  const anios = new Set([partesFecha(desde).anio, partesFecha(hasta).anio]);
  for (const ficha of f.fichas) {
    if (!ficha.fechaNacimiento || (ficha.estado && ficha.estado !== 'activa' && ficha.estado !== 'incompleta')) continue;
    for (const anio of anios) {
      agregar(cumpleaniosEnAnio(ficha.fechaNacimiento, anio), { tipo: 'cumpleanios', fichaId: ficha.id, titulo: `Cumpleaños de ${nombreCompleto(ficha)}`, hora: null });
    }
  }
  for (const fer of f.feriados) agregar(fer.fecha, { tipo: 'feriado', feriado: fer, titulo: fer.nombre, hora: null });
  for (const r of f.recordatorios) agregar(r.fecha, { tipo: 'recordatorio', recordatorio: r, titulo: r.titulo, hora: r.hora });
  for (const lista of mapa.values()) {
    lista.sort((a, b) => ordenEvento(a) - ordenEvento(b) || (a.hora ?? '').localeCompare(b.hora ?? '') || a.titulo.localeCompare(b.titulo));
  }
  return mapa;
}

/** Día de la semana con lunes = 0. */
export function diaSemana(f: FechaISO): number {
  const { anio, mes, dia } = partesFecha(f);
  return (new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay() + 6) % 7;
}

export const inicioDeSemana = (f: FechaISO): FechaISO => sumarDias(f, -diaSemana(f));

/** Semanas (de lunes a domingo) que cubren el mes, para la vista mensual. */
export function semanasDelMes(anio: number, mes: number): FechaISO[][] {
  const primero = aISO(anio, mes, 1);
  const ultimo = aISO(anio, mes, diasEnMes(anio, mes));
  const semanas: FechaISO[][] = [];
  for (let d = inicioDeSemana(primero); d <= ultimo; d = sumarDias(d, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => sumarDias(d, i)));
  }
  return semanas;
}

export const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function nombreDia(f: FechaISO): string {
  return `${NOMBRES_DIA[diaSemana(f)]} ${formatearFecha(f)}`;
}

// ---------------------------------------------------------------------------
// Textos de los avisos

export function textoAvisoActividad(a: Pick<ActividadDTO, 'nombre' | 'inicio' | 'fin' | 'lugar'>, antelacion: Antelacion): { titulo: string; cuerpo: string } {
  const cuando = antelacion === '0m' ? 'Empieza ahora' : `Empieza en ${NOMBRE_ANTELACION[antelacion].replace(' antes', '')}`;
  return { titulo: a.nombre, cuerpo: `${cuando}: ${formatearRango(a.inicio, a.fin)}${a.lugar ? ` · ${a.lugar}` : ''}` };
}

export function textoCambioActividad(a: Pick<ActividadDTO, 'nombre' | 'inicio' | 'fin' | 'lugar'>): { titulo: string; cuerpo: string } {
  return { titulo: `Cambio en ${a.nombre}`, cuerpo: `Ahora es ${formatearRango(a.inicio, a.fin)}${a.lugar ? ` en ${a.lugar}` : ''}.` };
}

export function textoCancelacion(a: Pick<ActividadDTO, 'nombre' | 'inicio' | 'fin'>): { titulo: string; cuerpo: string } {
  return { titulo: `Cancelada: ${a.nombre}`, cuerpo: `Se canceló la actividad del ${formatearRango(a.inicio, a.fin)}.` };
}
