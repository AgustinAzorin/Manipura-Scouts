import { describe, expect, it } from 'vitest';
import type { FichaDTO, RamaConfigDTO } from '../src/api';
import { armarGraficos, porcentaje, SIN_DATO, type Grafico, type IdGrafico } from '../src/graficos';
import { armarNomina, describirFiltros, indexarRama } from '../src/nomina';

const HOY = '2026-10-24';

const rama: RamaConfigDTO = {
  id: 'r1',
  grupoId: 'g1',
  nombre: 'Caminantes',
  comunidad: null,
  camposOcultos: [],
  catalogos: [
    { id: 'span', catalogo: 'promesa', nombre: 's/pañuelo', activo: true, orden: 1, logo: null, esAdulto: false },
    { id: 'cpan', catalogo: 'promesa', nombre: 'c/pañuelo - s/promesa caminante', activo: true, orden: 2, logo: 'logo-cpan', esAdulto: false },
    { id: 'cprom', catalogo: 'promesa', nombre: 'c/promesa caminante', activo: true, orden: 3, logo: 'logo-cprom', esAdulto: false },
    { id: 'ini', catalogo: 'etapa', nombre: 'Ini', activo: true, orden: 1, logo: null, esAdulto: false },
    { id: 'desc', catalogo: 'etapa', nombre: 'Descubrimiento', activo: true, orden: 2, logo: null, esAdulto: false },
    { id: 'vieja', catalogo: 'etapa', nombre: 'Etapa vieja', activo: false, orden: 3, logo: null, esAdulto: false },
    { id: 'fuego', catalogo: 'elemento', nombre: 'Fuego', activo: true, orden: 1, logo: 'logo-fuego', esAdulto: false },
    { id: 'cat', catalogo: 'religion', nombre: 'Católica', activo: true, orden: 1, logo: null, esAdulto: false },
  ],
  equipos: [
    { id: 'bp', nombre: 'Baden Powell', activo: true, desactivadoEn: null, logo: 'logo-bp' },
    { id: 'fk', nombre: 'Frida Kahlo', activo: true, desactivadoEn: null, logo: null },
    { id: 'ta', nombre: 'Tupac Amaru', activo: true, desactivadoEn: null, logo: null },
    { id: 'lm', nombre: 'Lola Mora', activo: true, desactivadoEn: null, logo: null },
    { id: 'ap', nombre: 'Arturo Penny', activo: true, desactivadoEn: null, logo: null },
    { id: 'ex', nombre: 'Equipo viejo', activo: false, desactivadoEn: '2026-10-01T00:00:00Z', logo: null },
  ],
  camposPropios: [],
};

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
  apellido: `Apellido${n}`,
  nombre: 'Nombre',
  fechaNacimiento: '2010-01-01',
  ...extra,
});

/** Fichas con esa edad cumplida al 24/10/2026. */
const deEdad = (anios: number, cantidad: number, extra: Partial<FichaDTO> = {}) =>
  Array.from({ length: cantidad }, () => ficha({ fechaNacimiento: `${2026 - anios}-03-01`, ...extra }));

const grafico = (gs: Grafico[], id: IdGrafico) => gs.find((g) => g.id === id);
const valores = (g: Grafico | undefined) => g?.barras.map((b) => [b.etiqueta, b.valor]);

describe('RF-106 gráfico de edades', () => {
  it('cuenta por años cumplidos', () => {
    const fichas = [...deEdad(14, 1), ...deEdad(15, 7), ...deEdad(16, 15), ...deEdad(17, 8), ...deEdad(18, 7)];
    const g = grafico(armarGraficos(fichas, indexarRama(rama), { verSensibles: true, hoy: HOY }), 'edades');
    expect(valores(g)).toEqual([
      ['14 años', 1],
      ['15 años', 7],
      ['16 años', 15],
      ['17 años', 8],
      ['18 años', 7],
    ]);
    expect(g?.total).toBe(38);
  });
  it('las edades intermedias sin nadie quedan en 0 y las fichas sin fecha van aparte', () => {
    const fichas = [...deEdad(14, 2), ...deEdad(16, 1), ficha({ fechaNacimiento: null })];
    const g = grafico(armarGraficos(fichas, indexarRama(rama), { verSensibles: true, hoy: HOY }), 'edades');
    expect(valores(g)).toEqual([
      ['14 años', 2],
      ['15 años', 0],
      ['16 años', 1],
      ['Sin dato', 1],
    ]);
  });
});

describe('RF-107 gráfico de promesas', () => {
  it('muestra las cantidades en el orden del catálogo, con logo', () => {
    const fichas = [ficha({ promesaId: 'cpan' }), ficha({ promesaId: 'cpan' }), ficha({ promesaId: 'cprom' })];
    const g = grafico(armarGraficos(fichas, indexarRama(rama), { verSensibles: false, hoy: HOY }), 'promesas')!;
    expect(valores(g)).toEqual([
      ['s/pañuelo', 0],
      ['c/pañuelo - s/promesa caminante', 2],
      ['c/promesa caminante', 1],
    ]);
    expect(g.barras.map((b) => b.logo)).toEqual([null, 'logo-cpan', 'logo-cprom']);
  });
});

describe('RF-108 gráfico de TADA', () => {
  it('cuenta las tres categorías, cada una con un color distinto', () => {
    const fichas = [...deEdad(17, 2, { tieneTada: true }), ...deEdad(16, 26), ...deEdad(15, 10)];
    const g = grafico(armarGraficos(fichas, indexarRama(rama), { verSensibles: false, hoy: HOY }), 'tada')!;
    expect(valores(g)).toEqual([
      ['Tiene', 2],
      ['Puede hacer', 26],
      ['No puede', 10],
    ]);
    expect(new Set(g.barras.map((b) => b.color)).size).toBe(3);
  });
});

describe('RF-109 gráficos por equipo, elemento y etapa', () => {
  it('una barra por equipo más "Sin equipo"; el equipo desactivado solo si conserva integrantes', () => {
    const fichas = [ficha({ equipoId: 'bp' }), ficha({ equipoId: 'bp' }), ficha({ equipoId: 'ta' }), ficha({ equipoId: null })];
    const g = grafico(armarGraficos(fichas, indexarRama(rama), { verSensibles: false, hoy: HOY }), 'equipos')!;
    expect(valores(g)).toEqual([
      ['Arturo Penny', 0],
      ['Baden Powell', 2],
      ['Frida Kahlo', 0],
      ['Lola Mora', 0],
      ['Tupac Amaru', 1],
      ['Sin equipo', 1],
    ]);
    const conViejo = grafico(armarGraficos([ficha({ equipoId: 'ex' })], indexarRama(rama), { verSensibles: false, hoy: HOY }), 'equipos')!;
    expect(conViejo.barras.find((b) => b.clave === 'ex')).toMatchObject({ valor: 1, inactivo: true });
  });
  it('con alcance de equipo o un equipo elegido no muestra los demás en 0', () => {
    const fichas = [ficha({ equipoId: 'bp' })];
    const g = grafico(armarGraficos(fichas, indexarRama(rama), { verSensibles: false, equipos: ['bp'], hoy: HOY }), 'equipos')!;
    expect(valores(g)).toEqual([['Baden Powell', 1]]);
  });
  it('etapa: el valor desactivado aparece solo si alguien lo tiene', () => {
    const fichas = [ficha({ etapaId: 'desc' }), ficha({ etapaId: null })];
    expect(valores(grafico(armarGraficos(fichas, indexarRama(rama), { verSensibles: false, hoy: HOY }), 'etapas'))).toEqual([
      ['Ini', 0],
      ['Descubrimiento', 1],
      ['Sin dato', 1],
    ]);
    const conVieja = grafico(armarGraficos([ficha({ etapaId: 'vieja' })], indexarRama(rama), { verSensibles: false, hoy: HOY }), 'etapas')!;
    expect(conVieja.barras.find((b) => b.clave === 'vieja')).toMatchObject({ valor: 1, inactivo: true });
  });
  it('elemento con logo', () => {
    const g = grafico(armarGraficos([ficha({ elementoId: 'fuego' })], indexarRama(rama), { verSensibles: false, hoy: HOY }), 'elementos')!;
    expect(g.barras[0]).toMatchObject({ etiqueta: 'Fuego', valor: 1, logo: 'logo-fuego' });
  });
});

describe('RF-110 gráfico de religión', () => {
  it('no aparece sin el permiso de datos sensibles', () => {
    const fichas = [ficha({ religionId: 'cat' })];
    expect(grafico(armarGraficos(fichas, indexarRama(rama), { verSensibles: false, hoy: HOY }), 'religion')).toBeUndefined();
    expect(valores(grafico(armarGraficos(fichas, indexarRama(rama), { verSensibles: true, hoy: HOY }), 'religion'))).toEqual([['Católica', 1]]);
  });
  it('cuenta solo las fichas cuyos datos sensibles llegaron al dispositivo', () => {
    const sinPermiso = ficha({});
    delete sinPermiso.religionId;
    const fichas = [ficha({ religionId: 'cat' }), ficha({ religionId: null }), sinPermiso];
    const g = grafico(armarGraficos(fichas, indexarRama(rama), { verSensibles: true, hoy: HOY }), 'religion')!;
    expect(g.total).toBe(2);
    expect(valores(g)).toEqual([
      ['Católica', 1],
      ['Sin dato', 1],
    ]);
  });
});

describe('RF-048 campos ocultos', () => {
  it('un campo oculto en la rama saca su gráfico', () => {
    const ix = indexarRama({ ...rama, camposOcultos: ['tieneTada', 'equipoId'] });
    const ids = armarGraficos([ficha({})], ix, { verSensibles: true, hoy: HOY }).map((g) => g.id);
    expect(ids).not.toContain('tada');
    expect(ids).not.toContain('equipos');
    expect(ids).toContain('edades');
  });
});

describe('RF-111 / RF-112 filtros', () => {
  const ix = indexarRama(rama);
  const fichas = [
    ...deEdad(17, 1, { equipoId: 'lm', tieneTada: true, etapaId: 'desc' }),
    ...deEdad(16, 2, { equipoId: 'lm', etapaId: 'ini' }),
    ...deEdad(16, 3, { equipoId: 'bp', etapaId: 'desc' }),
  ];
  it('equipo = Lola Mora: el gráfico de TADA cuenta solo sus integrantes', () => {
    const lista = armarNomina(fichas, ix, { equipoId: 'lm', hoy: HOY });
    expect(valores(grafico(armarGraficos(lista, ix, { verSensibles: false, hoy: HOY }), 'tada'))).toEqual([
      ['Tiene', 1],
      ['Puede hacer', 2],
      ['No puede', 0],
    ]);
  });
  it('los filtros de la nómina se aplican a todos los gráficos', () => {
    const lista = armarNomina(fichas, ix, { filtros: { etapa: ['desc'] }, hoy: HOY });
    for (const g of armarGraficos(lista, ix, { verSensibles: false, hoy: HOY })) expect(g.total).toBe(4);
  });
  it('describe los filtros en palabras', () => {
    expect(describirFiltros({ equipo: ['ta', SIN_DATO], etapa: ['desc'], tada: ['puedeHacer'], edadDesde: 16, edadHasta: 17.5, soloIncompletas: true }, ix)).toEqual([
      'Equipo: Tupac Amaru, Sin equipo',
      'Etapa: Descubrimiento',
      'TADA: Puede hacer',
      'Edad de 16 a 17,5',
      'Solo fichas incompletas',
    ]);
    expect(describirFiltros({}, ix)).toEqual([]);
  });
});

describe('porcentaje', () => {
  it('redondea y no divide por cero', () => {
    expect(porcentaje(1, 3)).toBe(33);
    expect(porcentaje(0, 0)).toBe(0);
  });
});
