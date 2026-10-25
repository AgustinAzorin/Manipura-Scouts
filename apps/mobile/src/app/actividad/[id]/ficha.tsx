import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { tienePermiso, type FichaActividadDTO } from '@scouttracker/shared';
import { api, ErrorDelServidor, mensajeDeError } from '../../../lib/api';
import { useActividad } from '../../../lib/actividades';
import { useSesion } from '../../../lib/sesion';
import { Aviso, Boton, Cargando, Pantalla, Parrafo } from '../../../ui/componentes';

/**
 * RF-068: abre la Ficha de Actividad de la actividad o, si todavía no tiene, ofrece crearla.
 * La ficha toma la fecha y el lugar de la actividad y el diagnóstico de la última ficha de la rama.
 */
export default function FichaDeActividad() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { contexto } = useSesion();
  const { actividad } = useActividad(id);
  const router = useRouter();
  const [estado, setEstado] = useState<'cargando' | 'sinFicha' | { error: string }>('cargando');
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    if (!id) return;
    let vigente = true;
    api
      .get<FichaActividadDTO>(`/actividades/${id}/ficha-actividad`)
      .then((f) => vigente && router.replace(`/ficha-actividad/${f.id}`))
      .catch((e) => {
        if (!vigente) return;
        if (e instanceof ErrorDelServidor && e.codigo === 'SIN_FICHA') setEstado('sinFicha');
        else setEstado({ error: mensajeDeError(e) });
      });
    return () => {
      vigente = false;
    };
  }, [id, router]);

  if (estado === 'cargando') return <Cargando />;
  if (typeof estado === 'object') return <Pantalla><Aviso tipo="error">{estado.error}</Aviso></Pantalla>;

  const puedeCrear = !!contexto && tienePermiso(contexto.permisos, 'fichaActividad', 'crear');
  const crear = async () => {
    setCreando(true);
    try {
      const f = await api.post<FichaActividadDTO>(`/actividades/${id}/ficha-actividad`, { ramaId: contexto?.ramaId });
      router.replace(`/ficha-actividad/${f.id}`);
    } catch (e) {
      setEstado({ error: mensajeDeError(e) });
    } finally {
      setCreando(false);
    }
  };
  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Ficha de Actividad' }} />
      <Parrafo>{actividad ? `"${actividad.nombre}" todavía no tiene Ficha de Actividad.` : 'La actividad todavía no tiene Ficha de Actividad.'}</Parrafo>
      {puedeCrear ? (
        <>
          <Parrafo suave>La ficha toma la fecha y el lugar de la actividad, y el diagnóstico de la última ficha de la rama.</Parrafo>
          <Boton titulo="Crear Ficha de Actividad" onPress={() => void crear()} cargando={creando} />
        </>
      ) : (
        <Aviso tipo="info">No tenés permiso para crear Fichas de Actividad en esta rama.</Aviso>
      )}
    </Pantalla>
  );
}
