import { crearDb } from '../db';
import { migrar } from '../migrar';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL');
const db = crearDb(url);
const nuevas = await migrar(db);
console.log(nuevas.length ? `Aplicadas: ${nuevas.join(', ')}` : 'La base ya está al día');
await db.destroy();
