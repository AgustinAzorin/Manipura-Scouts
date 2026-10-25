import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  armarNomina,
  columnasDisponibles,
  formatearFechaHora,
  hayFiltros,
  hoyAR,
  NOMBRE_ESTADO_TADA,
  siguienteOrden,
  SIN_VALOR,
  tienePermiso,
  type FiltrosNomina,
} from '@scouttracker/shared';
import { useDatos } from '../lib/datos';
import { Logo } from '../lib/logos';
import { usePreferenciasNomina } from '../lib/preferencias';
import { useSesion } from '../lib/sesion';
import { Aviso, Boton, Campo, Cargando, Interruptor, Pantalla, Parrafo, Selector, Subtitulo } from '../ui/componentes';
import { TablaNomina } from '../ui/tabla';
import { colores, espacio, TACTIL_MINIMO, texto } from '../ui/tema';

/** RF-029 a RF-034 y RF-056. */
export default function Nomina() {
  const { yo, contexto } = useSesion();
  const { snapshot, indice, cargando, sinConexion, error, recargar } = useDatos();
  const router = useRouter();
  const params = useLocalSearchParams<{ equipo?: string }>();
  const { prefs, cambiar } = usePreferenciasNomina(yo?.usuario.id, contexto?.ramaId);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState<'filtros' | 'columnas' | null>(null);
  const equipoId = params.equipo ?? null;
  const hoy = hoyAR();

  const disponibles = useMemo(
    () => (snapshot ? columnasDisponibles(snapshot.rama, snapshot.contexto.verSensibles) : []),
    [snapshot],
  );
  const columnas = useMemo(() => {
    const ids = new Set(['nombre', ...prefs.columnas]);
    return disponibles.filter((c) => ids.has(c.id));
  }, [disponibles, prefs.columnas]);
  const lista = useMemo(
    () =>
      snapshot && indice
        ? armarNomina(snapshot.fichas, indice, {
            busqueda,
            filtros: prefs.filtros,
            orden: prefs.orden,
            equipoId,
            hoy,
          })
        : [],
    [snapshot, indice, busqueda, prefs.filtros, prefs.orden, equipoId, hoy],
  );

  if (!contexto) {
    return (
      <Pantalla>
        <Parrafo>Elegí una rama para ver la nómina.</Parrafo>
        <Boton titulo="Elegir rama" onPress={() => router.replace('/')} />
      </Pantalla>
    );
  }
  if (!snapshot || !indice) {
    return (
      <Pantalla>
        <Stack.Screen options={{ title: contexto.ramaNombre, headerRight: () => <BotonMenu /> }} />
        {error ? <Aviso tipo="error">{error}</Aviso> : null}
        {sinConexion ? <Aviso tipo="aviso">Sin conexión y sin datos guardados de esta rama. Conectate para descargarlos.</Aviso> : <Cargando mensaje="Descargando la nómina…" />}
        {sinConexion ? <Boton titulo="Reintentar" onPress={recargar} cargando={cargando} /> : null}
      </Pantalla>
    );
  }

  const equipos = snapshot.rama.equipos.filter((e) => !contexto.soloEquipos || contexto.soloEquipos.includes(e.id));
  const equipoActual = equipoId ? snapshot.rama.equipos.find((e) => e.id === equipoId) : null;
  const puedeCrear = tienePermiso(contexto.permisos, 'padron', 'crear');
  const cantidadFiltros = contarFiltros(prefs.filtros);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colores.fondo }} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: equipoActual ? `Equipo ${equipoActual.nombre}` : contexto.ramaNombre,
          headerBackVisible: !!equipoActual,
          headerRight: () => <BotonMenu />,
        }}
      />
      {/* RF-056: antigüedad de los datos sin conexión. */}
      {sinConexion ? (
        <View style={e.franjaSinConexion} accessibilityRole="alert">
          <Text style={e.textoFranja}>Sin conexión. Datos al {formatearFechaHora(snapshot.generadoEn)}</Text>
        </View>
      ) : null}
      <View style={e.barra}>
        <TextInput
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder={snapshot.contexto.verSensibles ? 'Buscar por nombre, apellido o DNI' : 'Buscar por nombre o apellido'}
          placeholderTextColor={colores.textoSuave}
          accessibilityLabel="Buscar en la nómina"
          style={e.buscador}
          autoCorrect={false}
        />
        <View style={e.acciones}>
          <Boton titulo={cantidadFiltros ? `Filtros (${cantidadFiltros})` : 'Filtros'} variante="secundario" onPress={() => setModal('filtros')} estilo={{ flex: 1 }} />
          <Boton titulo="Columnas" variante="secundario" onPress={() => setModal('columnas')} estilo={{ flex: 1 }} />
          {puedeCrear ? <Boton titulo="+ Nueva" onPress={() => router.push('/ficha/nueva')} estilo={{ flex: 1 }} deshabilitado={sinConexion} /> : null}
        </View>
        {/* RF-034: vista por equipo. */}
        {equipos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espacio.s }}>
            {!contexto.soloEquipos ? <Chip titulo="Toda la rama" activo={!equipoId} onPress={() => router.setParams({ equipo: undefined })} /> : null}
            {equipos.map((eq) => (
              <Chip key={eq.id} titulo={eq.nombre} logo={eq.logo} activo={equipoId === eq.id} inactivo={!eq.activo} onPress={() => router.setParams({ equipo: eq.id })} />
            ))}
          </ScrollView>
        ) : null}
        <Text style={e.cuenta} accessibilityLiveRegion="polite">
          {lista.length === 1 ? '1 protagonista' : `${lista.length} protagonistas`}
          {busqueda || hayFiltros(prefs.filtros) ? ` de ${snapshot.fichas.filter((f) => !equipoId || f.equipoId === equipoId).length}` : ''}
        </Text>
      </View>
      {lista.length === 0 ? (
        <View style={{ padding: espacio.l }}>
          <Parrafo suave>{snapshot.fichas.length === 0 ? 'La rama todavía no tiene fichas.' : 'Ninguna ficha coincide con la búsqueda o los filtros.'}</Parrafo>
        </View>
      ) : (
        <TablaNomina
          fichas={lista}
          columnas={columnas}
          indice={indice}
          orden={prefs.orden}
          hoy={hoy}
          alOrdenar={(c) => cambiar({ orden: siguienteOrden(prefs.orden, c) })}
          alAbrir={(f) => router.push(`/ficha/${f.id}`)}
        />
      )}
      <ModalFiltros
        visible={modal === 'filtros'}
        cerrar={() => setModal(null)}
        filtros={prefs.filtros}
        alCambiar={(filtros) => cambiar({ filtros })}
      />
      <ModalColumnas
        visible={modal === 'columnas'}
        cerrar={() => setModal(null)}
        disponibles={disponibles.filter((c) => c.id !== 'nombre').map((c) => ({ id: c.id, etiqueta: c.etiqueta }))}
        elegidas={prefs.columnas}
        alCambiar={(columnas) => cambiar({ columnas })}
      />
    </SafeAreaView>
  );
}

function contarFiltros(f: FiltrosNomina): number {
  return (
    [f.equipo, f.elemento, f.etapa, f.promesa, f.tada].filter((x) => x?.length).length +
    (f.edadDesde != null || f.edadHasta != null ? 1 : 0) +
    Object.values(f.propios ?? {}).filter((v) => v.length).length +
    (f.soloIncompletas ? 1 : 0)
  );
}

function BotonMenu() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push('/menu')} accessibilityRole="button" accessibilityLabel="Menú" style={{ minHeight: TACTIL_MINIMO, minWidth: TACTIL_MINIMO, justifyContent: 'center', paddingHorizontal: espacio.s }}>
      <Text style={{ color: colores.primarioTexto, fontSize: texto.normal, fontWeight: '700' }}>Menú</Text>
    </Pressable>
  );
}

function Chip({ titulo, activo, inactivo, logo, onPress }: { titulo: string; activo: boolean; inactivo?: boolean; logo?: string | null; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      accessibilityLabel={`Ver ${titulo}`}
      style={[e.chip, activo && { backgroundColor: colores.primario, borderColor: colores.primario }]}
    >
      <Logo id={logo} tamano={20} />
      <Text style={[e.textoChip, activo && { color: colores.primarioTexto }, inactivo && !activo && { fontStyle: 'italic' }]}>
        {titulo}
        {inactivo ? ' (inactivo)' : ''}
      </Text>
    </Pressable>
  );
}

function ModalFiltros({ visible, cerrar, filtros, alCambiar }: { visible: boolean; cerrar(): void; filtros: FiltrosNomina; alCambiar(f: FiltrosNomina): void }) {
  const { snapshot } = useDatos();
  const [desde, setDesde] = useState(filtros.edadDesde != null ? String(filtros.edadDesde) : '');
  const [hasta, setHasta] = useState(filtros.edadHasta != null ? String(filtros.edadHasta) : '');
  if (!snapshot) return null;
  const rama = snapshot.rama;
  const oculto = (c: string) => (rama.camposOcultos as string[]).includes(c);
  const valores = (cat: string) =>
    rama.catalogos.filter((v) => v.catalogo === cat).map((v) => ({ valor: v.id, etiqueta: v.activo ? v.nombre : `${v.nombre} (desactivado)` }));
  const poner = (k: keyof FiltrosNomina, v: unknown) => alCambiar({ ...filtros, [k]: v });
  const numero = (s: string) => (s.trim() === '' || Number.isNaN(Number(s.replace(',', '.'))) ? null : Number(s.replace(',', '.')));
  const propios = rama.camposPropios.filter((c) => c.activo && (c.tipo === 'lista' || c.tipo === 'booleano') && (snapshot.contexto.verSensibles || !c.sensible));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cerrar}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colores.fondo }}>
        <Pantalla>
          <Subtitulo>Filtros</Subtitulo>
          {!oculto('equipoId') ? (
            <Selector etiqueta="Equipo" multiple valor={filtros.equipo ?? []} alCambiar={(v) => poner('equipo', v)} opciones={[...rama.equipos.map((x) => ({ valor: x.id, etiqueta: x.nombre })), { valor: SIN_VALOR, etiqueta: 'Sin equipo' }]} />
          ) : null}
          {!oculto('elementoId') ? <Selector etiqueta="Elemento" multiple valor={filtros.elemento ?? []} alCambiar={(v) => poner('elemento', v)} opciones={valores('elemento')} /> : null}
          {!oculto('etapaId') ? <Selector etiqueta="Etapa" multiple valor={filtros.etapa ?? []} alCambiar={(v) => poner('etapa', v)} opciones={valores('etapa')} /> : null}
          {!oculto('promesaId') ? <Selector etiqueta="Promesa" multiple valor={filtros.promesa ?? []} alCambiar={(v) => poner('promesa', v)} opciones={valores('promesa')} /> : null}
          {!oculto('tieneTada') ? (
            <Selector
              etiqueta="Estado de TADA"
              multiple
              valor={filtros.tada ?? []}
              alCambiar={(v) => poner('tada', v)}
              opciones={(['tiene', 'puedeHacer', 'noPuede'] as const).map((t) => ({ valor: t, etiqueta: NOMBRE_ESTADO_TADA[t] }))}
            />
          ) : null}
          <View style={{ flexDirection: 'row', gap: espacio.m }}>
            <View style={{ flex: 1 }}>
              <Campo etiqueta="Edad desde" value={desde} keyboardType="numeric" onChangeText={(t) => { setDesde(t); poner('edadDesde', numero(t)); }} />
            </View>
            <View style={{ flex: 1 }}>
              <Campo etiqueta="Edad hasta" value={hasta} keyboardType="numeric" onChangeText={(t) => { setHasta(t); poner('edadHasta', numero(t)); }} />
            </View>
          </View>
          {propios.map((c) => (
            <Selector
              key={c.id}
              etiqueta={c.nombre}
              multiple
              valor={filtros.propios?.[c.id] ?? []}
              alCambiar={(v) => poner('propios', { ...(filtros.propios ?? {}), [c.id]: v as string[] })}
              opciones={[
                ...(c.tipo === 'lista' ? c.opciones.map((o) => ({ valor: o, etiqueta: o })) : [{ valor: 'true', etiqueta: 'Sí' }, { valor: 'false', etiqueta: 'No' }]),
                { valor: SIN_VALOR, etiqueta: 'Sin dato' },
              ]}
            />
          ))}
          <Interruptor etiqueta="Solo fichas incompletas" valor={!!filtros.soloIncompletas} alCambiar={(v) => poner('soloIncompletas', v)} />
          <Boton titulo="Ver resultados" onPress={cerrar} />
          <Boton
            titulo="Quitar todos los filtros"
            variante="secundario"
            onPress={() => {
              setDesde('');
              setHasta('');
              alCambiar({});
            }}
          />
        </Pantalla>
      </SafeAreaView>
    </Modal>
  );
}

function ModalColumnas({
  visible,
  cerrar,
  disponibles,
  elegidas,
  alCambiar,
}: {
  visible: boolean;
  cerrar(): void;
  disponibles: { id: string; etiqueta: string }[];
  elegidas: string[];
  alCambiar(c: string[]): void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cerrar}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colores.fondo }}>
        <Pantalla>
          <Subtitulo>Columnas visibles</Subtitulo>
          <Parrafo suave>La columna Nombre siempre se muestra y queda fija al desplazar la tabla.</Parrafo>
          {disponibles.map((c) => (
            <Interruptor
              key={c.id}
              etiqueta={c.etiqueta}
              valor={elegidas.includes(c.id)}
              alCambiar={(v) => alCambiar(v ? [...elegidas, c.id] : elegidas.filter((x) => x !== c.id))}
            />
          ))}
          <Boton titulo="Listo" onPress={cerrar} />
        </Pantalla>
      </SafeAreaView>
    </Modal>
  );
}

const e = StyleSheet.create({
  barra: { padding: espacio.m, gap: espacio.s, backgroundColor: colores.superficie, borderBottomWidth: 1, borderBottomColor: colores.bordeSuave },
  buscador: { minHeight: TACTIL_MINIMO, borderWidth: 2, borderColor: colores.borde, borderRadius: 8, paddingHorizontal: espacio.m, fontSize: texto.normal, color: colores.texto },
  acciones: { flexDirection: 'row', gap: espacio.s },
  chip: { minHeight: TACTIL_MINIMO, flexDirection: 'row', alignItems: 'center', gap: espacio.xs, paddingHorizontal: espacio.m, borderRadius: 24, borderWidth: 2, borderColor: colores.borde, backgroundColor: colores.superficie },
  textoChip: { fontSize: texto.normal - 1, color: colores.texto, fontWeight: '600' },
  cuenta: { fontSize: texto.chico, color: colores.textoSuave },
  franjaSinConexion: { backgroundColor: colores.aviso, padding: espacio.s },
  textoFranja: { color: colores.primarioTexto, fontWeight: '700', fontSize: texto.normal - 1, textAlign: 'center' },
});
