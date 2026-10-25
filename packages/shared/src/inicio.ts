/** Pantalla de inicio: resumen de la rama y pendientes (RF-113, RF-114). Se calcula en el dispositivo. */
import { estadoActividad, totalesActividad, type ActividadDTO, type TipoActividadDTO } from './actividades';
import type { FichaDTO } from './api';
import { cumpleaniosEnAnio } from './calendario';
import { aniosCumplidos, hoyAR, partesFecha, type FechaISO } from './fechas';
import {
  CONCEPTOS_CUOTA,
  DEF_DOCUMENTO,
  NOMBRE_CONCEPTO_CUOTA,
  type ConceptoCuota,
  type TipoDocumento,
} from './ficha';
import { compararNombres } from './normalizar';

export interface Cumpleanios {
  fichaId: string;
  apellido: string | null;
  nombre: string | null;
  /** Día del festejo este año (el 29/02 cae el 28/02 en años no bisiestos). */
  fecha: FechaISO;
  /** Años que cumple ese día. */
  cumple: number;
}

/** RF-113: cumpleaños del mes en curso, por día. */
export function cumpleaniosDelMes(fichas: FichaDTO[], hoy: FechaISO = hoyAR()): Cumpleanios[] {
  const { anio, mes } = partesFecha(hoy);
  return fichas
    .filter((f) => !!f.fechaNacimiento)
    .map((f) => {
      const fecha = cumpleaniosEnAnio(f.fechaNacimiento!, anio);
      return { fichaId: f.id, apellido: f.apellido ?? null, nombre: f.nombre ?? null, fecha, cumple: aniosCumplidos(f.fechaNacimiento!, fecha) };
    })
    .filter((c) => partesFecha(c.fecha).mes === mes)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || compararNombres(a, b));
}

/** RF-113: actividades que todavía no terminaron, la más cercana primero. Las canceladas no cuentan. */
export function proximasActividades(actividades: ActividadDTO[], ahora: Date = new Date()): ActividadDTO[] {
  return actividades
    .filter((a) => {
      const e = estadoActividad(a, ahora);
      return e === 'proxima' || e === 'enCurso';
    })
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/**
 * Documentos que cuentan como pendientes. El PDF adjunto general es opcional, así que no se
 * reclama; las autorizaciones presentadas cuentan aunque no autoricen.
 */
export const DOCUMENTOS_RECLAMABLES: readonly TipoDocumento[] = ['retiroSolo', 'ddjjSalud', 'usoImagen', 'consentimiento'];

export interface FichaPendiente {
  fichaId: string;
  apellido: string | null;
  nombre: string | null;
  /** Qué le falta: nombres de documentos o de conceptos de cuota. */
  detalle: string[];
}

export interface ListaPendiente {
  /** Documentos no presentados o conceptos adeudados en total. */
  cantidad: number;
  fichas: FichaPendiente[];
}

/** RF-114: documentos no presentados. Null si el usuario no puede ver Documentos. */
export function documentosPendientes(fichas: FichaDTO[]): ListaPendiente | null {
  if (!fichas.some((f) => f.documentos)) return null;
  const lista: FichaPendiente[] = [];
  for (const f of fichas) {
    // Sin el permiso de datos sensibles, los documentos sensibles no llegan y no se reclaman.
    const faltan = (f.documentos ?? []).filter((d) => DOCUMENTOS_RECLAMABLES.includes(d.tipo) && d.estado === 'noPresentado');
    if (faltan.length) lista.push({ fichaId: f.id, apellido: f.apellido ?? null, nombre: f.nombre ?? null, detalle: faltan.map((d) => DEF_DOCUMENTO[d.tipo].nombre) });
  }
  return { cantidad: lista.reduce((s, f) => s + f.detalle.length, 0), fichas: lista.sort(compararNombres) };
}

/**
 * RF-114 / RF-043: conceptos marcados "Adeudada". Una cuota pagada, exenta o sin dato no figura.
 * Null si el usuario no puede ver Cuotas.
 */
export function cuotasPendientes(fichas: FichaDTO[]): ListaPendiente | null {
  if (!fichas.some((f) => f.cuotas)) return null;
  const lista: FichaPendiente[] = [];
  for (const f of fichas) {
    const adeudadas = CONCEPTOS_CUOTA.filter((c: ConceptoCuota) => f.cuotas?.[c] === 'adeudada');
    if (adeudadas.length) lista.push({ fichaId: f.id, apellido: f.apellido ?? null, nombre: f.nombre ?? null, detalle: adeudadas.map((c) => NOMBRE_CONCEPTO_CUOTA[c]) });
  }
  return { cantidad: lista.reduce((s, f) => s + f.detalle.length, 0), fichas: lista.sort(compararNombres) };
}

export interface AutorizacionesPendientes {
  actividad: ActividadDTO;
  /** Inscriptos que van o ya llegaron y no entregaron la autorización (RF-071). */
  cantidad: number;
}

/**
 * RF-114: autorizaciones faltantes de la próxima actividad que pide autorización (RN-17). Null si
 * no hay ninguna o el usuario no puede ver las autorizaciones (son datos sensibles).
 */
export function autorizacionesPendientes(
  actividades: ActividadDTO[],
  tipos: TipoActividadDTO[],
  ahora: Date = new Date(),
): AutorizacionesPendientes | null {
  const requiere = new Set(tipos.filter((t) => t.requiereAutorizacion).map((t) => t.id));
  const actividad = proximasActividades(actividades, ahora).find((a) => requiere.has(a.tipoId));
  if (!actividad) return null;
  const { sinAutorizacion } = totalesActividad(actividad.inscripciones, true);
  return sinAutorizacion === null ? null : { actividad, cantidad: sinAutorizacion };
}
