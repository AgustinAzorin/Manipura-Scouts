import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSesion } from '../../lib/sesion';
import { ItemMenu, Pantalla, Parrafo, Subtitulo } from '../../ui/componentes';

/** RI-002: toda la administración está en la app. */
export default function Administracion() {
  const { yo } = useSesion();
  const router = useRouter();
  if (!yo) return null;
  const ramas = yo.contextos.filter((c) => yo.ramasAdministrables.includes(c.ramaId));
  return (
    <Pantalla>
      {yo.usuario.esAdminPlataforma ? (
        <View>
          <Subtitulo>Plataforma</Subtitulo>
          <ItemMenu titulo="Grupos" detalle="Alta, desactivación y admins de cada grupo" onPress={() => router.push('/admin/plataforma')} />
        </View>
      ) : null}
      {yo.gruposAdministrables.map((g) => (
        <View key={g.grupoId}>
          <Subtitulo>{g.grupoNombre}</Subtitulo>
          <ItemMenu titulo="Usuarios" detalle="Invitar, roles asignados, desactivar" onPress={() => router.push(`/admin/grupo/${g.grupoId}/usuarios`)} />
          <ItemMenu titulo="Roles y permisos" onPress={() => router.push(`/admin/grupo/${g.grupoId}/roles`)} />
          <ItemMenu titulo="Ramas" onPress={() => router.push(`/admin/grupo/${g.grupoId}/ramas`)} />
        </View>
      ))}
      {ramas.length ? (
        <View>
          <Subtitulo>Configuración de ramas</Subtitulo>
          {ramas.map((r) => (
            <ItemMenu key={r.ramaId} titulo={`${r.ramaNombre} (${r.grupoNombre})`} detalle="Equipos, catálogos, campos e importación" onPress={() => router.push(`/admin/rama/${r.ramaId}`)} />
          ))}
        </View>
      ) : null}
      {!yo.usuario.esAdminPlataforma && !yo.gruposAdministrables.length && !ramas.length ? <Parrafo suave>No tenés permisos de administración.</Parrafo> : null}
    </Pantalla>
  );
}
