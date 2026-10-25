import Constants from 'expo-constants';
import { URL_API_POR_DEFECTO, normalizarUrl, usarServidor } from './api';
import { crearAlmacen } from './almacen';

/**
 * Solo las builds de prueba (development y preview) dejan elegir el servidor. En las builds
 * nativas lo decide app.config.ts; la exportación web no incluye `extra`, y ahí se usa
 * EXPO_PUBLIC_ENTORNO (la de producción lo define en eas.json).
 */
const extra = Constants.expoConfig?.extra;
export const PERMITIR_CAMBIAR_SERVIDOR =
  extra && 'permitirCambiarServidor' in extra ? extra.permitirCambiarServidor === true : process.env.EXPO_PUBLIC_ENTORNO !== 'produccion';

const almacen = crearAlmacen('preferencias');
const CLAVE = 'servidor';

/** Al abrir la app: usa el servidor elegido antes, si la build lo permite. */
export async function cargarServidor(): Promise<string> {
  const guardado = PERMITIR_CAMBIAR_SERVIDOR ? await almacen.leer<string>(CLAVE) : null;
  const url = guardado ?? URL_API_POR_DEFECTO;
  usarServidor(url);
  return url;
}

export async function guardarServidor(url: string): Promise<string> {
  const normalizada = normalizarUrl(url);
  usarServidor(normalizada);
  await almacen.guardar(CLAVE, normalizada);
  return normalizada;
}

/** Comprueba que en esa dirección responda un servidor de ScoutTracker. */
export async function probarServidor(url: string): Promise<boolean> {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), 8000);
  try {
    const r = await fetch(`${normalizarUrl(url)}/salud`, { signal: control.signal });
    return r.ok && (await r.json())?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
