import { useEffect, useState } from 'react';
import { nombreCompleto, type ActividadDTO, type InscripcionDTO, type TipoActividadDTO } from '@scouttracker/shared';
import { api, mensajeDeError, SinConexion } from './api';
import { useDatos } from './datos';
import { useSesion } from './sesion';

export const nombreInscripto = (i: InscripcionDTO) => nombreCompleto(i) || 'Ficha anonimizada';

/**
 * Actividad de la rama: la guardada en el celular (con los registros pendientes) o, si es más
 * vieja que lo que se guarda para uso sin conexión, la que devuelve el servidor.
 */
export function useActividad(id: string | undefined): {
  actividad: ActividadDTO | null;
  tipo: TipoActividadDTO | undefined;
  /** La actividad está guardada en el celular: se puede registrar asistencia sin conexión. */
  guardada: boolean;
  error: string | null;
} {
  const { contexto } = useSesion();
  const { snapshot, actividades } = useDatos();
  const guardada = actividades.find((a) => a.id === id) ?? null;
  const [remota, setRemota] = useState<ActividadDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ramaId = contexto?.ramaId;

  useEffect(() => {
    if (guardada || !id || !ramaId || !snapshot) return;
    let vigente = true;
    api
      .get<ActividadDTO>(`/actividades/${id}?ramaId=${ramaId}`)
      .then((a) => vigente && setRemota(a))
      .catch((e) => vigente && setError(e instanceof SinConexion ? 'Esta actividad no está guardada en el celular y no hay conexión.' : mensajeDeError(e)));
    return () => {
      vigente = false;
    };
  }, [guardada, id, ramaId, snapshot]);

  const actividad = guardada ?? remota;
  return {
    actividad,
    tipo: snapshot?.tiposActividad.find((t) => t.id === actividad?.tipoId),
    guardada: !!guardada,
    error,
  };
}
