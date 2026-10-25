import { describe, expect, it } from 'vitest';
import {
  aniosCumplidos,
  calcularEdad,
  diaCumpleanios,
  formatearEdad,
  formatearFecha,
  formatearFechaHora,
  hoyAR,
  interpretarFecha,
  sumarAnios,
} from '../src/fechas';

describe('RN-01 edad', () => {
  it('ejemplo del SRS: 22/02/2011 al 24/10/2026 es 15,6', () => {
    expect(calcularEdad('2011-02-22', '2026-10-24')).toBe(15.6);
    expect(formatearEdad(calcularEdad('2011-02-22', '2026-10-24'))).toBe('15,6');
  });
  it('el día del cumpleaños la edad es entera', () => {
    expect(calcularEdad('2010-10-24', '2026-10-24')).toBe(16);
  });
  it('el día anterior al cumpleaños trunca a ,9', () => {
    expect(calcularEdad('2010-10-25', '2026-10-24')).toBe(15.9);
  });
  it('nacido el 29/02 cumple el 28/02 en años no bisiestos', () => {
    expect(aniosCumplidos('2008-02-29', '2026-02-28')).toBe(18);
    expect(aniosCumplidos('2008-02-29', '2026-02-27')).toBe(17);
  });
  it('fecha de nacimiento futura da 0', () => {
    expect(calcularEdad('2030-01-01', '2026-10-24')).toBe(0);
  });
});

describe('RN-04 interpretación de fechas', () => {
  it('ejemplos del SRS', () => {
    expect(interpretarFecha('08/03/88', '2026-10-24')).toBe('1988-03-08');
    expect(interpretarFecha('22/02/11', '2026-10-24')).toBe('2011-02-22');
  });
  it('año de dos dígitos igual al actual no es futuro', () => {
    expect(interpretarFecha('01/01/26', '2026-10-24')).toBe('2026-01-01');
    expect(interpretarFecha('01/01/27', '2026-10-24')).toBe('1927-01-01');
  });
  it('acepta cuatro dígitos, guiones e ISO', () => {
    expect(interpretarFecha('5-3-2011')).toBe('2011-03-05');
    expect(interpretarFecha('2011-03-05')).toBe('2011-03-05');
  });
  it('rechaza fechas imposibles o texto', () => {
    expect(interpretarFecha('31/02/2011')).toBeNull();
    expect(interpretarFecha('hola')).toBeNull();
    expect(interpretarFecha('')).toBeNull();
  });
});

describe('formatos', () => {
  it('dd/mm/aaaa y hora de Argentina', () => {
    expect(formatearFecha('2011-02-22')).toBe('22/02/2011');
    expect(formatearFechaHora('2026-10-24T02:30:00Z')).toBe('23/10/2026 23:30');
    expect(hoyAR(new Date('2026-10-25T02:00:00Z'))).toBe('2026-10-24');
    expect(diaCumpleanios('2011-02-22')).toBe('22/02');
  });
  it('sumarAnios para la anonimización a 2 años', () => {
    expect(sumarAnios('2026-03-01', 2)).toBe('2028-03-01');
  });
});
