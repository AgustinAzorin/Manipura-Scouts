import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { formatearFechaHora } from '@scouttracker/shared';
import { useDatos } from '../lib/datos';
import { useSesion } from '../lib/sesion';
import { Aviso, Boton, ItemMenu, Pantalla, Parrafo, Subtitulo } from '../ui/componentes';
import { useCerrarSesion, useSeccionesNavegacion } from '../ui/navegacion';

export default function Menu() {
  const { yo, contexto } = useSesion();
  const { snapshot, sinConexion, recargar, cargando, pendientes } = useDatos();
  const router = useRouter();
  const secciones = useSeccionesNavegacion();
  const salir = useCerrarSesion();
  if (!yo) return null;
  return (
    <Pantalla>
      <Parrafo>
        {yo.usuario.nombre} · {yo.usuario.email}
      </Parrafo>
      {contexto ? (
        <Parrafo suave>
          {contexto.grupoNombre} · {contexto.ramaNombre}
        </Parrafo>
      ) : null}
      {snapshot ? (
        <Aviso tipo={sinConexion ? 'aviso' : 'info'}>
          {sinConexion ? 'Sin conexión. ' : ''}Datos al {formatearFechaHora(snapshot.generadoEn)}
        </Aviso>
      ) : null}
      {pendientes.length ? (
        <Aviso tipo="info">
          {pendientes.length === 1 ? '1 registro de asistencia o autorización sin enviar' : `${pendientes.length} registros de asistencia o autorización sin enviar`}: se envían solos cuando haya conexión.
        </Aviso>
      ) : null}
      <Boton titulo="Sincronizar ahora" variante="secundario" onPress={recargar} cargando={cargando} />
      {secciones.map((s) => (
        <View key={s.titulo}>
          <Subtitulo>{s.titulo}</Subtitulo>
          {s.items.map((i) => (
            <ItemMenu key={i.ruta} titulo={i.titulo} detalle={i.detalle} onPress={() => (i.principal ? router.dismissTo(i.ruta) : router.push(i.ruta))} />
          ))}
        </View>
      ))}
      <Boton titulo="Cerrar sesión" variante="peligro" onPress={() => void salir()} />
    </Pantalla>
  );
}
