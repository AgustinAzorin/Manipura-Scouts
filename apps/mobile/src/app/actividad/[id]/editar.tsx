import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, mensajeDeError } from '../../../lib/api';
import { useActividad } from '../../../lib/actividades';
import { useDatos } from '../../../lib/datos';
import { Aviso, Cargando, Pantalla } from '../../../ui/componentes';
import { destinosDeAvisos, FormularioActividad } from '../../../ui/formulario-actividad';

/** RF-061. El alcance no cambia: para otro alcance se cancela y se crea otra actividad. */
export default function EditarActividad() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { snapshot, sinConexion, recargar } = useDatos();
  const { actividad } = useActividad(id);
  const router = useRouter();
  if (!snapshot || !actividad) return <Cargando />;
  return (
    <Pantalla>
      {sinConexion ? <Aviso tipo="aviso">Editar una actividad requiere conexión.</Aviso> : null}
      <FormularioActividad
        tipos={snapshot.tiposActividad}
        inicial={actividad}
        destinos={destinosDeAvisos(snapshot, snapshot.rama.nombre)}
        textoGuardar="Guardar cambios"
        alGuardar={async (d) => {
          try {
            await api.patch(`/actividades/${actividad.id}`, {
              tipoId: d.tipoId,
              nombre: d.nombre,
              inicio: d.inicio,
              fin: d.fin,
              lugar: d.lugar,
              avisos: d.avisos,
              destinoAvisos: d.destinoAvisos,
            });
            await recargar();
            router.back();
          } catch (e) {
            throw new Error(mensajeDeError(e));
          }
        }}
      />
    </Pantalla>
  );
}
