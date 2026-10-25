import { useLocalSearchParams, useRouter } from 'expo-router';
import { NOMBRE_MODULO, type Modulo, type RolDTO } from '@scouttracker/shared';
import { useCarga } from '../../../../lib/carga';
import { Aviso, Boton, Cargando, ItemMenu, Pantalla } from '../../../../ui/componentes';

/** RF-017 / RF-018 */
export default function Roles() {
  const { grupoId } = useLocalSearchParams<{ grupoId: string }>();
  const router = useRouter();
  const { datos: roles, error } = useCarga<RolDTO[]>(`/grupos/${grupoId}/roles`);
  if (error) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!roles) return <Cargando />;
  return (
    <Pantalla>
      <Boton titulo="Nuevo rol" onPress={() => router.push(`/admin/grupo/${grupoId}/rol/nuevo`)} />
      {roles.map((r) => (
        <ItemMenu
          key={r.id}
          titulo={`${r.nombre}${r.sistema ? ' (del sistema)' : ''}`}
          detalle={`${r.cantidadUsuarios} usuario(s) · ${r.verSensibles ? 'con' : 'sin'} datos sensibles\n${
            (Object.keys(r.permisos) as Modulo[]).map((m) => NOMBRE_MODULO[m]).join(', ') || 'Sin permisos'
          }`}
          onPress={() => router.push(`/admin/grupo/${grupoId}/rol/${r.id}`)}
        />
      ))}
    </Pantalla>
  );
}
