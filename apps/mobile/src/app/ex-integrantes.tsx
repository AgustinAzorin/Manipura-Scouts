import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { formatearFecha, nombreCompleto, type FichaDTO } from '@scouttracker/shared';
import { api, mensajeDeError } from '../lib/api';
import { useSesion } from '../lib/sesion';
import { Aviso, Cargando, ItemMenu, Pantalla, Parrafo } from '../ui/componentes';

/** RF-027: fichas archivadas de la rama. */
export default function ExIntegrantes() {
  const { contexto } = useSesion();
  const router = useRouter();
  const [lista, setLista] = useState<FichaDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (contexto) api.get<FichaDTO[]>(`/ramas/${contexto.ramaId}/archivadas`).then(setLista, (e) => setError(mensajeDeError(e)));
  }, [contexto]);
  if (error) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!lista) return <Cargando />;
  return (
    <Pantalla>
      <Parrafo suave>Las fichas archivadas se anonimizan automáticamente a los 2 años de la baja.</Parrafo>
      {lista.length === 0 ? <Parrafo suave>No hay ex integrantes.</Parrafo> : null}
      {lista.map((f) => (
        <ItemMenu key={f.id} titulo={nombreCompleto(f)} detalle={f.archivadaEn ? `Baja: ${formatearFecha(f.archivadaEn.slice(0, 10))}` : undefined} onPress={() => router.push(`/ficha/${f.id}`)} />
      ))}
    </Pantalla>
  );
}
