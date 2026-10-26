/**
 * RNF-034 del lado de la app: los errores inesperados y los cierres se guardan en el dispositivo
 * y se mandan al servidor, que avisa por mail al responsable técnico la primera vez que aparece
 * cada uno. Se guardan antes de mandarlos porque un cierre termina la app y porque puede no
 * haber conexión ni sesión: los pendientes salen en la próxima apertura con sesión.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { ReporteErrorApp } from '@scouttracker/shared';
import { api, ErrorDelServidor, SinConexion, tokenActual } from './api';
import { crearAlmacen } from './almacen';

const almacen = crearAlmacen('preferencias');
const CLAVE = 'errores-pendientes';
const MAXIMO_PENDIENTES = 10;

const plataforma: ReporteErrorApp['plataforma'] = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
const version = Constants.expoConfig?.version ?? 'sin versión';

// Las lecturas y escrituras de la lista se hacen de a una, para que dos errores seguidos no se pisen.
let cola: Promise<unknown> = Promise.resolve();
function enOrden<T>(tarea: () => Promise<T>): Promise<T> {
  const p = cola.then(tarea);
  cola = p.catch(() => {});
  return p;
}

const leerPendientes = async () => (await almacen.leer<ReporteErrorApp[]>(CLAVE)) ?? [];

/** Guarda el error y, si hay sesión, intenta mandarlo. Nunca falla. */
export function registrarError(error: unknown, fatal: boolean): Promise<void> {
  const e = error instanceof Error ? error : new Error(String(error));
  const reporte: ReporteErrorApp = {
    mensaje: (e.message.trim() || e.name || 'Error sin mensaje').slice(0, 500),
    pila: e.stack?.slice(0, 8000),
    plataforma,
    version,
    fatal,
  };
  return enOrden(async () => {
    const pendientes = await leerPendientes();
    // El mismo error repetido no ocupa lugar: el servidor avisa una sola vez por cada uno.
    if (pendientes.some((p) => p.mensaje === reporte.mensaje && p.pila === reporte.pila)) return;
    await almacen.guardar(CLAVE, [...pendientes, reporte].slice(-MAXIMO_PENDIENTES));
  })
    .then(() => (tokenActual() ? enviarErroresPendientes() : undefined))
    .catch(() => {});
}

/** Manda los errores guardados. Sin conexión o con el servidor caído quedan para la próxima. */
export function enviarErroresPendientes(): Promise<void> {
  return enOrden(async () => {
    if (!tokenActual()) return;
    const pendientes = await leerPendientes();
    if (pendientes.length === 0) return;
    let enviados = 0;
    for (const reporte of pendientes) {
      try {
        await api.post('/errores-app', reporte);
      } catch (e) {
        const reintentar = e instanceof SinConexion || (e instanceof ErrorDelServidor && (e.estado >= 500 || e.estado === 401));
        if (reintentar) break;
        // Uno que el servidor rechaza (por ejemplo, de una versión vieja) se descarta.
      }
      enviados++;
    }
    await almacen.guardar(CLAVE, pendientes.slice(enviados));
  }).catch(() => {});
}

let instalada = false;

/** Captura los errores que nadie atrapó. Se llama una vez al cargar la app. */
export function instalarCapturaDeErrores(): void {
  if (instalada) return;
  instalada = true;
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    // Sin `error` es un error de un script de otro origen: el navegador no da el detalle.
    window.addEventListener('error', (ev) => ev.error && void registrarError(ev.error, false));
    window.addEventListener('unhandledrejection', (ev) => void registrarError(ev.reason, false));
    return;
  }
  const anterior = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, fatal) => {
    const guardado = registrarError(error, !!fatal);
    if (!fatal) return anterior(error, fatal);
    // Un cierre termina la app: se le da hasta 1 s para guardar el reporte.
    void Promise.race([guardado, new Promise((r) => setTimeout(r, 1000))]).finally(() => anterior(error, fatal));
  });
}
