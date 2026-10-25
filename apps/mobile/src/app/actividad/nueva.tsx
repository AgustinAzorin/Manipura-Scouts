import { useRouter } from 'expo-router';
import type { ActividadDTO } from '@scouttracker/shared';
import { api, mensajeDeError } from '../../lib/api';
import { useDatos } from '../../lib/datos';
import { useSesion } from '../../lib/sesion';
import { Aviso, Cargando, Pantalla, Parrafo } from '../../ui/componentes';
import { FormularioActividad } from '../../ui/formulario-actividad';

/** RF-060 / RF-064: crea la actividad e inscribe a los protagonistas activos del alcance. */
export default function NuevaActividad() {
  const { contexto } = useSesion();
  const { snapshot, sinConexion, recargar } = useDatos();
  const router = useRouter();
  if (!contexto || !snapshot) return <Cargando />;
  if (sinConexion) {
    return (
      <Pantalla>
        <Aviso tipo="aviso">Crear una actividad requiere conexión.</Aviso>
      </Pantalla>
    );
  }
  const equipos = snapshot.rama.equipos.filter((e) => e.activo && (!contexto.soloEquipos || contexto.soloEquipos.includes(e.id)));
  // El servidor valida el permiso con el alcance elegido; acá se ofrecen los que tienen sentido.
  const alcances = [
    ...(contexto.soloEquipos ? [] : [{ valor: 'rama', etiqueta: `Rama ${contexto.ramaNombre}` }]),
    ...equipos.map((e) => ({ valor: e.id, etiqueta: `Equipo ${e.nombre}` })),
    ...(contexto.soloEquipos ? [] : [{ valor: 'grupo', etiqueta: `Todo el grupo (${contexto.grupoNombre})` }]),
  ];
  if (snapshot.tiposActividad.filter((t) => t.activo).length === 0) {
    return (
      <Pantalla>
        <Parrafo>El grupo no tiene tipos de actividad activos. El admin del grupo los configura en Administración.</Parrafo>
      </Pantalla>
    );
  }
  return (
    <Pantalla>
      <FormularioActividad
        tipos={snapshot.tiposActividad}
        alcances={alcances}
        textoGuardar="Crear actividad"
        alGuardar={async (d) => {
          try {
            const a = await api.post<ActividadDTO>('/actividades', {
              grupoId: contexto.grupoId,
              tipoId: d.tipoId,
              nombre: d.nombre,
              inicio: d.inicio,
              fin: d.fin,
              lugar: d.lugar,
              alcance: d.alcance,
              ramaId: d.alcance === 'grupo' ? null : contexto.ramaId,
              equipoId: d.equipoId,
            });
            await recargar();
            router.replace(`/actividad/${a.id}`);
          } catch (e) {
            throw new Error(mensajeDeError(e));
          }
        }}
      />
    </Pantalla>
  );
}
