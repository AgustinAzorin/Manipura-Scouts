import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  estadoActividad,
  formatearRango,
  totalesActividad,
  type ActividadDTO,
  type EstadoActividad,
  type TipoActividadDTO,
} from '@scouttracker/shared';
import { colores, espacio, TACTIL_MINIMO, texto } from './tema';

export const NOMBRE_ESTADO_ACTIVIDAD: Record<EstadoActividad, string> = {
  cancelada: 'Cancelada',
  proxima: 'Próxima',
  enCurso: 'En curso',
  terminada: 'Terminada',
};

/** Etiqueta del tipo con su color (RF-063, RF-073). El texto blanco cumple el contraste de RNF-029. */
export function EtiquetaTipo({ tipo }: { tipo: TipoActividadDTO | undefined }) {
  if (!tipo) return null;
  return (
    <View style={[e.etiqueta, { backgroundColor: tipo.color }]}>
      <Text style={e.textoEtiqueta}>{tipo.nombre}</Text>
    </View>
  );
}

/** Tarjeta de una actividad en el listado. */
export function TarjetaActividad({ actividad, tipo, onPress }: { actividad: ActividadDTO; tipo: TipoActividadDTO | undefined; onPress: () => void }) {
  const estado = estadoActividad(actividad);
  const t = totalesActividad(actividad.inscripciones, !!tipo?.requiereAutorizacion);
  const resumen = estado === 'proxima' ? `Van ${t.confirmados} de ${t.inscriptos}` : `Presentes ${t.presentes} de ${t.inscriptos}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${actividad.nombre}, ${tipo?.nombre ?? ''}, ${formatearRango(actividad.inicio, actividad.fin)}, ${NOMBRE_ESTADO_ACTIVIDAD[estado]}, ${resumen}`}
      style={({ pressed }) => [e.tarjeta, { borderLeftColor: tipo?.color ?? colores.borde }, pressed && { backgroundColor: colores.primarioSuave }]}
    >
      <View style={e.filaTitulo}>
        <EtiquetaTipo tipo={tipo} />
        <Text style={[e.estado, estado === 'cancelada' && { color: colores.peligro }]}>{NOMBRE_ESTADO_ACTIVIDAD[estado]}</Text>
      </View>
      <Text style={[e.nombre, estado === 'cancelada' && { textDecorationLine: 'line-through' }]}>{actividad.nombre}</Text>
      <Text style={e.detalle}>{formatearRango(actividad.inicio, actividad.fin)}</Text>
      {actividad.lugar ? <Text style={e.detalle}>{actividad.lugar}</Text> : null}
      <Text style={e.detalle}>{resumen}</Text>
    </Pressable>
  );
}

/** Totales de la vista de control (RF-071). */
export function Totales({ items }: { items: { etiqueta: string; valor: number; alerta?: boolean }[] }) {
  return (
    <View style={e.totales} accessibilityRole="summary">
      {items.map((i) => (
        <View key={i.etiqueta} style={[e.total, i.alerta && i.valor > 0 && { borderColor: colores.aviso, backgroundColor: colores.avisoSuave }]} accessible accessibilityLabel={`${i.etiqueta}: ${i.valor}`}>
          <Text style={e.totalValor}>{i.valor}</Text>
          <Text style={e.totalEtiqueta}>{i.etiqueta}</Text>
        </View>
      ))}
    </View>
  );
}

/** Botón de dos estados, grande para marcar rápido (RNF-028, RNF-031). */
export function Marca({
  etiqueta,
  activa,
  onPress,
  deshabilitada,
  textoActiva,
  textoInactiva,
  etiquetaAccesible,
}: {
  etiqueta: string;
  activa: boolean;
  onPress: () => void;
  deshabilitada?: boolean;
  textoActiva?: string;
  textoInactiva?: string;
  etiquetaAccesible?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitada}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: activa, disabled: !!deshabilitada }}
      accessibilityLabel={etiquetaAccesible ?? etiqueta}
      style={({ pressed }) => [e.marca, activa && { backgroundColor: colores.primario, borderColor: colores.primario }, deshabilitada && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
    >
      <Text style={[e.textoMarca, activa && { color: colores.primarioTexto }]}>
        {activa ? '☑ ' : '☐ '}
        {activa ? (textoActiva ?? etiqueta) : (textoInactiva ?? etiqueta)}
      </Text>
    </Pressable>
  );
}

const e = StyleSheet.create({
  etiqueta: { borderRadius: 6, paddingHorizontal: espacio.s, paddingVertical: 2, alignSelf: 'flex-start' },
  textoEtiqueta: { color: colores.primarioTexto, fontWeight: '700', fontSize: texto.chico },
  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: 12,
    padding: espacio.l,
    gap: espacio.xs,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    borderLeftWidth: 8,
    minHeight: TACTIL_MINIMO,
  },
  filaTitulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espacio.s, flexWrap: 'wrap' },
  estado: { fontSize: texto.chico, fontWeight: '700', color: colores.textoSuave },
  nombre: { fontSize: texto.grande, fontWeight: '700', color: colores.texto },
  detalle: { fontSize: texto.normal - 1, color: colores.textoSuave },
  totales: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s },
  total: { flexGrow: 1, minWidth: 90, alignItems: 'center', padding: espacio.s, borderRadius: 8, borderWidth: 2, borderColor: colores.bordeSuave, backgroundColor: colores.superficie },
  totalValor: { fontSize: texto.titulo, fontWeight: '700', color: colores.texto },
  totalEtiqueta: { fontSize: texto.chico, color: colores.textoSuave, textAlign: 'center' },
  marca: {
    minHeight: TACTIL_MINIMO,
    minWidth: TACTIL_MINIMO,
    paddingHorizontal: espacio.m,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoMarca: { fontSize: texto.normal, fontWeight: '700', color: colores.texto },
});
