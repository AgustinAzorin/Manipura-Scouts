import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearEntorno, escenarioBase, fichaValida, type Entorno, type Escenario } from './ayudas';

let e: Entorno;
let esc: Escenario;
// Los roles son de todo el servidor de PostgreSQL: se borra también si quedó de una corrida anterior.
const borrarRol = sql`DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'api_publica_prueba') THEN
    DROP OWNED BY api_publica_prueba; DROP ROLE api_publica_prueba;
  END IF; END $$`;
beforeEach(async () => {
  e = await crearEntorno();
  esc = await escenarioBase(e);
  await borrarRol.execute(e.db);
});
afterEach(async () => {
  await borrarRol.execute(e.db);
  await e.cerrar();
});

describe('RLS: la API REST de Supabase no ve los datos', () => {
  it('todas las tablas de la app tienen RLS activo', async () => {
    const sinRls = await sql<{ relname: string }>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`.execute(e.db);
    expect(sinRls.rows).toEqual([]);
  });

  it('un rol con permiso de lectura (como "anon" de Supabase) no ve filas; el servidor sí', async () => {
    await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida());
    await sql`CREATE ROLE api_publica_prueba NOLOGIN NOBYPASSRLS`.execute(e.db);
    await sql`GRANT USAGE ON SCHEMA public TO api_publica_prueba`.execute(e.db);
    await sql`GRANT SELECT ON fichas TO api_publica_prueba`.execute(e.db);

    const vistas = await e.db.connection().execute(async (c) => {
      await sql`SET ROLE api_publica_prueba`.execute(c);
      const r = await sql<{ n: number }>`SELECT count(*)::int AS n FROM fichas`.execute(c);
      await sql`RESET ROLE`.execute(c);
      return r.rows[0]!.n;
    });
    expect(vistas).toBe(0);
    const delServidor = await sql<{ n: number }>`SELECT count(*)::int AS n FROM fichas`.execute(e.db);
    expect(delServidor.rows[0]!.n).toBe(1);
  });
});
