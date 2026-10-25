import { describe, expect, it } from 'vitest';
import type { FichaDTO, RamaConfigDTO } from '../src/api';
import { armarNomina, columnasDisponibles, indexarRama, siguienteOrden, valorColumna } from '../src/nomina';

const HOY = '2026-10-24';

const rama: RamaConfigDTO = {
  id: 'r1',
  grupoId: 'g1',
  nombre: 'Caminantes',
  comunidad: null,
  camposOcultos: [],
  catalogos: [
    { id: 'ini', catalogo: 'etapa', nombre: 'Ini', activo: true, orden: 1, logo: null, esAdulto: false },
    { id: 'desc', catalogo: 'etapa', nombre: 'Descubrimiento', activo: true, orden: 2, logo: null, esAdulto: false },
    { id: 'fuego', catalogo: 'elemento', nombre: 'Fuego', activo: true, orden: 1, logo: 'logo-fuego', esAdulto: false },
  ],
  equipos: [
    { id: 'tupac', nombre: 'Tupac Amaru', activo: true, desactivadoEn: null, logo: null },
    { id: 'lola', nombre: 'Lola Mora', activo: false, desactivadoEn: '2026-10-01T00:00:00Z', logo: null },
  ],
  camposPropios: [{ id: 'cp1', nombre: 'Seisena', tipo: 'lista', seccion: 'organizacion', sensible: false, opciones: ['Blanca', 'Negra'], activo: true }],
};
const ix = indexarRama(rama);

let n = 0;
const ficha = (extra: Partial<FichaDTO>): FichaDTO => ({
  id: `f${++n}`,
  grupoId: 'g1',
  ramaId: 'r1',
  estado: 'activa',
  version: 1,
  incompletaMotivos: [],
  camposPropios: {},
  archivadaEn: null,
  creadoEn: '',
  actualizadoEn: '',
  apellido: 'Apellido',
  nombre: 'Nombre',
  fechaNacimiento: '2010-01-01',
  ...extra,
});

describe('RF-031 filtros', () => {
  const fichas = [
    ficha({ apellido: 'A', equipoId: 'tupac', fechaNacimiento: '2010-01-01' }), // 16,8
    ficha({ apellido: 'B', equipoId: 'tupac', fechaNacimiento: '2008-11-01' }), // 17,9
    ficha({ apellido: 'C', equipoId: 'tupac', fechaNacimiento: '2011-01-01' }), // 15,8
    ficha({ apellido: 'D', equipoId: 'lola', fechaNacimiento: '2010-01-01' }),
    ficha({ apellido: 'E', equipoId: null, fechaNacimiento: '2008-01-01' }), // 18,8
  ];
  it('Equipo = Tupac Amaru y Edad de 16 a 17', () => {
    const r = armarNomina(fichas, ix, { filtros: { equipo: ['tupac'], edadDesde: 16, edadHasta: 17 }, hoy: HOY });
    expect(r.map((f) => f.apellido)).toEqual(['A', 'B']);
  });
  it('Sin equipo', () => {
    expect(armarNomina(fichas, ix, { filtros: { equipo: ['__sin__'] }, hoy: HOY }).map((f) => f.apellido)).toEqual(['E']);
  });
  it('estado de TADA y campos propios', () => {
    const f1 = ficha({ apellido: 'T', tieneTada: true, fechaNacimiento: '2009-01-01', camposPropios: { cp1: 'Blanca' } });
    const f2 = ficha({ apellido: 'U', fechaNacimiento: '2009-01-01', camposPropios: { cp1: 'Negra' } });
    expect(armarNomina([f1, f2], ix, { filtros: { tada: ['tiene'] }, hoy: HOY })).toEqual([f1]);
    expect(armarNomina([f1, f2], ix, { filtros: { propios: { cp1: ['Negra'] } }, hoy: HOY })).toEqual([f2]);
  });
  it('un filtro sobre un campo oculto en la rama se ignora (RF-048)', () => {
    const ix2 = indexarRama({ ...rama, camposOcultos: ['tieneTada'] });
    expect(armarNomina(fichas, ix2, { filtros: { tada: ['tiene'] }, hoy: HOY })).toHaveLength(5);
    expect(columnasDisponibles({ ...rama, camposOcultos: ['tieneTada'] }, true).some((c) => c.id === 'tada')).toBe(false);
  });
});

describe('RF-030 columnas', () => {
  it('sin permiso de sensibles no se ofrecen DNI ni teléfonos', () => {
    const ids = columnasDisponibles(rama, false).map((c) => c.id);
    expect(ids).not.toContain('dni');
    expect(ids).not.toContain('telEmergencia1');
    expect(ids).toContain('cp:cp1');
    expect(columnasDisponibles(rama, true).map((c) => c.id)).toContain('dni');
  });
  it('logo del elemento y equipo inactivo', () => {
    const f = ficha({ elementoId: 'fuego', equipoId: 'lola' });
    expect(valorColumna(f, 'elemento', ix, HOY)).toMatchObject({ texto: 'Fuego', logo: 'logo-fuego' });
    expect(valorColumna(f, 'equipo', ix, HOY)).toMatchObject({ texto: 'Lola Mora', inactivo: true });
    expect(valorColumna(f, 'edad', ix, HOY).texto).toBe('16,8');
  });
});

describe('RF-032 / RF-033 búsqueda y orden', () => {
  it('tocar "Edad" dos veces ordena de mayor a menor', () => {
    const fichas = [ficha({ apellido: 'Joven', fechaNacimiento: '2012-01-01' }), ficha({ apellido: 'Mayor', fechaNacimiento: '2008-01-01' }), ficha({ apellido: 'Medio', fechaNacimiento: '2010-01-01' })];
    let orden = siguienteOrden(null, 'edad');
    expect(armarNomina(fichas, ix, { orden, hoy: HOY }).map((f) => f.apellido)).toEqual(['Joven', 'Medio', 'Mayor']);
    orden = siguienteOrden(orden, 'edad');
    expect(orden.direccion).toBe('desc');
    expect(armarNomina(fichas, ix, { orden, hoy: HOY }).map((f) => f.apellido)).toEqual(['Mayor', 'Medio', 'Joven']);
  });
  it('por defecto alfabético en español y vista por equipo', () => {
    const fichas = [ficha({ apellido: 'Núñez', equipoId: 'tupac' }), ficha({ apellido: 'Álvarez', equipoId: 'lola' }), ficha({ apellido: 'Ochoa' })];
    expect(armarNomina(fichas, ix, { hoy: HOY }).map((f) => f.apellido)).toEqual(['Álvarez', 'Núñez', 'Ochoa']);
    expect(armarNomina(fichas, ix, { equipoId: 'tupac', hoy: HOY }).map((f) => f.apellido)).toEqual(['Núñez']);
    expect(armarNomina(fichas, ix, { busqueda: 'alvarez', hoy: HOY }).map((f) => f.apellido)).toEqual(['Álvarez']);
  });
});

describe('RNF-002 rendimiento', () => {
  it('buscar, filtrar y ordenar 500 fichas lleva mucho menos de 1 s', () => {
    const fichas = Array.from({ length: 500 }, (_, i) =>
      ficha({
        apellido: `Apellido${i}`,
        nombre: `Nombre${i}`,
        dni: String(40000000 + i),
        equipoId: i % 2 ? 'tupac' : 'lola',
        etapaId: i % 3 ? 'ini' : 'desc',
        fechaNacimiento: `20${String(8 + (i % 5)).padStart(2, '0')}-0${1 + (i % 9)}-15`,
      }),
    );
    const inicio = performance.now();
    for (let k = 0; k < 10; k++) {
      armarNomina(fichas, ix, { busqueda: 'apellido4', filtros: { etapa: ['ini'], edadDesde: 14, edadHasta: 17 }, orden: { columna: 'edad', direccion: 'desc' }, hoy: HOY });
    }
    const porVuelta = (performance.now() - inicio) / 10;
    expect(porVuelta).toBeLessThan(100);
  });
});
