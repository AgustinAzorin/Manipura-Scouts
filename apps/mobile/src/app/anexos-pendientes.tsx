import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';
import { fechaAR, formatearFecha } from '@scouttracker/shared';
import { useDatos } from '../lib/datos';
import { useAnexosPendientes } from '../lib/fichaActividad';
import { Aviso, ItemMenu, Pantalla, Parrafo } from '../ui/componentes';

/** RF-095: anexos asignados al usuario que todavía tiene que completar. */
export default function AnexosPendientes() {
  const router = useRouter();
  const { sinConexion } = useDatos();
  const { anexos, recargar } = useAnexosPendientes();
  useFocusEffect(
    useCallback(() => {
      void recargar();
    }, [recargar]),
  );
  return (
    <Pantalla>
      {sinConexion ? <Aviso tipo="aviso">Sin conexión: los anexos se completan solo con conexión.</Aviso> : null}
      {anexos.length === 0 ? <Parrafo suave>No tenés anexos para completar.</Parrafo> : null}
      <View>
        {anexos.map((a) => (
          <ItemMenu
            key={a.id}
            titulo={`Anexo ${a.numero}${a.titulo.trim() ? ` · ${a.titulo.trim()}` : ''}`}
            detalle={`${a.actividadNombre} · ${formatearFecha(fechaAR(a.inicio))}`}
            onPress={() => router.push(`/ficha-actividad/${a.fichaActividadId}/anexo/${a.id}`)}
          />
        ))}
      </View>
    </Pantalla>
  );
}
