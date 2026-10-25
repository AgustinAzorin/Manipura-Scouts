import { describe, expect, it } from 'vitest';
import { asignacionesEnRama, permisosEfectivos, puede, puedeVerSensibles, sanearPermisos, type AsignacionConRol } from '../src/permisos';

const jefe = { permisos: { padron: ['ver', 'crear', 'editar', 'eliminar'] as const }, verSensibles: true };
const lectura = { permisos: { padron: ['ver'] as const }, verSensibles: false };
const rol = (r: typeof jefe | typeof lectura) => ({ permisos: { padron: [...r.permisos.padron] }, verSensibles: r.verSensibles });

describe('RF-019 roles con alcance', () => {
  const asig: AsignacionConRol[] = [
    { grupoId: 'g1', alcance: 'rama', ramaId: 'caminantes', equipoId: null, rol: rol(jefe) },
    { grupoId: 'g1', alcance: 'rama', ramaId: 'unidad', equipoId: null, rol: rol(lectura) },
  ];
  it('jefe en Caminantes y solo lectura en Unidad', () => {
    expect(puede(asig, 'padron', 'editar', { grupoId: 'g1', ramaId: 'caminantes', equipoId: 'bp' })).toBe(true);
    expect(puede(asig, 'padron', 'editar', { grupoId: 'g1', ramaId: 'unidad', equipoId: null })).toBe(false);
    expect(puede(asig, 'padron', 'ver', { grupoId: 'g1', ramaId: 'unidad', equipoId: null })).toBe(true);
  });
  it('aislamiento: nada en otro grupo', () => {
    expect(puede(asig, 'padron', 'ver', { grupoId: 'g2', ramaId: 'caminantes' })).toBe(false);
  });
  it('alcance de equipo: solo las fichas del equipo', () => {
    const eq: AsignacionConRol[] = [{ grupoId: 'g1', alcance: 'equipo', ramaId: null, equipoId: 'tupac', rol: rol(jefe) }];
    expect(puede(eq, 'padron', 'editar', { grupoId: 'g1', ramaId: 'caminantes', equipoId: 'tupac' })).toBe(true);
    expect(puede(eq, 'padron', 'editar', { grupoId: 'g1', ramaId: 'caminantes', equipoId: 'lola' })).toBe(false);
    expect(puede(eq, 'padron', 'ver', { grupoId: 'g1', ramaId: 'caminantes', equipoId: null })).toBe(false);
  });
  it('alcance de grupo cubre todas las ramas', () => {
    const g: AsignacionConRol[] = [{ grupoId: 'g1', alcance: 'grupo', ramaId: null, equipoId: null, rol: rol(lectura) }];
    expect(puede(g, 'padron', 'ver', { grupoId: 'g1', ramaId: 'manada' })).toBe(true);
    expect(puede(g, 'padron', 'editar', { grupoId: 'g1', ramaId: 'manada' })).toBe(false);
  });
});

describe('RF-020 datos sensibles', () => {
  it('solo con el permiso explícito y dentro del alcance', () => {
    const asig: AsignacionConRol[] = [
      { grupoId: 'g1', alcance: 'rama', ramaId: 'caminantes', equipoId: null, rol: rol(jefe) },
      { grupoId: 'g1', alcance: 'rama', ramaId: 'unidad', equipoId: null, rol: rol(lectura) },
    ];
    expect(puedeVerSensibles(asig, { grupoId: 'g1', ramaId: 'caminantes' })).toBe(true);
    expect(puedeVerSensibles(asig, { grupoId: 'g1', ramaId: 'unidad' })).toBe(false);
  });
});

describe('permisos efectivos y saneo', () => {
  it('une las asignaciones de la rama', () => {
    const asig: AsignacionConRol[] = [
      { grupoId: 'g1', alcance: 'grupo', ramaId: null, equipoId: null, rol: { permisos: { calendario: ['ver'] }, verSensibles: false } },
      { grupoId: 'g1', alcance: 'equipo', ramaId: null, equipoId: 'tupac', rol: rol(jefe) },
      { grupoId: 'g1', alcance: 'equipo', ramaId: null, equipoId: 'otro', rol: { permisos: { cuotas: ['ver'] }, verSensibles: false } },
    ];
    const enRama = asignacionesEnRama(asig, 'g1', 'caminantes', new Set(['tupac']));
    expect(enRama).toHaveLength(2);
    const ef = permisosEfectivos(enRama);
    expect(ef.permisos.calendario).toEqual(['ver']);
    expect(ef.permisos.padron).toContain('editar');
    expect(ef.permisos.cuotas).toBeUndefined();
    expect(ef.verSensibles).toBe(true);
  });
  it('descarta módulos y acciones desconocidos', () => {
    expect(sanearPermisos({ padron: ['ver', 'borrar', 'ver'], hackeo: ['ver'] })).toEqual({ padron: ['ver'] });
  });
});
