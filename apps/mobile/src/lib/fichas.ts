import { useCallback, useEffect, useState } from 'react';
import type { FichaDTO } from '@scouttracker/shared';
import { api, mensajeDeError, SinConexion } from './api';
import { useDatos } from './datos';

/**
 * Ficha para mostrar: la guardada en la nómina (funciona sin conexión) y, si hay conexión,
 * la versión más reciente del servidor. Las fichas archivadas solo se ven con conexión.
 */
export function useFicha(id: string | undefined) {
  const { snapshot, actualizarFicha } = useDatos();
  const local = snapshot?.fichas.find((f) => f.id === id) ?? null;
  const [remota, setRemota] = useState<FichaDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinConexion, setSinConexion] = useState(false);

  const recibir = useCallback(
    (f: FichaDTO) => {
      setRemota(f);
      setSinConexion(false);
      setError(null);
      actualizarFicha(f);
    },
    [actualizarFicha],
  );
  const fallar = useCallback((e: unknown) => {
    if (e instanceof SinConexion) setSinConexion(true);
    else setError(mensajeDeError(e));
  }, []);

  const recargar = useCallback(async () => {
    if (id) await api.get<FichaDTO>(`/fichas/${id}`).then(recibir, fallar);
  }, [id, recibir, fallar]);

  useEffect(() => {
    if (!id) return;
    let vigente = true;
    api.get<FichaDTO>(`/fichas/${id}`).then(
      (f) => vigente && recibir(f),
      (e) => vigente && fallar(e),
    );
    return () => {
      vigente = false;
    };
  }, [id, recibir, fallar]);

  const ficha = remota && (!local || remota.version >= local.version) ? remota : local;
  return { ficha, error, sinConexion, recargar, setFicha: (f: FichaDTO) => { setRemota(f); actualizarFicha(f); } };
}
