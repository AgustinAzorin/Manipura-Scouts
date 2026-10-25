import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import type { Db } from './db';

const DIR_MIGRACIONES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Aplica en orden los archivos .sql de /migrations que todavía no se aplicaron. */
export async function migrar(db: Db, dir = DIR_MIGRACIONES): Promise<string[]> {
  await sql`CREATE TABLE IF NOT EXISTS migraciones (nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())`.execute(db);
  const aplicadas = new Set(
    (await sql<{ nombre: string }>`SELECT nombre FROM migraciones`.execute(db)).rows.map((r) => r.nombre),
  );
  const archivos = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const nuevas: string[] = [];
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const contenido = await readFile(path.join(dir, archivo), 'utf8');
    await db.transaction().execute(async (trx) => {
      await sql.raw(contenido).execute(trx);
      await sql`INSERT INTO migraciones (nombre) VALUES (${archivo})`.execute(trx);
    });
    nuevas.push(archivo);
  }
  await activarRls(db);
  return nuevas;
}

/**
 * Supabase publica el esquema public por su API REST con una llave pública. Con RLS activo y sin
 * políticas, esa API no ve ninguna fila; el servidor no se ve afectado porque es el dueño de las
 * tablas. Se aplica a todas las tablas, también a las que agreguen migraciones futuras.
 */
async function activarRls(db: Db): Promise<void> {
  const tablas = await sql<{ tabla: string }>`
    SELECT c.relname AS tabla FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity AND pg_get_userbyid(c.relowner) = current_user`.execute(db);
  for (const { tabla } of tablas.rows) await sql`ALTER TABLE ${sql.table(tabla)} ENABLE ROW LEVEL SECURITY`.execute(db);
}
