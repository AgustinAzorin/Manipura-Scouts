import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ANCHO_ANGOSTO, ANCHO_LECTURA, conMouseEncima, useEscritorio } from './escritorio';
import { colores, espacio, TACTIL_MINIMO, texto } from './tema';

// Los textos no fijan alto de línea ni de contenedor para respetar el tamaño de letra del
// sistema sin cortarse (RNF-027).

export function Titulo({ children }: { children: ReactNode }) {
  return (
    <Text style={e.titulo} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Subtitulo({ children }: { children: ReactNode }) {
  return (
    <Text style={e.subtitulo} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Parrafo({ children, suave }: { children: ReactNode; suave?: boolean }) {
  return <Text style={[e.parrafo, suave && { color: colores.textoSuave }]}>{children}</Text>;
}

/** `angosta`: en la web ancha, el contenido queda en una columna angosta (inicio de sesión). */
export function Pantalla({ children, desplazable = true, angosta }: { children: ReactNode; desplazable?: boolean; angosta?: boolean }) {
  return (
    <SafeAreaView style={e.pantalla} edges={['bottom', 'left', 'right']}>
      {desplazable ? (
        <ScrollView contentContainerStyle={[e.contenido, Platform.OS === 'web' && [e.contenidoWeb, angosta && { maxWidth: ANCHO_ANGOSTO }]]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}

type VarianteBoton = 'primario' | 'secundario' | 'peligro' | 'texto';

export function Boton({
  titulo,
  onPress,
  variante = 'primario',
  deshabilitado,
  cargando,
  estilo,
  etiquetaAccesible,
}: {
  titulo: string;
  onPress: () => void;
  variante?: VarianteBoton;
  deshabilitado?: boolean;
  cargando?: boolean;
  estilo?: ViewStyle;
  etiquetaAccesible?: string;
}) {
  const inactivo = deshabilitado || cargando;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiquetaAccesible ?? titulo}
      accessibilityState={{ disabled: !!inactivo, busy: !!cargando }}
      disabled={inactivo}
      onPress={onPress}
      style={(estado) => [e.boton, e[`boton_${variante}`], inactivo && e.botonInactivo, !inactivo && conMouseEncima(estado) && e[`botonEncima_${variante}`], estado.pressed && { opacity: 0.8 }, estilo]}
    >
      {cargando ? (
        <ActivityIndicator color={variante === 'primario' || variante === 'peligro' ? colores.primarioTexto : colores.primario} />
      ) : (
        <Text style={[e.botonTexto, e[`botonTexto_${variante}`]]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  obligatorio,
  style,
  ...props
}: TextInputProps & { etiqueta: string; error?: string | null; ayuda?: string; obligatorio?: boolean }) {
  return (
    <View style={e.campo}>
      <Text style={e.etiqueta}>
        {etiqueta}
        {obligatorio ? ' *' : ''}
      </Text>
      <TextInput
        accessibilityLabel={etiqueta}
        placeholderTextColor={colores.textoSuave}
        style={[e.input, props.multiline && e.multilinea, !!error && { borderColor: colores.peligro }, props.editable === false && { backgroundColor: colores.fondo }, style]}
        {...props}
      />
      {ayuda && !error ? <Text style={e.ayuda}>{ayuda}</Text> : null}
      {error ? (
        <Text style={e.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export interface Opcion {
  valor: string;
  etiqueta: string;
  detalle?: string;
}

/** Lista de opciones en un modal: más fácil de tocar que un menú desplegable. */
export function Selector({
  etiqueta,
  opciones,
  valor,
  alCambiar,
  multiple,
  error,
  permitirVacio = true,
  textoVacio = 'Sin asignar',
  textoNinguno = 'Todos',
  deshabilitado,
}: {
  etiqueta: string;
  opciones: Opcion[];
  valor: string | string[] | null | undefined;
  alCambiar: (v: string | null | string[]) => void;
  multiple?: boolean;
  error?: string | null;
  permitirVacio?: boolean;
  textoVacio?: string;
  /** Con `multiple`, lo que muestra si no hay nada elegido. */
  textoNinguno?: string;
  deshabilitado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  // En la web ancha la lista se abre como diálogo centrado, no a pantalla completa.
  const dialogo = useEscritorio();
  const seleccion = Array.isArray(valor) ? valor : valor ? [valor] : [];
  const resumen = seleccion.length
    ? opciones
        .filter((o) => seleccion.includes(o.valor))
        .map((o) => o.etiqueta)
        .join(', ')
    : multiple
      ? textoNinguno
      : textoVacio;
  const elegir = (v: string) => {
    if (!multiple) {
      alCambiar(v);
      setAbierto(false);
      return;
    }
    alCambiar(seleccion.includes(v) ? seleccion.filter((x) => x !== v) : [...seleccion, v]);
  };
  return (
    <View style={e.campo}>
      <Text style={e.etiqueta}>{etiqueta}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${etiqueta}: ${resumen}`}
        accessibilityHint="Abre la lista de opciones"
        disabled={deshabilitado}
        onPress={() => setAbierto(true)}
        style={[e.input, e.selector, !!error && { borderColor: colores.peligro }, deshabilitado && { backgroundColor: colores.fondo }]}
      >
        <Text style={[e.parrafo, { flex: 1 }, !seleccion.length && { color: colores.textoSuave }]}>{resumen}</Text>
        <Text style={e.parrafo} aria-hidden>
          ▾
        </Text>
      </Pressable>
      {error ? <Text style={e.error}>{error}</Text> : null}
      <Modal visible={abierto} animationType={dialogo ? 'fade' : 'slide'} transparent={dialogo} onRequestClose={() => setAbierto(false)}>
        <SafeAreaView style={dialogo ? e.fondoDialogo : e.pantalla}>
          {dialogo ? <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Cerrar" onPress={() => setAbierto(false)} /> : null}
          <View style={dialogo ? e.dialogo : { flex: 1 }} aria-modal={dialogo || undefined} role={dialogo ? 'dialog' : undefined} aria-label={etiqueta}>
          <View style={e.modalEncabezado}>
            <Subtitulo>{etiqueta}</Subtitulo>
          </View>
          <ScrollView contentContainerStyle={e.contenido}>
            {permitirVacio && !multiple ? (
              <OpcionFila etiqueta={textoVacio} elegida={!seleccion.length} alTocar={() => {
                alCambiar(null);
                setAbierto(false);
              }} />
            ) : null}
            {opciones.map((o) => (
              <OpcionFila key={o.valor} etiqueta={o.etiqueta} detalle={o.detalle} elegida={seleccion.includes(o.valor)} multiple={multiple} alTocar={() => elegir(o.valor)} />
            ))}
          </ScrollView>
          <View style={{ padding: espacio.l, gap: espacio.s }}>
            {multiple && seleccion.length ? <Boton titulo="Limpiar" variante="secundario" onPress={() => alCambiar([])} /> : null}
            <Boton titulo={multiple ? 'Listo' : 'Cerrar'} variante={multiple ? 'primario' : 'secundario'} onPress={() => setAbierto(false)} />
          </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function OpcionFila({ etiqueta, detalle, elegida, multiple, alTocar }: { etiqueta: string; detalle?: string; elegida: boolean; multiple?: boolean; alTocar: () => void }) {
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: elegida }}
      accessibilityLabel={etiqueta}
      onPress={alTocar}
      style={(estado) => [e.opcion, conMouseEncima(estado) && { borderColor: colores.borde }, elegida && { backgroundColor: colores.primarioSuave, borderColor: colores.primario }]}
    >
      <Text style={e.opcionMarca}>{elegida ? (multiple ? '☑' : '●') : multiple ? '☐' : '○'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={e.parrafo}>{etiqueta}</Text>
        {detalle ? <Text style={e.ayuda}>{detalle}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Interruptor({ etiqueta, valor, alCambiar, deshabilitado, ayuda }: { etiqueta: string; valor: boolean; alCambiar: (v: boolean) => void; deshabilitado?: boolean; ayuda?: string }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: valor, disabled: !!deshabilitado }}
      accessibilityLabel={etiqueta}
      disabled={deshabilitado}
      onPress={() => alCambiar(!valor)}
      style={e.interruptor}
    >
      <View style={{ flex: 1 }}>
        <Text style={[e.parrafo, deshabilitado && { color: colores.textoSuave }]}>{etiqueta}</Text>
        {ayuda ? <Text style={e.ayuda}>{ayuda}</Text> : null}
      </View>
      <Switch
        value={valor}
        onValueChange={alCambiar}
        disabled={deshabilitado}
        trackColor={{ true: colores.primario, false: colores.borde }}
        thumbColor={colores.superficie}
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

export function Tarjeta({ children, estilo }: { children: ReactNode; estilo?: ViewStyle }) {
  return <View style={[e.tarjeta, estilo]}>{children}</View>;
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'aviso' | 'error' | 'exito'; children: ReactNode }) {
  const c = {
    info: [colores.infoSuave, colores.info],
    aviso: [colores.avisoSuave, colores.aviso],
    error: [colores.peligroSuave, colores.peligro],
    exito: [colores.primarioSuave, colores.primario],
  }[tipo];
  return (
    <View style={[e.aviso, { backgroundColor: c[0], borderLeftColor: c[1] }]} accessibilityRole={tipo === 'error' ? 'alert' : undefined}>
      <Text style={[e.parrafo, { color: colores.texto }]}>{children}</Text>
    </View>
  );
}

export function Dato({ etiqueta, valor, accion }: { etiqueta: string; valor: ReactNode; accion?: ReactNode }) {
  return (
    <View style={e.dato} accessible accessibilityLabel={typeof valor === 'string' ? `${etiqueta}: ${valor || 'sin dato'}` : undefined}>
      <Text style={e.datoEtiqueta}>{etiqueta}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s, flexWrap: 'wrap' }}>
        {typeof valor === 'string' ? <Text style={[e.parrafo, !valor && { color: colores.textoSuave }]}>{valor || '—'}</Text> : valor}
        {accion}
      </View>
    </View>
  );
}

export function ItemMenu({ titulo, detalle, onPress }: { titulo: string; detalle?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={titulo} onPress={onPress} style={(estado) => [e.itemMenu, conMouseEncima(estado) && { backgroundColor: colores.filaPar }, estado.pressed && { backgroundColor: colores.primarioSuave }]}>
      <View style={{ flex: 1 }}>
        <Text style={[e.parrafo, { fontWeight: '600' }]}>{titulo}</Text>
        {detalle ? <Text style={e.ayuda}>{detalle}</Text> : null}
      </View>
      <Text style={e.parrafo} aria-hidden>
        ›
      </Text>
    </Pressable>
  );
}

export function Cargando({ mensaje = 'Cargando…' }: { mensaje?: string }) {
  return (
    <View style={e.centro}>
      <ActivityIndicator size="large" color={colores.primario} />
      <Text style={[e.parrafo, { marginTop: espacio.m }]}>{mensaje}</Text>
    </View>
  );
}

export function Separador() {
  return <View style={{ height: espacio.l }} />;
}

/** Confirmación que funciona en el celular y en la versión web de desarrollo. */
export function confirmar(titulo: string, mensaje: string, textoConfirmar = 'Confirmar'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${titulo}\n\n${mensaje}`));
  return new Promise((resolver) =>
    Alert.alert(titulo, mensaje, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolver(false) },
      { text: textoConfirmar, style: 'destructive', onPress: () => resolver(true) },
    ]),
  );
}

export function avisar(titulo: string, mensaje: string): void {
  if (Platform.OS === 'web') window.alert(`${titulo}\n\n${mensaje}`);
  else Alert.alert(titulo, mensaje);
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.l, gap: espacio.m, paddingBottom: espacio.xxl },
  contenidoWeb: { width: '100%', maxWidth: ANCHO_LECTURA, alignSelf: 'center' },
  fondoDialogo: { flex: 1, backgroundColor: 'rgba(27, 31, 26, 0.45)', alignItems: 'center', justifyContent: 'center', padding: espacio.xl },
  dialogo: { width: '100%', maxWidth: ANCHO_ANGOSTO + 80, maxHeight: '85%', backgroundColor: colores.fondo, borderRadius: 12, overflow: 'hidden' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espacio.xl },
  titulo: { fontSize: texto.titulo, fontWeight: '700', color: colores.primario },
  subtitulo: { fontSize: texto.grande, fontWeight: '700', color: colores.texto, marginTop: espacio.s },
  parrafo: { fontSize: texto.normal, color: colores.texto },
  boton: { minHeight: TACTIL_MINIMO, minWidth: TACTIL_MINIMO, borderRadius: 8, paddingHorizontal: espacio.l, paddingVertical: espacio.m, alignItems: 'center', justifyContent: 'center' },
  boton_primario: { backgroundColor: colores.primario },
  boton_secundario: { backgroundColor: colores.superficie, borderWidth: 2, borderColor: colores.primario },
  boton_peligro: { backgroundColor: colores.peligro },
  boton_texto: { backgroundColor: 'transparent' },
  botonEncima_primario: { backgroundColor: colores.primarioEncima },
  botonEncima_secundario: { backgroundColor: colores.primarioSuave },
  botonEncima_peligro: { backgroundColor: colores.peligroEncima },
  botonEncima_texto: { backgroundColor: colores.primarioSuave },
  botonInactivo: { opacity: 0.5 },
  botonTexto: { fontSize: texto.normal, fontWeight: '700', textAlign: 'center' },
  botonTexto_primario: { color: colores.primarioTexto },
  botonTexto_secundario: { color: colores.primario },
  botonTexto_peligro: { color: colores.primarioTexto },
  botonTexto_texto: { color: colores.primario, textDecorationLine: 'underline' },
  campo: { gap: espacio.xs },
  etiqueta: { fontSize: texto.normal, fontWeight: '600', color: colores.texto },
  input: { minHeight: TACTIL_MINIMO, borderWidth: 2, borderColor: colores.borde, borderRadius: 8, paddingHorizontal: espacio.m, paddingVertical: espacio.s, fontSize: texto.normal, color: colores.texto, backgroundColor: colores.superficie },
  multilinea: { minHeight: 96, textAlignVertical: 'top' },
  selector: { flexDirection: 'row', alignItems: 'center', gap: espacio.s },
  ayuda: { fontSize: texto.chico, color: colores.textoSuave },
  error: { fontSize: texto.chico, color: colores.peligro, fontWeight: '600' },
  modalEncabezado: { padding: espacio.l, borderBottomWidth: 1, borderBottomColor: colores.bordeSuave, backgroundColor: colores.superficie },
  opcion: { minHeight: TACTIL_MINIMO, flexDirection: 'row', alignItems: 'center', gap: espacio.m, padding: espacio.m, borderRadius: 8, borderWidth: 1, borderColor: colores.bordeSuave, backgroundColor: colores.superficie },
  opcionMarca: { fontSize: texto.grande, color: colores.primario, width: 24, textAlign: 'center' },
  interruptor: { minHeight: TACTIL_MINIMO, flexDirection: 'row', alignItems: 'center', gap: espacio.m },
  tarjeta: { backgroundColor: colores.superficie, borderRadius: 12, padding: espacio.l, gap: espacio.m, borderWidth: 1, borderColor: colores.bordeSuave },
  aviso: { borderLeftWidth: 6, borderRadius: 8, padding: espacio.m },
  dato: { gap: 2, paddingVertical: espacio.xs },
  datoEtiqueta: { fontSize: texto.chico, color: colores.textoSuave, fontWeight: '600' },
  itemMenu: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: espacio.l, paddingVertical: espacio.m, backgroundColor: colores.superficie, borderBottomWidth: 1, borderBottomColor: colores.bordeSuave },
});
