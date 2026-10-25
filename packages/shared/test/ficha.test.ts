import { describe, expect, it } from 'vitest';
import {
  cuotasAdeudadas,
  erroresDeFormato,
  estadoTada,
  obligatoriosFaltantes,
  sanearCuotas,
  tadaEditable,
  validarDocumento,
  valorCampoPropioValido,
} from '../src/ficha';
import { calcularEdad } from '../src/fechas';

describe('RN-02 / RF-037 TADA', () => {
  it('15,9 años: No puede y no editable', () => {
    expect(estadoTada(15.9, false)).toBe('noPuede');
    expect(estadoTada(15.9, true)).toBe('noPuede');
    expect(tadaEditable(15.9)).toBe(false);
  });
  it('16,0 sin TADA: Puede hacer', () => {
    expect(estadoTada(16, false)).toBe('puedeHacer');
    expect(tadaEditable(16)).toBe(true);
  });
  it('17,4 con TADA: Tiene', () => {
    expect(estadoTada(17.4, true)).toBe('tiene');
  });
  it('sin fecha de nacimiento no hay estado', () => {
    expect(estadoTada(null, true)).toBeNull();
  });
  it('rechaza "Tiene TADA" antes de los 16', () => {
    const hoy = '2026-10-24';
    expect(calcularEdad('2011-02-22', hoy)).toBe(15.6);
    expect(erroresDeFormato({ fechaNacimiento: '2011-02-22', tieneTada: true }, hoy).tieneTada).toBeDefined();
    expect(erroresDeFormato({ fechaNacimiento: '2009-02-22', tieneTada: true }, hoy).tieneTada).toBeUndefined();
  });
});

describe('RF-022 obligatorios', () => {
  const completa = {
    apellido: 'Pérez',
    nombre: 'Ana',
    dni: '50890337',
    fechaNacimiento: '2010-01-01',
    telEmergencia2: '1159254075',
  };
  it('completa con cualquiera de los dos teléfonos de emergencia', () => {
    expect(obligatoriosFaltantes(completa)).toEqual([]);
  });
  it('indica la fecha de nacimiento faltante', () => {
    expect(obligatoriosFaltantes({ ...completa, fechaNacimiento: null })).toEqual(['Fecha de nacimiento']);
  });
  it('cordi exige equipo (RF-038)', () => {
    expect(erroresDeFormato({ cordi: 'coordinador' }).cordi).toBeDefined();
    expect(erroresDeFormato({ cordi: 'coordinador', equipoId: 'e1' }).cordi).toBeUndefined();
  });
});

describe('RN-05 cuotas', () => {
  it('pagada, adeudada y exenta; exenta no se adeuda', () => {
    const c = sanearCuotas({ mayo: 'pagada', junio: 'adeudada', afiliacion: 'exenta', distrito: 'X', monto: 100 });
    expect(c).toEqual({ mayo: 'pagada', junio: 'adeudada', afiliacion: 'exenta' });
    expect(cuotasAdeudadas(c)).toEqual(['junio']);
  });
});

describe('RN-06 documentos', () => {
  it('presentado exige fecha', () => {
    expect(validarDocumento('usoImagen', 'presentadoNoAutoriza', '2026-03-10')).toBeNull();
    expect(validarDocumento('ddjjSalud', 'presentado', null)).toBe('Indicá la fecha de entrega');
    expect(validarDocumento('ddjjSalud', 'noPresentado', null)).toBeNull();
  });
  it('estados según el tipo', () => {
    expect(validarDocumento('ddjjSalud', 'presentadoAutoriza', '2026-03-10')).not.toBeNull();
    expect(validarDocumento('retiroSolo', 'presentado', '2026-03-10')).not.toBeNull();
  });
});

describe('RF-119 campos propios', () => {
  it('valida por tipo', () => {
    const lista = { tipo: 'lista' as const, opciones: ['Blanca', 'Negra'] };
    expect(valorCampoPropioValido(lista, 'Blanca')).toBe(true);
    expect(valorCampoPropioValido(lista, 'Roja')).toBe(false);
    expect(valorCampoPropioValido({ tipo: 'booleano', opciones: [] }, 'si')).toBe(false);
    expect(valorCampoPropioValido({ tipo: 'fecha', opciones: [] }, '2026-02-30')).toBe(false);
    expect(valorCampoPropioValido({ tipo: 'texto', opciones: [] }, null)).toBe(true);
  });
});
