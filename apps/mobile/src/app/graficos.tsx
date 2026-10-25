import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import {
  armarGraficos,
  armarNomina,
  describirFiltros,
  formatearFechaHora,
  hayFiltros,
  hoyAR,
  tienePermiso,
} from '@scouttracker/shared';
import { useDatos } from '../lib/datos';
import { usePreferenciasNomina } from '../lib/preferencias';
import { useSesion } from '../lib/sesion';
import { Aviso, Boton, Cargando, Pantalla, Parrafo, Selector } from '../ui/componentes';
import { GraficoBarras } from '../ui/graficos';
import { espacio } from '../ui/tema';

/**
 * RF-106 a RF-112: gráficos de los protagonistas activos de la rama. Se calculan con los datos
 * guardados en el celular, así que funcionan sin conexión. Desde la nómina (`nomina=1`) llegan con
 * sus filtros y su vista por equipo. La búsqueda por texto no
 * viaja: no es un filtro y puede tener el nombre de un protagonista.
 */
export default function Graficos() {
  const { yo, contexto, elegirRama } = useSesion();
  const { snapshot, indice, sinConexion, error } = useDatos();
  const router = useRouter();
  const params = useLocalSearchParams<{ equipo?: string; nomina?: string }>();
  const { prefs } = usePreferenciasNomina(yo?.usuario.id, contexto?.ramaId);
  const conNomina = params.nomina === '1';
  const filtros = useMemo(() => (conNomina ? prefs.filtros : {}), [conNomina, prefs.filtros]);
  const equipoId = snapshot?.rama.equipos.some((e) => e.id === params.equipo) ? params.equipo! : null;
  const hoy = hoyAR();

  const graficos = useMemo(() => {
    if (!snapshot || !indice || !contexto) return [];
    const lista = armarNomina(snapshot.fichas, indice, { filtros, equipoId, hoy });
    return armarGraficos(lista, indice, { verSensibles: snapshot.contexto.verSensibles, equipos: equipoId ? [equipoId] : contexto.soloEquipos, hoy });
  }, [snapshot, indice, contexto, filtros, equipoId, hoy]);

  if (!contexto || !yo) return null;
  if (!tienePermiso(contexto.permisos, 'graficos', 'ver')) {
    return (
      <Pantalla>
        <Parrafo>Tu rol no tiene permiso para ver gráficos.</Parrafo>
      </Pantalla>
    );
  }
  if (!snapshot || !indice) {
    return (
      <Pantalla>
        {error ? <Aviso tipo="error">{error}</Aviso> : null}
        {sinConexion ? <Aviso tipo="aviso">Sin conexión y sin datos guardados de esta rama.</Aviso> : <Cargando />}
      </Pantalla>
    );
  }

  // RF-111: por rama (las del mismo grupo en las que trabaja el usuario) y por equipo.
  const ramas = yo.contextos.filter((c) => c.grupoId === contexto.grupoId);
  const equipos = snapshot.rama.equipos.filter((e) => !contexto.soloEquipos || contexto.soloEquipos.includes(e.id));
  const equipoOculto = (snapshot.rama.camposOcultos as string[]).includes('equipoId');
  const cantidad = graficos[0]?.total ?? 0;

  return (
    <Pantalla>
      {sinConexion ? <Aviso tipo="aviso">Sin conexión. Datos al {formatearFechaHora(snapshot.generadoEn)}</Aviso> : null}
      <View style={{ gap: espacio.s }}>
        {ramas.length > 1 ? (
          <Selector
            etiqueta="Rama"
            permitirVacio={false}
            valor={contexto.ramaId}
            opciones={ramas.map((c) => ({ valor: c.ramaId, etiqueta: c.ramaNombre, detalle: c.comunidad ?? undefined }))}
            alCambiar={(v) => {
              if (typeof v !== 'string' || v === contexto.ramaId) return;
              // Los equipos y filtros son de la rama anterior.
              router.setParams({ equipo: undefined, nomina: undefined });
              void elegirRama(v);
            }}
          />
        ) : null}
        {equipos.length > 0 && !equipoOculto ? (
          <Selector
            etiqueta="Equipo"
            textoVacio={contexto.soloEquipos ? 'Todos mis equipos' : 'Toda la rama'}
            valor={equipoId}
            opciones={equipos.map((e) => ({ valor: e.id, etiqueta: e.activo ? e.nombre : `${e.nombre} (inactivo)` }))}
            alCambiar={(v) => router.setParams({ equipo: typeof v === 'string' ? v : undefined })}
          />
        ) : null}
      </View>
      {conNomina && hayFiltros(filtros) ? (
        <View style={{ gap: espacio.s }}>
          <Aviso tipo="info">Con los filtros de la nómina: {describirFiltros(filtros, indice).join(' · ')}</Aviso>
          <Boton titulo="Ver sin los filtros de la nómina" variante="secundario" onPress={() => router.setParams({ nomina: undefined })} />
        </View>
      ) : null}
      <Parrafo suave>
        {cantidad === 1 ? '1 protagonista activo' : `${cantidad} protagonistas activos`}. Las fichas archivadas no se cuentan.
      </Parrafo>
      {graficos.map((g) => (
        <GraficoBarras key={g.id} grafico={g} />
      ))}
    </Pantalla>
  );
}
