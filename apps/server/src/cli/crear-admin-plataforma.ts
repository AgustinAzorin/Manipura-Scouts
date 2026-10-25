/**
 * Crea o promueve al admin de plataforma (Agustin o Mauro). Uso:
 *   DATABASE_URL=... npm run crear-admin -w @scouttracker/server -- "Nombre" mail@ejemplo.com
 * La contraseña se pide por la variable PASSWORD (al menos 10 caracteres).
 */
import { cargarArchivoEnv } from '../config';
import { crearDb } from '../db';
import { migrar } from '../migrar';
import { hashearPassword, LARGO_MINIMO_PASSWORD } from '../servicios/seguridad';

cargarArchivoEnv();

const [nombre, email] = process.argv.slice(2);
const password = process.env.PASSWORD ?? '';
if (!nombre || !email) throw new Error('Uso: crear-admin "Nombre" mail@ejemplo.com (con PASSWORD en el entorno)');
if (password.length < LARGO_MINIMO_PASSWORD) throw new Error(`PASSWORD debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres`);
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL');

const db = crearDb(url);
await migrar(db);
const hash = await hashearPassword(password);
await db
  .insertInto('usuarios')
  .values({ nombre, email: email.toLowerCase(), password_hash: hash, es_admin_plataforma: true })
  .onConflict((oc) => oc.column('email').doUpdateSet({ es_admin_plataforma: true, password_hash: hash }))
  .execute();
console.log(`Admin de plataforma listo: ${email.toLowerCase()}`);
await db.destroy();
