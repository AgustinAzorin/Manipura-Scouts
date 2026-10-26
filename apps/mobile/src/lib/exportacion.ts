import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { hayFiltros, hoyAR, type Direccion, type FiltrosNomina } from '@scouttracker/shared';
import { ErrorDelServidor, SinConexion, tokenActual, urlApi } from './api';
import { descargarEnNavegador } from './descargas';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TIEMPO_MAXIMO_MS = 60_000;

export interface PedidoExportacion {
  ramaId: string;
  ramaNombre: string;
  filtros: FiltrosNomina;
  /** Vista por equipo (RF-034). */
  equipo: { id: string; nombre: string } | null;
  orden: { columna: string; direccion: Direccion } | null;
}

/**
 * RF-115 / RI-007: pide al servidor la nómina en Excel con los filtros, la vista y el orden de la
 * lista, y la entrega al menú de compartir del celular (en la versión web, la descarga). La
 * búsqueda por texto no se envía: los filtros quedan registrados (RNF-043) y la búsqueda puede
 * tener el nombre o el DNI de un protagonista.
 */
export async function exportarNomina(p: PedidoExportacion): Promise<void> {
  const params = new URLSearchParams();
  if (hayFiltros(p.filtros)) params.set('filtros', JSON.stringify(p.filtros));
  if (p.equipo) params.set('equipo', p.equipo.id);
  if (p.orden) params.set('orden', `${p.orden.columna}:${p.orden.direccion}`);
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
  let r: Response;
  try {
    r = await fetch(`${urlApi()}/ramas/${p.ramaId}/exportacion?${params}`, {
      headers: { Authorization: `Bearer ${tokenActual()}` },
      signal: control.signal,
    });
  } catch {
    throw new SinConexion();
  } finally {
    clearTimeout(temporizador);
  }
  if (!r.ok) {
    const datos = await r.json().catch(() => null);
    throw new ErrorDelServidor(r.status, datos ?? { codigo: 'ERROR', mensaje: `Error ${r.status}` });
  }
  const bytes = await r.arrayBuffer();
  const nombre = `Nomina ${p.ramaNombre}${p.equipo ? ` ${p.equipo.nombre}` : ''} ${hoyAR()}.xlsx`.replace(/[\\/:*?"<>|]/g, ' ');

  if (Platform.OS === 'web') return descargarEnNavegador(new Blob([bytes], { type: MIME_XLSX }), nombre);
  // El archivo queda en la caché de la app y se reemplaza en la próxima exportación.
  const dir = new Directory(Paths.cache, 'exportaciones');
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  const archivo = new File(dir, nombre);
  await archivo.write(new Uint8Array(bytes));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este celular no permite compartir archivos');
  await Sharing.shareAsync(archivo.uri, { mimeType: MIME_XLSX, dialogTitle: 'Compartir nómina', UTI: 'org.openxmlformats.spreadsheetml.sheet' });
}
