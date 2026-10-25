import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { interpretarDesarrollo, type Segmento } from '@scouttracker/shared';
import { Boton } from './componentes';
import { colores, espacio, TACTIL_MINIMO, texto } from './tema';

const enLinea = (segmentos: Segmento[]) =>
  segmentos.map((s, i) => (
    <Text key={i} style={s.negrita ? { fontWeight: '700' } : undefined}>
      {s.texto}
    </Text>
  ));

/** Cómo va a quedar el desarrollo en el PDF. */
export function VistaDesarrollo({ valor }: { valor: string }) {
  const bloques = interpretarDesarrollo(valor);
  if (bloques.length === 0) return <Text style={[e.texto, { color: colores.textoSuave }]}>Sin desarrollo.</Text>;
  return (
    <View style={{ gap: espacio.s }}>
      {bloques.map((b, i) =>
        b.tipo === 'parrafo' ? (
          <Text key={i} style={e.texto}>
            {enLinea(b.segmentos)}
          </Text>
        ) : (
          <View key={i} style={{ gap: espacio.xs }}>
            {b.items.map((item, j) => (
              <Text key={j} style={e.texto}>
                {'•  '}
                {enLinea(item)}
              </Text>
            ))}
          </View>
        ),
      )}
    </View>
  );
}

/**
 * RD-005: el desarrollo admite negrita (**así**) y listas (líneas que empiezan con "- ").
 * Los botones marcan la parte elegida del texto, o la línea donde está el cursor.
 */
export function EditorDesarrollo({ valor, alCambiar, editable = true, error }: { valor: string; alCambiar: (v: string) => void; editable?: boolean; error?: string | null }) {
  const [sel, setSel] = useState({ start: valor.length, end: valor.length });
  const [vista, setVista] = useState(false);

  const negrita = () => {
    const { start, end } = sel;
    const elegido = valor.slice(start, end) || 'texto en negrita';
    alCambiar(`${valor.slice(0, start)}**${elegido}**${valor.slice(end)}`);
  };
  const lista = () => {
    const inicio = valor.lastIndexOf('\n', sel.start - 1) + 1;
    const finLinea = valor.indexOf('\n', sel.end);
    const fin = finLinea === -1 ? valor.length : finLinea;
    const lineas = valor
      .slice(inicio, fin)
      .split('\n')
      .map((l) => (/^\s*[-•]\s+/.test(l) ? l.replace(/^\s*[-•]\s+/, '') : `- ${l}`));
    alCambiar(`${valor.slice(0, inicio)}${lineas.join('\n')}${valor.slice(fin)}`);
  };

  return (
    <View style={{ gap: espacio.xs }}>
      <Text style={e.etiqueta}>Desarrollo *</Text>
      {editable ? (
        <View style={{ flexDirection: 'row', gap: espacio.s, flexWrap: 'wrap' }}>
          <Boton titulo="Negrita" variante="secundario" onPress={negrita} deshabilitado={vista} etiquetaAccesible="Poner en negrita el texto elegido" />
          <Boton titulo="Lista" variante="secundario" onPress={lista} deshabilitado={vista} etiquetaAccesible="Convertir las líneas elegidas en lista" />
          <Boton titulo={vista ? 'Editar' : 'Ver cómo queda'} variante="texto" onPress={() => setVista((v) => !v)} />
        </View>
      ) : null}
      {vista || !editable ? (
        <View style={[e.input, { paddingVertical: espacio.m }]}>
          <VistaDesarrollo valor={valor} />
        </View>
      ) : (
        <TextInput
          accessibilityLabel="Desarrollo"
          value={valor}
          onChangeText={alCambiar}
          onSelectionChange={(ev) => setSel(ev.nativeEvent.selection)}
          multiline
          placeholder={'Se invita a la comunidad a…\n- Primer paso\n- Segundo paso'}
          placeholderTextColor={colores.textoSuave}
          style={[e.input, e.area, !!error && { borderColor: colores.peligro }]}
        />
      )}
      {error ? <Text style={e.error}>{error}</Text> : <Text style={e.ayuda}>Para negrita: **así**. Para una lista, empezá cada línea con “- ”. Sin imágenes.</Text>}
    </View>
  );
}

const e = StyleSheet.create({
  etiqueta: { fontSize: texto.normal, fontWeight: '600', color: colores.texto },
  texto: { fontSize: texto.normal, color: colores.texto },
  input: { minHeight: TACTIL_MINIMO, borderWidth: 2, borderColor: colores.borde, borderRadius: 8, paddingHorizontal: espacio.m, paddingVertical: espacio.s, fontSize: texto.normal, color: colores.texto, backgroundColor: colores.superficie },
  area: { minHeight: 200, textAlignVertical: 'top' },
  ayuda: { fontSize: texto.chico, color: colores.textoSuave },
  error: { fontSize: texto.chico, color: colores.peligro, fontWeight: '600' },
});
