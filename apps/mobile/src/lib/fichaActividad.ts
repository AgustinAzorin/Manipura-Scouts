import { Directory, File, Paths } from 'expo-file-system';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { AnexoPendienteDTO, FichaActividadDTO } from '@scouttracker/shared';
import { api, mensajeDeError, SinConexion } from './api';
import { useDatos } from './datos';
import { descargarEnNavegador } from './descargas';
import { useSesion } from './sesion';

/**
 * Ficha de Actividad desde el servidor (requiere conexión). Se vuelve a pedir cada vez que la
 * pantalla vuelve a quedar adelante, para ver lo que se guardó en las pantallas de edición.
 */
export function useFichaActividad(id: string | undefined) {
  const [ficha, setFicha] = useState<FichaActividadDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recargar = useCallback(async () => {
    if (!id) return;
    try {
      setFicha(await api.get<FichaActividadDTO>(`/fichas-actividad/${id}`));
      setError(null);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      void recargar();
    }, [recargar]),
  );
  return { ficha, setFicha, error, recargar };
}

const enlacePdf = (fichaId: string) => api.get<{ url: string }>(`/fichas-actividad/${fichaId}/pdf/enlace`);

/** Abre el PDF guardado con el enlace temporal de 10 minutos (RNF-022). */
export async function verPdf(fichaId: string): Promise<void> {
  const { url } = await enlacePdf(fichaId);
  await WebBrowser.openBrowserAsync(url);
}

/**
 * RF-104 / RI-009: descarga el PDF guardado a la caché del celular y abre el menú de compartir del
 * sistema con el archivo. En la versión web lo guarda en las descargas del navegador.
 */
export async function compartirPdf(fichaId: string, nombreArchivo: string): Promise<void> {
  const { url } = await enlacePdf(fichaId);
  if (Platform.OS === 'web') {
    let r: Response;
    try {
      r = await fetch(url);
    } catch {
      throw new SinConexion();
    }
    if (!r.ok) throw new Error('No se pudo descargar el PDF. Probá de nuevo.');
    return descargarEnNavegador(await r.blob(), nombreArchivo);
  }
  if (!(await Sharing.isAvailableAsync())) {
    await WebBrowser.openBrowserAsync(url);
    return;
  }
  const dir = new Directory(Paths.cache, 'fichas-actividad');
  if (!dir.exists) dir.create({ intermediates: true });
  const destino = new File(dir, nombreArchivo.replace(/[\\/:*?"<>|]/g, ' '));
  if (destino.exists) destino.delete();
  const archivo = await File.downloadFileAsync(url, destino);
  await Sharing.shareAsync(archivo.uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir Ficha de Actividad', UTI: 'com.adobe.pdf' });
}

/** RF-095: anexos asignados al usuario que falta completar. Requiere conexión. */
export function useAnexosPendientes(): { anexos: AnexoPendienteDTO[]; recargar: () => Promise<void> } {
  const { estado } = useSesion();
  const { sinConexion } = useDatos();
  const [anexos, setAnexos] = useState<AnexoPendienteDTO[]>([]);
  const conSesion = estado.tipo === 'conSesion';
  const recargar = useCallback(async () => {
    try {
      setAnexos(await api.get<AnexoPendienteDTO[]>('/yo/anexos-pendientes'));
    } catch {
      // Sin conexión se queda con lo último que trajo.
    }
  }, []);
  useEffect(() => {
    if (!conSesion || sinConexion) return;
    let vigente = true;
    api.get<AnexoPendienteDTO[]>('/yo/anexos-pendientes').then(
      (l) => vigente && setAnexos(l),
      () => {},
    );
    return () => {
      vigente = false;
    };
  }, [conSesion, sinConexion]);
  return { anexos, recargar };
}
