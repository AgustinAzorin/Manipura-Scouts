import { usePathname, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatearFechaHora } from '@scouttracker/shared';
import { useDatos } from '../lib/datos';
import { useSesion } from '../lib/sesion';
import { Boton } from './componentes';
import { conMouseEncima } from './escritorio';
import { itemActivo, useCerrarSesion, useSeccionesNavegacion, type ItemNavegacion } from './navegacion';
import { colores, espacio, texto } from './tema';

/** Ancho de la barra lateral de la versión web de escritorio. */
export const ANCHO_BARRA = 272;

/**
 * Navegación de la versión web en pantallas anchas: reemplaza al botón "Menú" del encabezado y
 * queda siempre visible. Los ítems reemplazan la pantalla en vez de apilarla, como las pestañas.
 */
export function BarraLateral() {
  const { yo, contexto } = useSesion();
  const { snapshot, sinConexion, recargar, cargando, pendientes } = useDatos();
  const secciones = useSeccionesNavegacion();
  const salir = useCerrarSesion();
  const ruta = usePathname();
  const router = useRouter();
  if (!yo) return null;

  return (
    <View style={e.barra} accessibilityRole="navigation" aria-label="Menú principal">
      <View style={e.marca}>
        <Text style={e.marcaTitulo}>ScoutTracker</Text>
        {contexto ? (
          <Text style={e.marcaContexto} numberOfLines={2}>
            {contexto.grupoNombre} · {contexto.ramaNombre}
          </Text>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={e.secciones}>
        {secciones.map((s) => (
          <View key={s.titulo} style={{ gap: 2 }}>
            <Text style={e.seccion} accessibilityRole="header">
              {s.titulo}
            </Text>
            {s.items.map((i) => (
              <Item key={i.ruta} item={i} activo={itemActivo(i, ruta)} alTocar={() => router.dismissTo(i.ruta)} />
            ))}
          </View>
        ))}
      </ScrollView>
      <View style={e.pie}>
        {snapshot ? (
          <Text style={[e.estado, sinConexion && { color: colores.aviso, fontWeight: '700' }]}>
            {sinConexion ? 'Sin conexión. ' : ''}Datos al {formatearFechaHora(snapshot.generadoEn)}
          </Text>
        ) : null}
        {pendientes.length ? (
          <Text style={e.estado}>{pendientes.length === 1 ? '1 registro sin enviar' : `${pendientes.length} registros sin enviar`}</Text>
        ) : null}
        <Boton titulo="Sincronizar ahora" variante="secundario" onPress={recargar} cargando={cargando} />
        <View style={{ gap: 2 }}>
          <Text style={e.usuario} numberOfLines={1}>
            {yo.usuario.nombre}
          </Text>
          <Text style={e.estado} numberOfLines={1}>
            {yo.usuario.email}
          </Text>
        </View>
        <Boton titulo="Cerrar sesión" variante="texto" onPress={() => void salir()} estilo={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      </View>
    </View>
  );
}

function Item({ item, activo, alTocar }: { item: ItemNavegacion; activo: boolean; alTocar: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={item.contador ? `${item.titulo}: ${item.contador}` : item.titulo}
      accessibilityState={{ selected: activo }}
      aria-current={activo ? 'page' : undefined}
      onPress={alTocar}
      style={(estado) => [e.item, conMouseEncima(estado) && { backgroundColor: colores.fondo }, activo && e.itemActivo]}
    >
      <Text style={[e.itemTexto, activo && { color: colores.primario, fontWeight: '700' }]}>{item.titulo}</Text>
      {item.contador ? <Text style={e.contador}>{item.contador}</Text> : null}
    </Pressable>
  );
}

const e = StyleSheet.create({
  barra: { width: ANCHO_BARRA, backgroundColor: colores.superficie, borderRightWidth: 1, borderRightColor: colores.bordeSuave },
  marca: { minHeight: 64, justifyContent: 'center', paddingHorizontal: espacio.l, paddingVertical: espacio.s, backgroundColor: colores.primario },
  marcaTitulo: { fontSize: texto.grande, fontWeight: '700', color: colores.primarioTexto },
  marcaContexto: { fontSize: texto.chico, color: colores.primarioTexto },
  secciones: { padding: espacio.s, gap: espacio.m },
  seccion: { fontSize: texto.chico - 1, fontWeight: '700', color: colores.textoSuave, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: espacio.m, paddingTop: espacio.s },
  item: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: espacio.s, paddingHorizontal: espacio.m, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: 'transparent' },
  itemActivo: { backgroundColor: colores.primarioSuave, borderLeftColor: colores.primario },
  itemTexto: { flex: 1, fontSize: texto.chico + 1, color: colores.texto },
  contador: { minWidth: 24, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 12, backgroundColor: colores.aviso, color: colores.primarioTexto, fontSize: texto.chico - 1, fontWeight: '700', textAlign: 'center' },
  pie: { padding: espacio.l, gap: espacio.s, borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  estado: { fontSize: texto.chico, color: colores.textoSuave },
  usuario: { fontSize: texto.chico + 1, fontWeight: '600', color: colores.texto },
});
