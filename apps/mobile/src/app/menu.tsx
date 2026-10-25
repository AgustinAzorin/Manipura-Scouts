import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { formatearFechaHora } from '@scouttracker/shared';
import { useDatos } from '../lib/datos';
import { useSesion } from '../lib/sesion';
import { Aviso, Boton, confirmar, ItemMenu, Pantalla, Parrafo, Subtitulo } from '../ui/componentes';

export default function Menu() {
  const { yo, contexto, cerrarSesion } = useSesion();
  const { snapshot, sinConexion, recargar, cargando } = useDatos();
  const router = useRouter();
  if (!yo) return null;
  const incompletas = snapshot?.fichas.filter((f) => f.estado === 'incompleta').length ?? 0;
  const administra = yo.usuario.esAdminPlataforma || yo.gruposAdministrables.length > 0 || yo.ramasAdministrables.length > 0;
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
      <Boton titulo="Sincronizar ahora" variante="secundario" onPress={recargar} cargando={cargando} />
      <View>
        <Subtitulo>Padrón</Subtitulo>
        <ItemMenu titulo="Nómina" onPress={() => router.dismissTo('/nomina')} />
        <ItemMenu titulo="Fichas a completar" detalle={incompletas ? `${incompletas} incompletas` : 'Ninguna'} onPress={() => router.push('/incompletas')} />
        <ItemMenu titulo="Ex integrantes" detalle="Fichas archivadas (requiere conexión)" onPress={() => router.push('/ex-integrantes')} />
        {yo.contextos.length > 1 ? <ItemMenu titulo="Cambiar de rama o grupo" onPress={() => router.push('/contexto')} /> : null}
      </View>
      {administra ? (
        <View>
          <Subtitulo>Administración</Subtitulo>
          <ItemMenu titulo="Administración" detalle="Grupos, usuarios, roles, ramas, equipos, catálogos e importación" onPress={() => router.push('/admin')} />
        </View>
      ) : null}
      <Boton
        titulo="Cerrar sesión"
        variante="peligro"
        onPress={async () => {
          if (await confirmar('Cerrar sesión', 'Se borran del celular los datos guardados para usar sin conexión.', 'Cerrar sesión')) {
            await cerrarSesion();
            router.replace('/login');
          }
        }}
      />
    </Pantalla>
  );
}
