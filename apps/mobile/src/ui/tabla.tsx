import { useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { valorColumna, type DefColumna, type Direccion, type FichaDTO, type IndiceRama } from '@scouttracker/shared';
import { Logo } from '../lib/logos';
import { colores, espacio, TACTIL_MINIMO, texto } from './tema';

interface Props {
  fichas: FichaDTO[];
  columnas: DefColumna[];
  indice: IndiceRama;
  orden: { columna: string; direccion: Direccion } | null;
  alOrdenar(columna: string): void;
  alAbrir(f: FichaDTO): void;
  hoy: string;
}

/**
 * RF-029: tabla con desplazamiento horizontal y la columna Nombre fija. La fila completa se
 * desplaza en un ScrollView horizontal y la celda del nombre se contrarresta con translateX,
 * así la lista vertical sigue virtualizada.
 */
export function TablaNomina({ fichas, columnas, indice, orden, alOrdenar, alAbrir, hoy }: Props) {
  const [scrollX] = useState(() => new Animated.Value(0));
  const nombre = columnas[0]!;
  const resto = columnas.slice(1);
  const ancho = columnas.reduce((t, c) => t + c.ancho, 0);
  const fija = { transform: [{ translateX: scrollX }], zIndex: 2 };

  const encabezado = (c: DefColumna) => {
    const activo = orden?.columna === c.id;
    const flecha = activo ? (orden!.direccion === 'asc' ? ' ▲' : ' ▼') : '';
    return (
      <Pressable
        key={c.id}
        onPress={() => alOrdenar(c.id)}
        accessibilityRole="button"
        accessibilityLabel={`Ordenar por ${c.etiqueta}${activo ? (orden!.direccion === 'asc' ? ', ascendente' : ', descendente') : ''}`}
        style={[e.celda, e.encabezado, { width: c.ancho }]}
      >
        <Text style={e.textoEncabezado}>
          {c.etiqueta}
          {flecha}
        </Text>
      </Pressable>
    );
  };

  return (
    <Animated.ScrollView
      horizontal
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1 }}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
      scrollEventThrottle={16}
    >
      <View style={{ width: ancho, flex: 1 }}>
        <View style={e.fila}>
          <Animated.View style={[fija, { backgroundColor: colores.primarioSuave }]}>{encabezado(nombre)}</Animated.View>
          {resto.map(encabezado)}
        </View>
        <FlatList
          data={fichas}
          keyExtractor={(f) => f.id}
          initialNumToRender={20}
          windowSize={7}
          renderItem={({ item, index }) => {
            const fondo = index % 2 ? colores.filaPar : colores.superficie;
            const n = valorColumna(item, 'nombre', indice, hoy);
            return (
              <Pressable
                onPress={() => alAbrir(item)}
                accessibilityRole="button"
                accessibilityLabel={`Abrir la ficha de ${n.texto}`}
                style={({ pressed }) => [e.fila, { backgroundColor: pressed ? colores.primarioSuave : fondo }]}
              >
                <Animated.View style={[fija, e.celda, { width: nombre.ancho, backgroundColor: fondo }]}>
                  <Text style={[e.textoCelda, { fontWeight: '600' }]}>{n.texto || '(sin nombre)'}</Text>
                  {item.estado === 'incompleta' ? <Text style={e.marca}>Incompleta</Text> : null}
                </Animated.View>
                {resto.map((c) => {
                  const v = valorColumna(item, c.id, indice, hoy);
                  return (
                    <View key={c.id} style={[e.celda, e.celdaFila, { width: c.ancho }]}>
                      {c.conLogo || c.id === 'equipo' ? <Logo id={v.logo} tamano={22} /> : null}
                      <Text style={[e.textoCelda, v.inactivo && { color: colores.inactivo, fontStyle: 'italic' }]}>
                        {v.texto}
                        {v.inactivo && c.id === 'equipo' ? ' (inactivo)' : ''}
                      </Text>
                    </View>
                  );
                })}
              </Pressable>
            );
          }}
        />
      </View>
    </Animated.ScrollView>
  );
}

const e = StyleSheet.create({
  fila: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colores.bordeSuave, minHeight: TACTIL_MINIMO },
  celda: { paddingHorizontal: espacio.s, paddingVertical: espacio.s, justifyContent: 'center' },
  celdaFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: espacio.xs },
  encabezado: { backgroundColor: colores.primarioSuave, minHeight: TACTIL_MINIMO },
  textoEncabezado: { fontSize: texto.chico, fontWeight: '700', color: colores.primario },
  textoCelda: { fontSize: texto.normal - 1, color: colores.texto, flexShrink: 1 },
  marca: { fontSize: texto.chico, color: colores.aviso, fontWeight: '700' },
});
