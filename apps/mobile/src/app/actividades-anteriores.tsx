import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { hoyAR, type ActividadDTO } from '@scouttracker/shared';
import { api, mensajeDeError } from '../lib/api';
import { useDatos } from '../lib/datos';
import { useSesion } from '../lib/sesion';
import { TarjetaActividad } from '../ui/actividades';
import { Aviso, Boton, Cargando, Pantalla, Parrafo } from '../ui/componentes';
import { espacio } from '../ui/tema';

/** RF-070: actividades de un año, para consultar su asistencia. Requiere conexión. */
export default function ActividadesAnteriores() {
  const { contexto } = useSesion();
  const { snapshot } = useDatos();
  const router = useRouter();
  const [anio, setAnio] = useState(Number(hoyAR().slice(0, 4)));
  // El resultado se guarda con su año para no mostrar el de otro año mientras carga.
  const [resultado, setResultado] = useState<{ clave: string; lista?: ActividadDTO[]; error?: string } | null>(null);
  const ramaId = contexto?.ramaId;
  const clave = `${ramaId}:${anio}`;

  useEffect(() => {
    if (!ramaId) return;
    let vigente = true;
    api
      .get<ActividadDTO[]>(`/ramas/${ramaId}/actividades?anio=${anio}`)
      .then((l) => vigente && setResultado({ clave, lista: l.sort((a, b) => b.inicio.localeCompare(a.inicio)) }))
      .catch((e) => vigente && setResultado({ clave, error: mensajeDeError(e) }));
    return () => {
      vigente = false;
    };
  }, [ramaId, anio, clave]);

  const actual = resultado?.clave === clave ? resultado : null;
  const lista = actual?.lista ?? null;
  const error = actual?.error ?? null;
  const tipo = (id: string) => snapshot?.tiposActividad.find((t) => t.id === id);
  return (
    <Pantalla>
      <View style={{ flexDirection: 'row', gap: espacio.s, alignItems: 'center' }}>
        <Boton titulo="‹" variante="secundario" onPress={() => setAnio(anio - 1)} etiquetaAccesible={`Año ${anio - 1}`} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Parrafo>Año {anio}</Parrafo>
        </View>
        <Boton titulo="›" variante="secundario" onPress={() => setAnio(anio + 1)} etiquetaAccesible={`Año ${anio + 1}`} />
      </View>
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {!lista && !error ? <Cargando /> : null}
      {lista?.length === 0 ? <Parrafo suave>No hubo actividades en {anio}.</Parrafo> : null}
      <View style={{ gap: espacio.m }}>
        {lista?.map((a) => <TarjetaActividad key={a.id} actividad={a} tipo={tipo(a.tipoId)} onPress={() => router.push(`/actividad/${a.id}/reporte`)} />)}
      </View>
    </Pantalla>
  );
}
