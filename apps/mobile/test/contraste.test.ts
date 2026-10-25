import { describe, expect, it } from 'vitest';
import { COLORES_TIPO_ACTIVIDAD } from '@scouttracker/shared';
import { colores } from '../src/ui/tema';

/** RNF-029: contraste WCAG 2.1 AA. */
function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

describe('RNF-029 contraste', () => {
  const fondos = [colores.superficie, colores.fondo, colores.filaPar];
  it.each([
    ['texto', colores.texto],
    ['texto suave', colores.textoSuave],
    ['primario', colores.primario],
    ['peligro', colores.peligro],
    ['aviso', colores.aviso],
    ['info', colores.info],
    ['inactivo', colores.inactivo],
  ])('%s sobre los fondos claros ≥ 4,5:1', (_, color) => {
    for (const f of fondos) expect(contraste(color, f)).toBeGreaterThanOrEqual(4.5);
  });
  it('texto blanco sobre botones y franjas ≥ 4,5:1', () => {
    for (const f of [colores.primario, colores.peligro, colores.aviso]) expect(contraste(colores.primarioTexto, f)).toBeGreaterThanOrEqual(4.5);
  });
  it('texto sobre los avisos de color ≥ 4,5:1', () => {
    for (const f of [colores.primarioSuave, colores.peligroSuave, colores.avisoSuave, colores.infoSuave]) {
      expect(contraste(colores.texto, f)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(colores.primario, f)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('texto blanco sobre los colores de tipo de actividad ≥ 4,5:1 (RF-063)', () => {
    for (const { color } of COLORES_TIPO_ACTIVIDAD) expect(contraste(colores.primarioTexto, color)).toBeGreaterThanOrEqual(4.5);
  });
  it('bordes de los controles ≥ 3:1', () => {
    for (const f of fondos) expect(contraste(colores.borde, f)).toBeGreaterThanOrEqual(3);
  });
});
