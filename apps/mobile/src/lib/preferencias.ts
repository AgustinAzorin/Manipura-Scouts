import { useCallback, useEffect, useState } from 'react';
import { COLUMNAS_POR_DEFECTO, type Direccion, type FiltrosNomina } from '@scouttracker/shared';
import { almacenPreferencias } from './sesion';

export interface PreferenciasNomina {
  columnas: string[];
  filtros: FiltrosNomina;
  orden: { columna: string; direccion: Direccion } | null;
}

const INICIALES: PreferenciasNomina = { columnas: COLUMNAS_POR_DEFECTO, filtros: {}, orden: null };

/** RF-030 / RF-031: columnas, filtros y orden se conservan por usuario y por rama. */
export function usePreferenciasNomina(usuarioId: string | undefined, ramaId: string | undefined) {
  const clave = usuarioId && ramaId ? `nomina:${usuarioId}:${ramaId}` : null;
  // Las preferencias se guardan con su clave: al cambiar de rama no se mezclan.
  const [estado, setEstado] = useState<{ clave: string; prefs: PreferenciasNomina } | null>(null);

  useEffect(() => {
    if (!clave) return;
    let vigente = true;
    void almacenPreferencias.leer<PreferenciasNomina>(clave).then((p) => {
      if (vigente) setEstado({ clave, prefs: { ...INICIALES, ...(p ?? {}) } });
    });
    return () => {
      vigente = false;
    };
  }, [clave]);

  const listas = !!clave && estado?.clave === clave;
  const prefs = listas ? estado!.prefs : INICIALES;

  const cambiar = useCallback(
    (parcial: Partial<PreferenciasNomina>) => {
      if (!clave) return;
      setEstado((e) => {
        const nuevo = { ...(e?.clave === clave ? e.prefs : INICIALES), ...parcial };
        void almacenPreferencias.guardar(clave, nuevo);
        return { clave, prefs: nuevo };
      });
    },
    [clave],
  );

  return { prefs, cambiar, listas };
}
