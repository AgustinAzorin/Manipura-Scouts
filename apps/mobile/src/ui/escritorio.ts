import { Platform, useWindowDimensions } from 'react-native';

/** Desde este ancho la versión web usa la disposición de escritorio: barra lateral y contenido centrado. */
export const ANCHO_ESCRITORIO = 900;
/** Ancho máximo del contenido de las pantallas comunes, para que las líneas no queden larguísimas. */
export const ANCHO_LECTURA = 880;
/** Ancho de las pantallas angostas (inicio de sesión) y de los diálogos. */
export const ANCHO_ANGOSTO = 480;

/** Navegador con pantalla ancha (compu o tablet apaisada). En el celular siempre es falso. */
export function useEscritorio(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= ANCHO_ESCRITORIO;
}

/** En la web, Pressable también informa si el mouse está encima (los tipos de React Native no lo incluyen). */
export const conMouseEncima = (estado: object): boolean => (estado as { hovered?: boolean }).hovered === true;
