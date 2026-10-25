import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { cuotasPendientes, documentosPendientes, nombreCompleto } from '@scouttracker/shared';
import { useDatos } from '../lib/datos';
import { Aviso, Cargando, ItemMenu, Pantalla, Parrafo } from '../ui/componentes';

/** RF-114: listado de un pendiente del inicio (documentos no presentados o cuotas adeudadas). */
export default function Pendientes() {
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  const { snapshot, sinConexion } = useDatos();
  const router = useRouter();
  const esCuotas = tipo === 'cuotas';
  const titulo = esCuotas ? 'Cuotas adeudadas' : 'Documentos no presentados';
  if (!snapshot) return <Pantalla>{sinConexion ? <Aviso tipo="aviso">Sin conexión y sin datos guardados de esta rama.</Aviso> : <Cargando />}</Pantalla>;
  const lista = esCuotas ? cuotasPendientes(snapshot.fichas) : documentosPendientes(snapshot.fichas);
  return (
    <Pantalla>
      <Stack.Screen options={{ title: titulo }} />
      {!lista ? <Parrafo>Tu rol no tiene permiso para ver {esCuotas ? 'cuotas' : 'documentos'}.</Parrafo> : null}
      {lista && lista.fichas.length === 0 ? <Parrafo suave>{esCuotas ? 'No hay cuotas adeudadas.' : 'No faltan documentos.'}</Parrafo> : null}
      {!esCuotas && lista?.fichas.length ? <Parrafo suave>El PDF adjunto general es opcional y no figura como pendiente.</Parrafo> : null}
      <View>
        {lista?.fichas.map((f) => (
          <ItemMenu key={f.fichaId} titulo={nombreCompleto(f) || '(sin nombre)'} detalle={f.detalle.join(' · ')} onPress={() => router.push(`/ficha/${f.fichaId}`)} />
        ))}
      </View>
    </Pantalla>
  );
}
