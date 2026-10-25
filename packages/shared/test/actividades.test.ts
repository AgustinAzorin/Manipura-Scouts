import { describe, expect, it } from 'vitest';
import {
  aplicarPendientes,
  asignacionVeActividad,
  confirmacionesProximas,
  encolarRegistro,
  estadoActividad,
  formatearRango,
  instanteAR,
  interpretarHora,
  porcentajeAsistencia,
  prevaleceRegistro,
  totalesActividad,
  type ActividadDTO,
  type InscripcionDTO,
  type RegistroActividad,
} from '../src/actividades';
import type { AsignacionConRol } from '../src/permisos';

const inscripcion = (fichaId: string, extra: Partial<InscripcionDTO> = {}): InscripcionDTO => ({
  fichaId,
  apellido: 'Apellido',
  nombre: fichaId,
  equipoId: null,
  confirmacion: 'sinRespuesta',
  presente: false,
  ...extra,
});

const actividad = (extra: Partial<ActividadDTO> = {}): ActividadDTO => ({
  id: 'a1',
  grupoId: 'g1',
  tipoId: 't1',
  nombre: 'Campamento',
  inicio: '2026-11-14T12:00:00.000Z',
  fin: '2026-11-16T19:00:00.000Z',
  lugar: null,
  alcance: 'rama',
  ramaId: 'r1',
  equipoId: null,
  canceladaEn: null,
  avisos: [],
  destinoAvisos: { tipo: 'alcance' },
  inscripciones: [],
  ...extra,
});

describe('RN-08 conflictos de registros sin conexión', () => {
  const en = (h: number) => `2026-11-14T${String(h).padStart(2, '0')}:00:00.000Z`;

  it('sin conflicto el registro se aplica, también para corregir una marca propia', () => {
    expect(prevaleceRegistro('presente', { valor: false, en: null }, { valor: true, anterior: false, en: en(10) })).toBe(true);
    expect(prevaleceRegistro('presente', { valor: true, en: en(10) }, { valor: false, anterior: true, en: en(11) })).toBe(true);
  });

  it('en asistencia, "Presente" prevalece sobre "Ausente" sin importar el orden', () => {
    // A marcó presente y sincronizó primero; B, que veía "ausente", marcó ausente.
    expect(prevaleceRegistro('presente', { valor: true, en: en(10) }, { valor: false, anterior: false, en: en(12) })).toBe(false);
    // B sincronizó primero; después llega A.
    expect(prevaleceRegistro('presente', { valor: false, en: en(12) }, { valor: true, anterior: true, en: en(10) })).toBe(true);
  });

  it('en los demás campos prevalece el último cambio por hora del dispositivo', () => {
    const actual = { valor: 'noVa', en: en(11) };
    expect(prevaleceRegistro('confirmacion', actual, { valor: 'va', anterior: 'sinRespuesta', en: en(12) })).toBe(true);
    expect(prevaleceRegistro('confirmacion', actual, { valor: 'va', anterior: 'sinRespuesta', en: en(10) })).toBe(false);
    expect(prevaleceRegistro('autorizacion', { valor: 'presentada', en: en(11) }, { valor: 'noPresentada', anterior: 'noPresentada', en: en(9) })).toBe(false);
  });
});

describe('cola de registros pendientes', () => {
  const r = (id: string, valor: boolean, anterior: boolean, fichaId = 'f1'): RegistroActividad => ({
    id,
    actividadId: 'a1',
    fichaId,
    campo: 'presente',
    valor,
    anterior,
    en: `2026-11-14T10:00:0${id}.000Z`,
  });

  it('guarda un registro por campo y conserva el valor que el dispositivo vio primero', () => {
    let cola = encolarRegistro([], r('1', true, false));
    cola = encolarRegistro(cola, r('2', true, false, 'f2'));
    expect(cola).toHaveLength(2);
    // Desmarca f1 y lo vuelve a marcar: queda un registro con el "anterior" original.
    cola = encolarRegistro(cola, r('3', false, true));
    expect(cola).toHaveLength(1);
    cola = encolarRegistro(cola, r('4', true, false));
    expect(cola).toHaveLength(2);
    expect(cola.find((x) => x.fichaId === 'f1')).toMatchObject({ valor: true, anterior: false });
  });

  it('se ve en la actividad aunque no se haya enviado', () => {
    const a = actividad({ inscripciones: [inscripcion('f1'), inscripcion('f2', { autorizacion: { estado: 'noPresentada', fecha: null, archivo: null } })] });
    const cola: RegistroActividad[] = [
      r('1', true, false),
      { id: '9', actividadId: 'a1', fichaId: 'f2', campo: 'autorizacion', valor: 'presentada', anterior: 'noPresentada', fecha: '2026-11-10', en: '2026-11-14T10:00:00.000Z' },
    ];
    const vista = aplicarPendientes(a, cola);
    expect(vista.inscripciones[0]!.presente).toBe(true);
    expect(vista.inscripciones[1]!.autorizacion).toMatchObject({ estado: 'presentada', fecha: '2026-11-10' });
    expect(aplicarPendientes(a, [])).toBe(a);
  });
});

describe('RF-058 / RF-071 totales', () => {
  it('25 inscriptos, 22 presentes: 22 presentes y 3 ausentes', () => {
    const lista = Array.from({ length: 25 }, (_, i) => inscripcion(`f${i}`, { presente: i < 22 }));
    expect(totalesActividad(lista, false)).toMatchObject({ inscriptos: 25, presentes: 22, ausentes: 3, sinAutorizacion: null });
  });

  it('18 confirmados, 15 presentes y 2 sin autorización entre los que van', () => {
    const lista = Array.from({ length: 25 }, (_, i) =>
      inscripcion(`f${i}`, {
        confirmacion: i < 18 ? 'va' : 'noVa',
        presente: i < 15,
        // Los que no van no necesitan autorización: no cuentan aunque no la tengan.
        autorizacion: { estado: i === 3 || i === 16 || i >= 18 ? 'noPresentada' : 'presentada', fecha: null, archivo: null },
      }),
    );
    expect(totalesActividad(lista, true)).toMatchObject({ confirmados: 18, presentes: 15, sinAutorizacion: 2 });
  });

  it('sin permiso de ver autorizaciones no se informa el total', () => {
    expect(totalesActividad([inscripcion('f1', { confirmacion: 'va' })], true).sinAutorizacion).toBeNull();
  });
});

describe('RF-067 columna "Va"', () => {
  const ahora = new Date('2026-11-01T12:00:00Z');

  it('toma la próxima actividad que no empezó, sin las canceladas', () => {
    const pasada = actividad({ id: 'p', inicio: '2026-10-20T12:00:00Z', inscripciones: [inscripcion('f1', { confirmacion: 'noVa' })] });
    const cancelada = actividad({ id: 'c', inicio: '2026-11-05T12:00:00Z', canceladaEn: '2026-10-30T00:00:00Z', inscripciones: [inscripcion('f1', { confirmacion: 'noVa' })] });
    const campamento = actividad({ id: 'cmp', inicio: '2026-11-14T12:00:00Z', inscripciones: [inscripcion('f1', { confirmacion: 'va' }), inscripcion('f2')] });
    const despues = actividad({ id: 'd', inicio: '2026-11-21T12:00:00Z', inscripciones: [inscripcion('f2', { confirmacion: 'va' }), inscripcion('f3', { confirmacion: 'noVa' })] });
    const va = confirmacionesProximas([despues, pasada, campamento, cancelada], ahora);
    expect(va.get('f1')).toBe('va');
    expect(va.get('f2')).toBe('sinRespuesta');
    expect(va.get('f3')).toBe('noVa');
    expect(va.has('f4')).toBe(false);
  });
});

describe('RN-19 visibilidad', () => {
  const asig = (alcance: AsignacionConRol['alcance'], ramaId: string | null, equipoId: string | null): AsignacionConRol => ({
    grupoId: 'g1',
    alcance,
    ramaId,
    equipoId,
    rol: { permisos: { actividades: ['ver'] }, verSensibles: false },
  });
  const act = (alcance: AsignacionConRol['alcance'], ramaId: string | null, equipoId: string | null) => ({ grupoId: 'g1', alcance, ramaId, equipoId });

  it('alcance de equipo: su equipo, su rama y el grupo; no otros equipos ni ramas', () => {
    const a = asig('equipo', 'r1', 'baden');
    expect(asignacionVeActividad(a, act('equipo', 'r1', 'baden'))).toBe(true);
    expect(asignacionVeActividad(a, act('rama', 'r1', null))).toBe(true);
    expect(asignacionVeActividad(a, act('grupo', null, null))).toBe(true);
    expect(asignacionVeActividad(a, act('equipo', 'r1', 'frida'))).toBe(false);
    expect(asignacionVeActividad(a, act('rama', 'r2', null))).toBe(false);
  });

  it('alcance de rama: los equipos de su rama sí, otras ramas no; otro grupo nunca', () => {
    const a = asig('rama', 'r1', null);
    expect(asignacionVeActividad(a, act('equipo', 'r1', 'frida'))).toBe(true);
    expect(asignacionVeActividad(a, act('equipo', 'r2', 'x'))).toBe(false);
    expect(asignacionVeActividad(asig('grupo', null, null), { ...act('rama', 'r1', null), grupoId: 'g2' })).toBe(false);
  });
});

describe('fechas y horas de actividades', () => {
  it('interpreta horas escritas de distintas formas', () => {
    expect(interpretarHora('9')).toBe('09:00');
    expect(interpretarHora('9:30')).toBe('09:30');
    expect(interpretarHora('14.15')).toBe('14:15');
    expect(interpretarHora('0930')).toBe('09:30');
    expect(interpretarHora('25')).toBeNull();
    expect(interpretarHora('mediodía')).toBeNull();
  });

  it('usa la hora de Argentina', () => {
    expect(instanteAR('2026-03-14', '14:00')).toBe('2026-03-14T17:00:00.000Z');
    expect(formatearRango(instanteAR('2026-03-14', '14:00'), instanteAR('2026-03-14', '18:00'))).toBe('14/03/2026 de 14:00 a 18:00');
    expect(formatearRango(instanteAR('2026-03-14', '09:00'), instanteAR('2026-03-16', '13:00'))).toBe('14/03/2026 09:00 al 16/03/2026 13:00');
  });

  it('estado de la actividad', () => {
    const a = actividad({ inicio: '2026-11-14T12:00:00Z', fin: '2026-11-16T19:00:00Z' });
    expect(estadoActividad(a, new Date('2026-11-13T00:00:00Z'))).toBe('proxima');
    expect(estadoActividad(a, new Date('2026-11-15T00:00:00Z'))).toBe('enCurso');
    expect(estadoActividad(a, new Date('2026-11-17T00:00:00Z'))).toBe('terminada');
    expect(estadoActividad({ ...a, canceladaEn: '2026-11-01T00:00:00Z' })).toBe('cancelada');
  });

  it('RF-069 porcentaje de asistencia', () => {
    expect(porcentajeAsistencia({ presentes: 8, total: 10 })).toBe(80);
    expect(porcentajeAsistencia({ presentes: 0, total: 0 })).toBeNull();
    expect(porcentajeAsistencia(undefined)).toBeNull();
  });
});
