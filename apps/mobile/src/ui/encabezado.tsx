import { useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { colores, espacio, TACTIL_MINIMO, texto } from './tema';

/** Botón "Menú" del encabezado de las pantallas principales (inicio y nómina). */
export function BotonMenu() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push('/menu')} accessibilityRole="button" accessibilityLabel="Menú" style={{ minHeight: TACTIL_MINIMO, minWidth: TACTIL_MINIMO, justifyContent: 'center', paddingHorizontal: espacio.s }}>
      <Text style={{ color: colores.primarioTexto, fontSize: texto.normal, fontWeight: '700' }}>Menú</Text>
    </Pressable>
  );
}
