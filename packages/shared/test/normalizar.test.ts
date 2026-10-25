import { describe, expect, it } from 'vitest';
import { coincideBusqueda, normalizarDni, normalizarTelefono, normalizarTexto } from '../src/normalizar';

describe('RN-03 / RD-009 normalización', () => {
  it('DNI sin puntos', () => {
    expect(normalizarDni('50.890.337')).toBe('50890337');
    expect(normalizarDni(' 50 890 337 ')).toBe('50890337');
    expect(normalizarDni('')).toBeNull();
  });
  it('teléfono solo dígitos', () => {
    expect(normalizarTelefono('11 5925-4075')).toBe('1159254075');
    expect(normalizarTelefono('(011) 4444-5555')).toBe('01144445555');
  });
});

describe('RF-032 búsqueda', () => {
  const f = { apellido: 'Álvarez', nombre: 'Gabriel', dni: '50042384' };
  it('ignora mayúsculas y tildes', () => {
    expect(normalizarTexto('ÁLVAREZ')).toBe('alvarez');
    expect(coincideBusqueda('alvarez', f)).toBe(true);
    expect(coincideBusqueda('gabriel alv', f)).toBe(true);
    expect(coincideBusqueda('Álvarez, Gab', f)).toBe(true);
    expect(coincideBusqueda('perez', f)).toBe(false);
  });
  it('DNI con puntos, solo si el DNI está disponible', () => {
    expect(coincideBusqueda('50.042.384', f)).toBe(true);
    expect(coincideBusqueda('50.042.384', { apellido: 'Álvarez', nombre: 'Gabriel' })).toBe(false);
  });
});
