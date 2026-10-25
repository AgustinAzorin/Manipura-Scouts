import { StyleSheet, Text, View } from 'react-native';
import { porcentaje, type Grafico } from '@scouttracker/shared';
import { Logo } from '../lib/logos';
import { colores, espacio, texto } from './tema';

/**
 * Gráfico de barras horizontales (RF-106 a RF-110). Cada barra lleva su nombre, su logo si tiene
 * (RI-003) y su valor escritos, así la información no depende solo del color ni del largo, y el
 * texto puede crecer con el tamaño de letra del sistema sin superponerse (RNF-027).
 */
export function GraficoBarras({ grafico }: { grafico: Grafico }) {
  const maximo = Math.max(1, ...grafico.barras.map((b) => b.valor));
  return (
    <View style={e.tarjeta}>
      <Text style={e.titulo} accessibilityRole="header">
        {grafico.titulo}
      </Text>
      {grafico.total === 0 ? <Text style={e.suave}>No hay protagonistas para contar.</Text> : null}
      {grafico.total > 0 && grafico.barras.length === 0 ? <Text style={e.suave}>Sin valores cargados.</Text> : null}
      {grafico.total > 0
        ? grafico.barras.map((b) => {
            const pct = porcentaje(b.valor, grafico.total);
            return (
              <View
                key={b.clave}
                style={e.fila}
                accessible
                accessibilityLabel={`${b.etiqueta}${b.inactivo ? ', inactivo' : ''}: ${b.valor === 1 ? '1 protagonista' : `${b.valor} protagonistas`}, ${pct} por ciento`}
              >
                <View style={e.encabezado}>
                  <Logo id={b.logo} tamano={22} />
                  <Text style={[e.etiqueta, b.inactivo && { fontStyle: 'italic' }]}>
                    {b.etiqueta}
                    {b.inactivo ? ' (inactivo)' : ''}
                  </Text>
                  <Text style={e.valor}>
                    {b.valor} <Text style={e.porcentaje}>· {pct} %</Text>
                  </Text>
                </View>
                <View style={e.pista}>
                  {b.valor > 0 ? <View style={[e.barra, { width: `${(b.valor / maximo) * 100}%`, backgroundColor: b.color ?? colores.primario }]} /> : null}
                </View>
              </View>
            );
          })
        : null}
      <Text style={e.suave}>Total: {grafico.total === 1 ? '1 protagonista' : `${grafico.total} protagonistas`}</Text>
    </View>
  );
}

const e = StyleSheet.create({
  tarjeta: { backgroundColor: colores.superficie, borderRadius: 12, padding: espacio.l, gap: espacio.m, borderWidth: 1, borderColor: colores.bordeSuave },
  titulo: { fontSize: texto.grande, fontWeight: '700', color: colores.texto },
  fila: { gap: espacio.xs },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, flexWrap: 'wrap' },
  etiqueta: { flex: 1, minWidth: 120, fontSize: texto.normal, color: colores.texto },
  valor: { fontSize: texto.normal, fontWeight: '700', color: colores.texto },
  porcentaje: { fontSize: texto.chico, fontWeight: '400', color: colores.textoSuave },
  // Pista apenas visible: la barra es la que se lee (marcas finas, ejes recesivos).
  pista: { height: 14, borderRadius: 4, backgroundColor: colores.fondo, overflow: 'hidden' },
  barra: { height: 14, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  suave: { fontSize: texto.chico, color: colores.textoSuave },
});
