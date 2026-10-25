import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { estadoActividad, formatearFechaHora, tienePermiso } from '@scouttracker/shared';
import { useDatos } from '../lib/datos';
import { useSesion } from '../lib/sesion';
import { TarjetaActividad } from '../ui/actividades';
import { Aviso, Boton, Cargando, Pantalla, Parrafo, Subtitulo } from '../ui/componentes';
import { espacio } from '../ui/tema';

/** Actividades de la rama guardadas en el celular: próximas, en curso y de los últimos 60 días. */
export default function Actividades() {
  const { contexto } = useSesion();
  const { snapshot, actividades, sinConexion, pendientes, recargar, cargando } = useDatos();
  const router = useRouter();
  if (!contexto) return null;
  if (!snapshot) return <Pantalla>{sinConexion ? <Aviso tipo="aviso">Sin conexión y sin datos guardados de esta rama.</Aviso> : <Cargando />}</Pantalla>;

  const tipo = (id: string) => snapshot.tiposActividad.find((t) => t.id === id);
  const ahora = new Date();
  const vigentes = actividades.filter((a) => estadoActividad(a, ahora) !== 'terminada').sort((a, b) => a.inicio.localeCompare(b.inicio));
  const pasadas = actividades.filter((a) => estadoActividad(a, ahora) === 'terminada').sort((a, b) => b.inicio.localeCompare(a.inicio));
  const puedeVer = tienePermiso(contexto.permisos, 'actividades', 'ver');
  const puedeCrear = tienePermiso(contexto.permisos, 'actividades', 'crear');

  if (!puedeVer) {
    return (
      <Pantalla>
        <Parrafo>Tu rol no tiene permiso para ver actividades.</Parrafo>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      {sinConexion ? (
        <Aviso tipo="aviso">
          Sin conexión. Datos al {formatearFechaHora(snapshot.generadoEn)}. Podés marcar asistencia y autorizaciones: se envían solas cuando vuelva la señal.
        </Aviso>
      ) : null}
      {pendientes.length ? <Aviso tipo="info">{pendientes.length === 1 ? '1 registro sin enviar.' : `${pendientes.length} registros sin enviar.`}</Aviso> : null}
      {puedeCrear ? <Boton titulo="+ Nueva actividad" onPress={() => router.push('/actividad/nueva')} deshabilitado={sinConexion} /> : null}

      <Subtitulo>Próximas y en curso</Subtitulo>
      {vigentes.length === 0 ? <Parrafo suave>No hay actividades próximas.</Parrafo> : null}
      <View style={{ gap: espacio.m }}>
        {vigentes.map((a) => (
          <TarjetaActividad key={a.id} actividad={a} tipo={tipo(a.tipoId)} onPress={() => router.push(`/actividad/${a.id}`)} />
        ))}
      </View>

      <Subtitulo>Recientes</Subtitulo>
      {pasadas.length === 0 ? <Parrafo suave>No hubo actividades en los últimos 60 días.</Parrafo> : null}
      <View style={{ gap: espacio.m }}>
        {pasadas.map((a) => (
          <TarjetaActividad key={a.id} actividad={a} tipo={tipo(a.tipoId)} onPress={() => router.push(`/actividad/${a.id}`)} />
        ))}
      </View>

      <Boton titulo="Actividades anteriores" variante="secundario" onPress={() => router.push('/actividades-anteriores')} deshabilitado={sinConexion} />
      <Boton titulo="Sincronizar ahora" variante="texto" onPress={recargar} cargando={cargando} />
    </Pantalla>
  );
}
