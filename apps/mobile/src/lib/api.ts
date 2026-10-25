import { CODIGOS_ERROR, type ErrorApi } from '@scouttracker/shared';

/** URL del servidor por defecto: se define al compilar con EXPO_PUBLIC_API_URL. */
export const URL_API_POR_DEFECTO = normalizarUrl(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000');
let urlServidor = URL_API_POR_DEFECTO;

export function normalizarUrl(url: string): string {
  const u = url.trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(u) ? u : `http://${u}`;
}

/** URL del servidor en uso. Las builds de prueba permiten cambiarla (ver servidor.ts). */
export function urlApi(): string {
  return urlServidor;
}

export function usarServidor(url: string) {
  urlServidor = normalizarUrl(url);
}

const TIEMPO_MAXIMO_MS = 20_000;

/** Error devuelto por el servidor, con su código (ver CODIGOS_ERROR). */
export class ErrorDelServidor extends Error {
  constructor(
    public readonly estado: number,
    public readonly datos: ErrorApi & Record<string, unknown>,
  ) {
    super(datos.mensaje);
  }
  get codigo() {
    return this.datos.codigo;
  }
}

/** No hubo respuesta: sin señal, servidor caído o tiempo agotado. */
export class SinConexion extends Error {
  constructor() {
    super('No hay conexión con el servidor');
  }
}

let token: string | null = null;
let alPerderSesion: (() => void) | null = null;

export function configurarApi(opciones: { token: string | null; alPerderSesion?: () => void }) {
  token = opciones.token;
  if (opciones.alPerderSesion) alPerderSesion = opciones.alPerderSesion;
}

export function tokenActual() {
  return token;
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function pedir<T>(metodo: Metodo, ruta: string, cuerpo?: unknown): Promise<T> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
  const esFormulario = typeof FormData !== 'undefined' && cuerpo instanceof FormData;
  const tokenEnviado = token;
  let r: Response;
  try {
    r = await fetch(`${urlServidor}${ruta}`, {
      method: metodo,
      headers: {
        ...(tokenEnviado ? { Authorization: `Bearer ${tokenEnviado}` } : {}),
        ...(cuerpo !== undefined && !esFormulario ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo === undefined ? undefined : esFormulario ? (cuerpo as FormData) : JSON.stringify(cuerpo),
      signal: control.signal,
    });
  } catch {
    throw new SinConexion();
  } finally {
    clearTimeout(temporizador);
  }
  const texto = await r.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!r.ok) {
    const error = new ErrorDelServidor(r.status, datos ?? { codigo: 'ERROR', mensaje: `Error ${r.status}` });
    // RNF-020 / RNF-021: sesión inválida (vencida, cerrada o usuario desactivado) → se borra todo.
    // Solo si el 401 corresponde a la sesión actual: un pedido que salió sin token (antes de leer
    // la sesión guardada) o con el de una sesión anterior no debe cerrar la que está abierta.
    if (r.status === 401 && tokenEnviado && tokenEnviado === token && alPerderSesion) alPerderSesion();
    throw error;
  }
  return datos as T;
}

export const api = {
  get: <T>(ruta: string) => pedir<T>('GET', ruta),
  post: <T>(ruta: string, cuerpo: unknown = {}) => pedir<T>('POST', ruta, cuerpo),
  patch: <T>(ruta: string, cuerpo: unknown) => pedir<T>('PATCH', ruta, cuerpo),
  put: <T>(ruta: string, cuerpo: unknown) => pedir<T>('PUT', ruta, cuerpo),
  delete: <T>(ruta: string, cuerpo?: unknown) => pedir<T>('DELETE', ruta, cuerpo),
};

/** Mensaje para mostrar al usuario a partir de cualquier error. */
export function mensajeDeError(e: unknown): string {
  if (e instanceof SinConexion) return 'Esta acción requiere conexión. Revisá la señal e intentá de nuevo.';
  if (e instanceof ErrorDelServidor) return e.message;
  return 'Ocurrió un error inesperado';
}

export const esGrupoDesactivado = (e: unknown) => e instanceof ErrorDelServidor && e.codigo === CODIGOS_ERROR.grupoDesactivado;
export const esSinPermiso = (e: unknown) => e instanceof ErrorDelServidor && e.codigo === CODIGOS_ERROR.sinPermiso;
