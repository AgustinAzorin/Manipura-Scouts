/**
 * Carga datos FICTICIOS para probar la app (sección 4 del SRS: nunca datos reales en pruebas).
 * Uso: DATABASE_URL=... npm run demo -w @scouttracker/server
 * Crea un grupo de demostración con dos ramas, equipos, catálogos, 30 fichas y tres usuarios.
 * Se puede correr más de una vez: si el grupo de demostración ya existe, no hace nada.
 */
import { calcularEdad, hoyAR, sumarDias } from '@scouttracker/shared';
import { cargarArchivoEnv } from '../config';
import { crearDb, json } from '../db';
import { migrar } from '../migrar';
import { crearGrupo, rolAdminGrupo } from '../servicios/grupos';
import { hashearPassword } from '../servicios/seguridad';

cargarArchivoEnv();

if (process.env.NODE_ENV === 'production') throw new Error('No se cargan datos de demostración en producción');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL');

const NOMBRE_GRUPO = 'Grupo Scout Demo';
const PASSWORD = 'demo-scouttracker';

const db = crearDb(url);
await migrar(db);

if (await db.selectFrom('grupos').select('id').where('nombre', '=', NOMBRE_GRUPO).executeTakeFirst()) {
  console.log(`"${NOMBRE_GRUPO}" ya existe. Para empezar de cero borrá la base y volvé a correr el script.`);
  await db.destroy();
  process.exit(0);
}

const grupoId = await crearGrupo(db, NOMBRE_GRUPO);
const roles = Object.fromEntries((await db.selectFrom('roles').select(['id', 'nombre']).where('grupo_id', '=', grupoId).execute()).map((r) => [r.nombre, r.id]));
const hash = await hashearPassword(PASSWORD);

async function usuario(nombre: string, email: string, esAdminPlataforma = false) {
  const u = await db
    .insertInto('usuarios')
    .values({ nombre, email, password_hash: hash, es_admin_plataforma: esAdminPlataforma })
    .onConflict((oc) => oc.column('email').doUpdateSet({ password_hash: hash }))
    .returning('id')
    .executeTakeFirstOrThrow();
  await db.insertInto('miembros').values({ usuario_id: u.id, grupo_id: grupoId }).onConflict((oc) => oc.doNothing()).execute();
  return u.id;
}

const caminantes = (await db.insertInto('ramas').values({ grupo_id: grupoId, nombre: 'Caminantes', comunidad: 'Comunidad Demo' }).returning('id').executeTakeFirstOrThrow()).id;
const unidad = (await db.insertInto('ramas').values({ grupo_id: grupoId, nombre: 'Unidad', comunidad: null }).returning('id').executeTakeFirstOrThrow()).id;

const equipos: string[] = [];
for (const nombre of ['Cóndor', 'Yaguareté', 'Ñandú', 'Huemul']) {
  equipos.push((await db.insertInto('equipos').values({ grupo_id: grupoId, rama_id: caminantes, nombre }).returning('id').executeTakeFirstOrThrow()).id);
}
await db.insertInto('equipos').values({ grupo_id: grupoId, rama_id: unidad, nombre: 'Patrulla Demo' }).execute();

const valores: Record<string, string[]> = {
  etapa: ['Ini', 'Descubrimiento', 'Desafío'],
  elemento: ['Fuego', 'Tierra', 'Agua', 'Aire'],
  promesa: ['s/pañuelo', 'c/pañuelo - s/promesa caminante', 'c/promesa caminante'],
  raid: ['1°R', '2°R', '3°R'],
  guardian: ['Fuego', 'Aire', 'Leyenda'],
  categoriaMiembro: ['Protagonista', 'Educador', 'Colaborador'],
  religion: ['Católica', 'Evangélica', 'Ninguna'],
};
const ids: Record<string, string[]> = {};
for (const [catalogo, nombres] of Object.entries(valores)) {
  ids[catalogo] = [];
  for (const [i, nombre] of nombres.entries()) {
    const v = await db
      .insertInto('catalogo_valores')
      .values({ grupo_id: grupoId, rama_id: caminantes, catalogo, nombre, orden: i + 1, es_adulto: catalogo === 'categoriaMiembro' && nombre !== 'Protagonista' })
      .returning('id')
      .executeTakeFirstOrThrow();
    ids[catalogo]!.push(v.id);
  }
}

const APELLIDOS = ['Acosta', 'Benítez', 'Castro', 'Domínguez', 'Escobar', 'Fernández', 'Giménez', 'Herrera', 'Ibáñez', 'Juárez', 'Ledesma', 'Medina', 'Navarro', 'Ojeda', 'Paz', 'Quiroga', 'Ríos', 'Sosa', 'Torres', 'Urquiza', 'Vera', 'Zalazar', 'Aguirre', 'Bustos', 'Cabrera', 'Díaz', 'Funes', 'Godoy', 'Luna', 'Molina'];
const NOMBRES = ['Lucía', 'Mateo', 'Sofía', 'Benjamín', 'Valentina', 'Tomás', 'Camila', 'Joaquín', 'Martina', 'Santiago', 'Julieta', 'Lautaro', 'Agustina', 'Facundo', 'Milagros', 'Thiago', 'Abril', 'Bautista', 'Catalina', 'Ignacio', 'Delfina', 'Franco', 'Emilia', 'Nicolás', 'Malena', 'Felipe', 'Renata', 'Gael', 'Pilar', 'Bruno'];
const hoy = hoyAR();
const elegir = <T,>(lista: T[], i: number) => lista[i % lista.length]!;
const cordis = new Set<string>();

for (let i = 0; i < 30; i++) {
  // Edades ficticias entre 15 y 19 años.
  const nacimiento = sumarDias(hoy, -Math.round((15 + (i * 37) % 48 / 10) * 365.25));
  const edad = calcularEdad(nacimiento, hoy);
  const equipo = i % 9 === 8 ? null : elegir(equipos, i);
  let cordi: 'coordinador' | 'subcoordinador' | null = null;
  if (equipo && !cordis.has(`${equipo}c`)) (cordi = 'coordinador'), cordis.add(`${equipo}c`);
  else if (equipo && !cordis.has(`${equipo}s`)) (cordi = 'subcoordinador'), cordis.add(`${equipo}s`);
  const incompleta = i === 7 || i === 19;
  const meses = ['abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const cuotas = Object.fromEntries([...meses.map((m, k) => [m, k <= i % 9 ? 'pagada' : 'adeudada']), ['distrito', i % 4 ? 'pagada' : 'exenta'], ['afiliacion', 'pagada']]);
  const ficha = await db
    .insertInto('fichas')
    .values({
      grupo_id: grupoId,
      rama_id: caminantes,
      equipo_id: equipo,
      estado: incompleta ? 'incompleta' : 'activa',
      incompleta_motivos: incompleta ? ['Falta Teléfono de emergencia'] : [],
      apellido: APELLIDOS[i]!,
      nombre: NOMBRES[i]!,
      // DNI ficticios en un rango que no se usa.
      dni: String(90000000 + i * 7919),
      fecha_nacimiento: nacimiento,
      religion_id: elegir(ids.religion!, i),
      categoria_miembro_id: ids.categoriaMiembro![0]!,
      tel_emergencia_1: incompleta ? null : `1100${String(100000 + i * 1234).slice(0, 6)}`,
      tel_emergencia_2: i % 3 ? `1199${String(200000 + i * 4321).slice(0, 6)}` : null,
      promesa_id: elegir(ids.promesa!, i),
      etapa_id: elegir(ids.etapa!, i),
      elemento_id: elegir(ids.elemento!, i),
      raid_id: i % 2 ? elegir(ids.raid!, i) : null,
      cordi,
      guardian_id: i % 5 === 0 ? elegir(ids.guardian!, i) : null,
      tiene_tada: edad >= 16 && i % 3 === 0,
      cuotas: json(cuotas),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await db.insertInto('historial').values({ grupo_id: grupoId, ficha_id: ficha.id, usuario_id: null, campo: '_alta', valor_anterior: null, valor_nuevo: null, version: 1 }).execute();
}

const admin = await usuario('Admin Demo', 'admin@demo.ar', true);
await db.insertInto('asignaciones').values({ usuario_id: admin, grupo_id: grupoId, rol_id: await rolAdminGrupo(db, grupoId), alcance: 'grupo', rama_id: null, equipo_id: null }).execute();
const educador = await usuario('Educador Demo', 'educador@demo.ar');
await db.insertInto('asignaciones').values({ usuario_id: educador, grupo_id: grupoId, rol_id: roles['Educador']!, alcance: 'rama', rama_id: caminantes, equipo_id: null }).execute();
const lector = await usuario('Lector Demo', 'lector@demo.ar');
await db.insertInto('asignaciones').values({ usuario_id: lector, grupo_id: grupoId, rol_id: roles['Solo lectura']!, alcance: 'equipo', rama_id: caminantes, equipo_id: equipos[0]! }).execute();

console.log(`Listo: "${NOMBRE_GRUPO}" con 30 fichas ficticias en Caminantes.
Usuarios (contraseña: ${PASSWORD}):
  admin@demo.ar     admin de plataforma y del grupo
  educador@demo.ar  Educador en Caminantes (con datos sensibles)
  lector@demo.ar    Solo lectura en el equipo Cóndor (sin datos sensibles)`);
await db.destroy();
