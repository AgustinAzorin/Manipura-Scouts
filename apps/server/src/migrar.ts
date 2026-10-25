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
  return nuevas;
}
