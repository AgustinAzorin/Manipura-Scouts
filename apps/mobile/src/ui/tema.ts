/**
 * Colores con contraste WCAG 2.1 AA sobre fondo blanco o "fondo" (RNF-029):
 * texto ≥ 4,5:1, componentes ≥ 3:1. Se verifican en `test/contraste.test.ts`.
 */
export const colores = {
  fondo: '#F4F5F2',
  superficie: '#FFFFFF',
  texto: '#1B1F1A',
  textoSuave: '#4A5247',
  borde: '#6B7368',
  bordeSuave: '#D5D9D2',
  primario: '#1F4D2B',
  primarioTexto: '#FFFFFF',
  primarioSuave: '#E3EEE5',
  peligro: '#A11D1D',
  peligroSuave: '#FDE8E8',
  aviso: '#7A4B00',
  avisoSuave: '#FFF3D6',
  info: '#0B4F8A',
  infoSuave: '#E3EFFA',
  inactivo: '#5F655C',
  filaPar: '#FAFBF8',
} as const;

/** RNF-028: elementos táctiles de al menos 48 × 48 dp. */
export const TACTIL_MINIMO = 48;

export const espacio = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;

export const texto = {
  chico: 14,
  normal: 17,
  grande: 20,
  titulo: 24,
} as const;
