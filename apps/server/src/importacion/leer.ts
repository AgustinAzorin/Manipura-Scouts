import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { aISO } from '@scouttracker/shared';
import { validacion } from '../errores';

/** Celda leída: texto, o fecha ISO si la planilla la guardó como fecha. */
export type Celda = string;

export interface Tabla {
  encabezados: string[];
  /** Filas de datos con su número de fila en la planilla (el encabezado es la fila 1 si está arriba). */
  filas: { numero: number; celdas: Celda[] }[];
}

/** Los CSV exportados por Excel en Windows suelen venir en Windows-1252, no en UTF-8. */
function decodificar(datos: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(datos).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(datos);
  }
}

function separarEncabezado(filas: Celda[][]): Tabla {
  const inicio = filas.findIndex((f) => f.filter((c) => c.trim() !== '').length >= 2);
  if (inicio < 0) throw validacion('El archivo no tiene una fila de encabezados');
  return {
    encabezados: filas[inicio]!.map((c) => c.trim()),
    filas: filas.slice(inicio + 1).map((celdas, i) => ({ numero: inicio + i + 2, celdas })),
  };
}

export function leerCsv(datos: Buffer): Tabla {
  const texto = decodificar(datos);
  const primera = texto.split(/\r?\n/, 1)[0] ?? '';
  const delimitador = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ',';
  const filas = parse(texto, { delimiter: delimitador, relax_column_count: true, skip_empty_lines: false, bom: true }) as string[][];
  return separarEncabezado(filas);
}

function textoDeCelda(v: ExcelJS.CellValue): Celda {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    // exceljs entrega las fechas de Excel como instantes UTC a medianoche.
    return aISO(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return textoDeCelda(v.result as ExcelJS.CellValue);
    if ('error' in v) return '';
  }
  return String(v);
}

export async function leerXlsx(datos: Buffer): Promise<Tabla> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(datos as unknown as ArrayBuffer);
  } catch {
    throw validacion('No se pudo leer el archivo Excel');
  }
  const hoja = libro.worksheets[0];
  if (!hoja) throw validacion('El archivo Excel no tiene hojas');
  const filas: Celda[][] = [];
  const columnas = hoja.columnCount;
  for (let r = 1; r <= hoja.rowCount; r++) {
    const fila = hoja.getRow(r);
    const celdas: Celda[] = [];
    for (let c = 1; c <= columnas; c++) celdas.push(textoDeCelda(fila.getCell(c).value));
    filas.push(celdas);
  }
  return separarEncabezado(filas);
}

export async function leerPlanilla(nombre: string, datos: Buffer): Promise<Tabla> {
  const esXlsx = datos.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (esXlsx) return leerXlsx(datos);
  if (/\.xlsx?$/i.test(nombre)) throw validacion('El archivo Excel no es válido (se acepta .xlsx)');
  return leerCsv(datos);
}
