import { useCallback, useEffect, useState } from 'react';
import { api, mensajeDeError } from './api';

/** Carga un recurso de la API con estado de error y recarga. */
export function useCarga<T>(ruta: string | null) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recargar = useCallback(async () => {
    if (!ruta) return;
    try {
      const d = await api.get<T>(ruta);
      setDatos(d);
      setError(null);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }, [ruta]);
  useEffect(() => {
    if (!ruta) return;
    let vigente = true;
    api.get<T>(ruta).then(
      (d) => vigente && (setDatos(d), setError(null)),
      (e) => vigente && setError(mensajeDeError(e)),
    );
    return () => {
      vigente = false;
    };
  }, [ruta]);
  return { datos, error, recargar };
}

/** Ejecuta una acción y deja el mensaje de error o de éxito para mostrar. */
export function useAccion() {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const ejecutar = useCallback(async (nombre: string, fn: () => Promise<string | void>) => {
    setOcupado(nombre);
    setMensaje(null);
    try {
      const t = await fn();
      if (t) setMensaje({ tipo: 'exito', texto: t });
      return true;
    } catch (e) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(e) });
      return false;
    } finally {
      setOcupado(null);
    }
  }, []);
  return { ocupado, mensaje, ejecutar, setMensaje };
}
