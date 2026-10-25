import { useRouter } from 'expo-router';
import { compararNombres, nombreCompleto } from '@scouttracker/shared';
import { useDatos } from '../lib/datos';
import { ItemMenu, Pantalla, Parrafo } from '../ui/componentes';

/** RF-050: listado de fichas a completar. */
export default function Incompletas() {
  const { snapshot } = useDatos();
  const router = useRouter();
  const lista = (snapshot?.fichas ?? []).filter((f) => f.estado === 'incompleta').sort(compararNombres);
  return (
    <Pantalla>
      {lista.length === 0 ? <Parrafo suave>No hay fichas incompletas.</Parrafo> : null}
      {lista.map((f) => (
        <ItemMenu key={f.id} titulo={nombreCompleto(f) || '(sin nombre)'} detalle={f.incompletaMotivos.join(' · ')} onPress={() => router.push(`/ficha/${f.id}`)} />
      ))}
    </Pantalla>
  );
}
