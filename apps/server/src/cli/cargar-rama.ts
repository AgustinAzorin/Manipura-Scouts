/**
 * Carga los equipos y valores de catálogo de una rama desde un JSON (ver deploy/ramas/).
 * El grupo y la rama se crean antes desde la app. Se puede correr más de una vez.
 * Uso: npm run cargar-rama -w @scouttracker/server -- "Grupo" "Rama" ruta/al/archivo.json
 */
import { readFileSync } from 'node:fs';
import { normalizarTexto } from '@scouttracker/shared';
import { cargarArchivoEnv } from '../config';
import { crearDb } from '../db';
import { cargarConfiguracionRama, esquemaConfiguracionRama } from '../servicios/configuracion-rama';

cargarArchivoEnv();

const [nombreGrupo, nombreRama, archivo] = process.argv.slice(2);
if (!nombreGrupo || !nombreRama || !archivo) throw new Error('Uso: cargar-rama "Grupo" "Rama" archivo.json');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL');
const config = esquemaConfiguracionRama.parse(JSON.parse(readFileSync(archivo, 'utf8')));

const db = crearDb(url);
try {
  const grupos = (await db.selectFrom('grupos').select(['id', 'nombre']).execute()).filter((g) => normalizarTexto(g.nombre) === normalizarTexto(nombreGrupo));
  if (grupos.length !== 1) throw new Error(grupos.length ? `Hay más de un grupo llamado "${nombreGrupo}"` : `No existe el grupo "${nombreGrupo}". Crealo desde la app.`);
  const rama = (await db.selectFrom('ramas').select(['id', 'grupo_id', 'nombre']).where('grupo_id', '=', grupos[0]!.id).execute()).find(
    (r) => normalizarTexto(r.nombre) === normalizarTexto(nombreRama),
  );
  if (!rama) throw new Error(`No existe la rama "${nombreRama}" en "${grupos[0]!.nombre}". Creala desde la app.`);

  const r = await cargarConfiguracionRama(db, rama, config);
  console.log(`Rama "${rama.nombre}" de "${grupos[0]!.nombre}":`);
  console.log(`  Equipos creados: ${r.equiposCreados.length ? r.equiposCreados.join(', ') : 'ninguno'}`);
  console.log(`  Valores de catálogo creados: ${r.valoresCreados.length}`);
  for (const v of r.valoresCreados) console.log(`    ${v}`);
  console.log(`  Ya existían (sin cambios): ${r.yaExistian}`);
} finally {
  await db.destroy();
}
