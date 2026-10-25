import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { coincideBusqueda, fechaAR, formatearFecha, type AnexoReutilizableDTO } from '@scouttracker/shared';
import { api } from '../../../lib/api';
import { useAccion, useCarga } from '../../../lib/carga';
import { Aviso, Campo, Cargando, ItemMenu, Pantalla, Parrafo } from '../../../ui/componentes';

/** RF-105: copia un anexo de otra Ficha de Actividad. La copia es independiente del original. */
export default function ReutilizarAnexo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { datos, error } = useCarga<AnexoReutilizableDTO[]>(`/fichas-actividad/${id}/anexos-reutilizables`);
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [busqueda, setBusqueda] = useState('');
  const lista = useMemo(
    () => (datos ?? []).filter((a) => coincideBusqueda(busqueda, { apellido: a.titulo, nombre: a.actividadNombre })),
    [datos, busqueda],
  );
  if (error) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!datos) return <Cargando />;
  return (
    <Pantalla>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Parrafo suave>El anexo se copia como uno nuevo de esta ficha, asignado a vos. Cambiar la copia no cambia el original.</Parrafo>
      <Campo etiqueta="Buscar por título o actividad" value={busqueda} onChangeText={setBusqueda} autoCorrect={false} />
      {lista.length === 0 ? <Parrafo suave>{datos.length ? 'Ningún anexo coincide.' : 'No hay anexos de otras fichas que puedas ver.'}</Parrafo> : null}
      <View>
        {lista.map((a) => (
          <ItemMenu
            key={a.id}
            titulo={a.titulo}
            detalle={[a.categoria, `${a.actividadNombre} (${formatearFecha(fechaAR(a.inicio))})`, a.ramaNombre, ocupado === a.id ? 'Copiando…' : null].filter(Boolean).join(' · ')}
            onPress={() =>
              void ejecutar(a.id, async () => {
                await api.post(`/fichas-actividad/${id}/anexos/copiar`, { anexoId: a.id });
                router.back();
              })
            }
          />
        ))}
      </View>
    </Pantalla>
  );
}
