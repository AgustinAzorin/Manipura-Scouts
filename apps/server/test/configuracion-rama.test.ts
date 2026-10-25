import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cargarConfiguracionRama, esquemaConfiguracionRama } from '../src/servicios/configuracion-rama';
import { crearEntorno, escenarioBase, type Entorno, type Escenario } from './ayudas';

let e: Entorno;
let esc: Escenario;
beforeEach(async () => {
  e = await crearEntorno();
  esc = await escenarioBase(e);
});
afterEach(async () => {
  await e.cerrar();
});

const caminantes = esquemaConfiguracionRama.parse(JSON.parse(readFileSync(new URL('../../../deploy/ramas/caminantes.json', import.meta.url), 'utf8')));

describe('RF-044 a RF-048 cargar equipos y catálogos de una rama', () => {
  it('crea lo que falta, marca los adultos y no duplica al correrlo de nuevo', async () => {
    const rama = { id: esc.caminantes, grupo_id: esc.grupoId };
    const r = await cargarConfiguracionRama(e.db, rama, caminantes);
    // El escenario ya tiene los 4 equipos y algunos valores ("fuego" en minúscula también cuenta como existente).
    expect(r.equiposCreados).toEqual([]);
    expect(r.valoresCreados).toContain('etapa: Búsqueda');
    expect(r.valoresCreados).toContain('categoriaMiembro: SJ de unidad');
    expect(r.valoresCreados).not.toContain('etapa: Ini');

    const categorias = await e.db
      .selectFrom('catalogo_valores')
      .select(['nombre', 'es_adulto'])
      .where('rama_id', '=', esc.caminantes)
      .where('catalogo', '=', 'categoriaMiembro')
      .execute();
    expect(Object.fromEntries(categorias.map((c) => [c.nombre, c.es_adulto]))).toMatchObject({ Protagonista: false, 'SJ de unidad': true, 'Papá colaborador': true });

    const otra = await cargarConfiguracionRama(e.db, rama, caminantes);
    expect(otra).toMatchObject({ equiposCreados: [], valoresCreados: [] });
  });

  it('un adulto que no está en categoriaMiembro es un error del archivo', () => {
    expect(() => esquemaConfiguracionRama.parse({ catalogos: { categoriaMiembro: ['Protagonista'] }, adultos: ['Educador'] })).toThrow();
  });
});
