/**
 * Fechas de calendario como texto ISO "AAAA-MM-DD" (sin hora ni zona).
 *
 * Argentina usa UTC-3 fijo y no aplica horario de verano desde 2009, así que la
 * fecha local se calcula restando 3 horas a UTC. Se evita Intl con timeZone
 * porque su soporte en Hermes (Android) no es uniforme (RNF-042).
 */
export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';
const OFFSET_AR_MS = -3 * 60 * 60 * 1000;

export type FechaISO = string;

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function hoyAR(ahora: Date = new Date()): FechaISO {
  return new Date(ahora.getTime() + OFFSET_AR_MS).toISOString().slice(0, 10);
}

export function partesFecha(f: FechaISO): { anio: number; mes: number; dia: number } {
  const m = RE_ISO.exec(f);
  if (!m) throw new Error(`Fecha inválida: ${f}`);
  return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}

export function esAnioBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

export function diasEnMes(anio: number, mes: number): number {
  return [31, esAnioBisiesto(anio) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1] ?? 0;
}

export function esFechaValida(anio: number, mes: number, dia: number): boolean {
  return (
    Number.isInteger(anio) &&
    Number.isInteger(mes) &&
    Number.isInteger(dia) &&
    anio >= 1900 &&
    anio <= 2200 &&
    mes >= 1 &&
    mes <= 12 &&
    dia >= 1 &&
    dia <= diasEnMes(anio, mes)
  );
}

export function esFechaISO(valor: unknown): valor is FechaISO {
  if (typeof valor !== 'string') return false;
  const m = RE_ISO.exec(valor);
  return !!m && esFechaValida(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function aISO(anio: number, mes: number, dia: number): FechaISO {
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Formato de pantalla dd/mm/aaaa (RNF-042). */
export function formatearFecha(f: FechaISO | null | undefined): string {
  if (!f) return '';
  const { anio, mes, dia } = partesFecha(f);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${anio}`;
}

/** Fecha y hora en hora de Argentina, formato dd/mm/aaaa hh:mm. */
export function formatearFechaHora(instante: string | Date): string {
  const d = new Date(new Date(instante).getTime() + OFFSET_AR_MS);
  const iso = d.toISOString();
  return `${formatearFecha(iso.slice(0, 10))} ${iso.slice(11, 16)}`;
}

/** Día de cumpleaños en el año indicado. El 29/02 cae el 28/02 en años no bisiestos. */
function cumpleEnAnio(mes: number, dia: number, anio: number): { mes: number; dia: number } {
  if (mes === 2 && dia === 29 && !esAnioBisiesto(anio)) return { mes: 2, dia: 28 };
  return { mes, dia };
}

function numeroDia(anio: number, mes: number, dia: number): number {
  return Math.floor(Date.UTC(anio, mes - 1, dia) / 86_400_000);
}

/** Años cumplidos a la fecha indicada. */
export function aniosCumplidos(nacimiento: FechaISO, hoy: FechaISO = hoyAR()): number {
  const n = partesFecha(nacimiento);
  const h = partesFecha(hoy);
  let anios = h.anio - n.anio;
  const c = cumpleEnAnio(n.mes, n.dia, h.anio);
  if (h.mes < c.mes || (h.mes === c.mes && h.dia < c.dia)) anios -= 1;
  return anios;
}

/**
 * RN-01: años transcurridos desde el nacimiento, con la fracción del año en curso
 * (días desde el último cumpleaños sobre los días hasta el siguiente), truncada a un decimal.
 * Ej.: 22/02/2011 al 24/10/2026 → 15,67 → 15,6.
 */
export function calcularEdad(nacimiento: FechaISO, hoy: FechaISO = hoyAR()): number {
  const n = partesFecha(nacimiento);
  const h = partesFecha(hoy);
  const anios = aniosCumplidos(nacimiento, hoy);
  if (anios < 0) return 0;
  const ultimo = cumpleEnAnio(n.mes, n.dia, n.anio + anios);
  const proximo = cumpleEnAnio(n.mes, n.dia, n.anio + anios + 1);
  const desde = numeroDia(n.anio + anios, ultimo.mes, ultimo.dia);
  const hasta = numeroDia(n.anio + anios + 1, proximo.mes, proximo.dia);
  const fraccion = (numeroDia(h.anio, h.mes, h.dia) - desde) / (hasta - desde);
  // Se trunca trabajando en décimas enteras para no arrastrar errores de coma flotante.
  return (anios * 10 + Math.floor(fraccion * 10)) / 10;
}

/** Edad con coma decimal para mostrar: 15,6. */
export function formatearEdad(edad: number | null | undefined): string {
  if (edad === null || edad === undefined) return '';
  return edad.toFixed(1).replace('.', ',');
}

/** Día de cumpleaños "dd/mm" (campo calculado de RD-002). */
export function diaCumpleanios(nacimiento: FechaISO | null | undefined): string {
  if (!nacimiento) return '';
  const { mes, dia } = partesFecha(nacimiento);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

/** Suma días a una fecha ISO. */
export function sumarDias(f: FechaISO, dias: number): FechaISO {
  const { anio, mes, dia } = partesFecha(f);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** Suma años a una fecha ISO; el 29/02 pasa al 28/02 si el año destino no es bisiesto. */
export function sumarAnios(f: FechaISO, anios: number): FechaISO {
  const { anio, mes, dia } = partesFecha(f);
  const c = cumpleEnAnio(mes, dia, anio + anios);
  return aISO(anio + anios, c.mes, c.dia);
}

/**
 * Interpreta una fecha escrita por una persona: dd/mm/aaaa, dd/mm/aa, d-m-aa o AAAA-MM-DD.
 * RN-04: un año de dos dígitos es el año más reciente que no sea futuro.
 * Devuelve null si no es una fecha válida.
 */
export function interpretarFecha(texto: string, hoy: FechaISO = hoyAR()): FechaISO | null {
  const t = texto.trim();
  if (!t) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (iso) {
    const [anio, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return esFechaValida(anio, mes, dia) ? aISO(anio, mes, dia) : null;
  }
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!dmy) return null;
  const dia = Number(dmy[1]);
  const mes = Number(dmy[2]);
  let anio = Number(dmy[3]);
  if (dmy[3]!.length === 2) {
    const anioActual = partesFecha(hoy).anio;
    anio += Math.floor(anioActual / 100) * 100;
    if (anio > anioActual) anio -= 100;
  }
  return esFechaValida(anio, mes, dia) ? aISO(anio, mes, dia) : null;
}
