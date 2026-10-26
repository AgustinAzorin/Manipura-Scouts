import { useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useEscritorio } from './escritorio';
import { colores, espacio, TACTIL_MINIMO, texto } from './tema';

/** Botón "Menú" del encabezado de las pantallas principales (inicio y nómina). En la web ancha está la barra lateral. */
export function BotonMenu() {
  const router = useRouter();
  if (useEscritorio()) return null;
  return (
    <Pressable onPress={() => router.push('/menu')} accessibilityRole="button" accessibilityLabel="Menú" style={{ minHeight: TACTIL_MINIMO, minWidth: TACTIL_MINIMO, justifyContent: 'center', paddingHorizontal: espacio.s }}>
      <Text style={{ color: colores.primarioTexto, fontSize: texto.normal, fontWeight: '700' }}>Menú</Text>
    </Pressable>
  );
}
