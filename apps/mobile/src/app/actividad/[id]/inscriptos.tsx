import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { nombreCompleto } from '@scouttracker/shared';
import { api, mensajeDeError } from '../../../lib/api';
import { useActividad } from '../../../lib/actividades';
import { useDatos } from '../../../lib/datos';
import { Aviso, Boton, Cargando, Interruptor, Pantalla, Parrafo } from '../../../ui/componentes';

/** RF-064: agregar o quitar inscriptos de la rama. Requiere conexión. */
export default function Inscriptos() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { snapshot, sinConexion, recargar } = useDatos();
  const { actividad } = useActividad(id);
  const router = useRouter();
  const [elegidos, setElegidos] = useState<Set<string> | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!snapshot || !actividad) return <Cargando />;

  const inscriptos = new Set(actividad.inscripciones.map((i) => i.fichaId));
  const actuales = elegidos ?? inscriptos;
  const cambiar = (fichaId: string, v: boolean) => {
    const n = new Set(actuales);
    if (v) n.add(fichaId);
    else n.delete(fichaId);
    setElegidos(n);
  };
  const agregar = [...actuales].filter((f) => !inscriptos.has(f));
  const quitar = [...inscriptos].filter((f) => !actuales.has(f));

  return (
    <Pantalla>
      {sinConexion ? <Aviso tipo="aviso">Cambiar los inscriptos requiere conexión.</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <Parrafo suave>Al quitar a alguien se borran su confirmación, su asistencia y su autorización en esta actividad.</Parrafo>
      {snapshot.fichas.map((f) => (
        <Interruptor key={f.id} etiqueta={nombreCompleto(f) || '(sin nombre)'} valor={actuales.has(f.id)} alCambiar={(v) => cambiar(f.id, v)} deshabilitado={sinConexion} />
      ))}
      <Boton
        titulo={agregar.length + quitar.length ? `Guardar (${agregar.length} nuevos, ${quitar.length} quitados)` : 'Sin cambios'}
        deshabilitado={sinConexion || agregar.length + quitar.length === 0}
        cargando={guardando}
        onPress={async () => {
          setError(null);
          setGuardando(true);
          try {
            await api.put(`/actividades/${actividad.id}/inscripciones`, { agregar, quitar });
            await recargar();
            router.back();
          } catch (e) {
            setError(mensajeDeError(e));
          } finally {
            setGuardando(false);
          }
        }}
      />
    </Pantalla>
  );
}
