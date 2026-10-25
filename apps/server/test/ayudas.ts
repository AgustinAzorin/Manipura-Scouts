import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { sql } from 'kysely';
import { construirApp, type Dependencias } from '../src/app';
import type { Config } from '../src/config';
import { crearDb, type Db } from '../src/db';
import { migrar } from '../src/migrar';
import { AlmacenamientoMemoria } from '../src/servicios/almacenamiento';
import { FuenteFeriadosMemoria } from '../src/servicios/feriados';
import { Mailer, TransporteMemoria } from '../src/servicios/mailer';
import { TransportePushMemoria } from '../src/servicios/push';
import { hashearPassword } from '../src/servicios/seguridad';

export const URL_DB_PRUEBA = process.env.TEST_DATABASE_URL ?? 'postgres://scout:scout@localhost:5432/scouttracker_test';

export interface Entorno {
  app: FastifyInstance;
  db: Db;
  deps: Dependencias;
  mails: TransporteMemoria;
  almacenamiento: AlmacenamientoMemoria;
  push: TransportePushMemoria;
  feriados: FuenteFeriadosMemoria;
  reloj: { ahora: Date };
  cerrar(): Promise<void>;
}

/** Base limpia y app con mails y archivos en memoria y un reloj controlable. */
export async function crearEntorno(): Promise<Entorno> {
  const db = crearDb(URL_DB_PRUEBA);
  await sql`DROP SCHEMA public CASCADE`.execute(db);
  await sql`CREATE SCHEMA public`.execute(db);
  await migrar(db);
  const mails = new TransporteMemoria();
  const almacenamiento = new AlmacenamientoMemoria();
  const reloj = { ahora: new Date('2026-10-24T15:00:00Z') };
  const config: Config = {
    puerto: 0,
    databaseUrl: URL_DB_PRUEBA,
    urlPublica: 'https://scout.test',
    secretoEnlaces: 'secreto-de-prueba',
    dirAlmacenamiento: '/nada',
    resendApiKey: null,
    mailRemitente: 'prueba@scout.test',
    mailResponsableTecnico: 'agustin@scout.test',
    origenesCors: [],
  };
  const push = new TransportePushMemoria();
  const feriados = new FuenteFeriadosMemoria();
  const deps: Dependencias = { db, config, mailer: new Mailer(db, mails, () => reloj.ahora), almacenamiento, push, feriados, ahora: () => reloj.ahora };
  const app = await construirApp(deps);
  return {
    app,
    db,
    deps,
    mails,
    almacenamiento,
    push,
    feriados,
    reloj,
    async cerrar() {
      await app.close();
      await db.destroy();
    },
  };
}

export class Cliente {
  constructor(
    private readonly app: FastifyInstance,
    public token: string | null = null,
  ) {}

  async pedir(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<LightMyRequestResponse> {
    return this.app.inject({
      method,
      url,
      headers: this.token ? { authorization: `Bearer ${this.token}` } : {},
      ...(body !== undefined ? { payload: body as object } : {}),
    });
  }
  get = (url: string) => this.pedir('GET', url);
  post = (url: string, body: unknown = {}) => this.pedir('POST', url, body);
  patch = (url: string, body: unknown) => this.pedir('PATCH', url, body);
  put = (url: string, body: unknown) => this.pedir('PUT', url, body);
  delete = (url: string, body?: unknown) => this.pedir('DELETE', url, body);

  async subir(url: string, nombre: string, datos: Buffer, mime = 'application/octet-stream') {
    const limite = '----limite' + Math.random().toString(16).slice(2);
    const cuerpo = Buffer.concat([
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="${nombre}"\r\nContent-Type: ${mime}\r\n\r\n`),
      datos,
      Buffer.from(`\r\n--${limite}--\r\n`),
    ]);
    return this.app.inject({
      method: 'POST',
      url,
      headers: { ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), 'content-type': `multipart/form-data; boundary=${limite}` },
      payload: cuerpo,
    });
  }
}

export const PASSWORD = 'contraseña-segura';

export async function login(app: FastifyInstance, email: string, password = PASSWORD): Promise<Cliente> {
  const r = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  if (r.statusCode !== 200) throw new Error(`Login falló para ${email}: ${r.body}`);
  return new Cliente(app, r.json().token);
}

export async function crearAdminPlataforma(e: Entorno, email = 'agustin@scout.test'): Promise<Cliente> {
  await e.db
    .insertInto('usuarios')
    .values({ nombre: 'Agustin', email, password_hash: await hashearPassword(PASSWORD), es_admin_plataforma: true })
    .execute();
  return login(e.app, email);
}

/** Extrae el token del último mail enviado a esa dirección. */
export function tokenDelMail(e: Entorno, email: string): string {
  const mail = [...e.mails.enviados].reverse().find((m) => m.para === email);
  const m = mail?.texto.match(/token=([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(`No hay mail con token para ${email}`);
  return m[1]!;
}

export async function activar(e: Entorno, email: string, password = PASSWORD): Promise<Cliente> {
  const r = await e.app.inject({ method: 'POST', url: '/auth/activar', payload: { token: tokenDelMail(e, email), password } });
  if (r.statusCode !== 200) throw new Error(`Activación falló: ${r.body}`);
  return login(e.app, email, password);
}

export interface Escenario {
  plataforma: Cliente;
  admin: Cliente;
  grupoId: string;
  caminantes: string;
  unidad: string;
  roles: Record<string, string>;
  equipos: Record<string, string>;
  catalogo: Record<string, string>;
}

/**
 * Grupo "Grupo Scout General Paz" con ramas Caminantes y Unidad, equipos en Caminantes,
 * algunos valores de catálogo y un admin de grupo activo.
 */
export async function escenarioBase(e: Entorno): Promise<Escenario> {
  const plataforma = await crearAdminPlataforma(e);
  const grupoId = (await plataforma.post('/plataforma/grupos', { nombre: 'Grupo Scout General Paz' })).json().id;
  await plataforma.post(`/plataforma/grupos/${grupoId}/admins`, { nombre: 'Mauro', email: 'mauro@scout.test' });
  const admin = await activar(e, 'mauro@scout.test');
  const caminantes = (await admin.post(`/grupos/${grupoId}/ramas`, { nombre: 'Caminantes', comunidad: 'Posta Antártida Argentina' })).json().id;
  const unidad = (await admin.post(`/grupos/${grupoId}/ramas`, { nombre: 'Unidad' })).json().id;
  const roles = Object.fromEntries(((await admin.get(`/grupos/${grupoId}/roles`)).json() as { id: string; nombre: string }[]).map((r) => [r.nombre, r.id]));
  const equipos: Record<string, string> = {};
  for (const n of ['Baden Powell', 'Frida Kahlo', 'Tupac Amaru', 'Lola Mora']) {
    equipos[n] = (await admin.post(`/ramas/${caminantes}/equipos`, { nombre: n })).json().id;
  }
  const catalogo: Record<string, string> = {};
  const valores: [string, string, boolean?][] = [
    ['etapa', 'Ini'],
    ['etapa', 'Descubrimiento'],
    ['elemento', 'Fuego'],
    ['elemento', 'Agua'],
    ['promesa', 's/pañuelo'],
    ['promesa', 'c/promesa caminante'],
    ['raid', '1°R'],
    ['raid', '3°R'],
    ['guardian', 'Fuego'],
    ['guardian', 'Aire'],
    ['guardian', 'Leyenda'],
    ['religion', 'Católica'],
    ['categoriaMiembro', 'Protagonista'],
    ['categoriaMiembro', 'Educador', true],
  ];
  for (const [cat, nombre, esAdulto] of valores) {
    const clave = cat === 'guardian' ? `guardian:${nombre}` : nombre;
    catalogo[clave] = (await admin.post(`/ramas/${caminantes}/catalogos`, { catalogo: cat, nombre, esAdulto })).json().id;
  }
  return { plataforma, admin, grupoId, caminantes, unidad, roles, equipos, catalogo };
}

/** Invita, activa e inicia sesión a un usuario con un rol y alcance. */
export async function usuarioCon(
  e: Entorno,
  esc: Escenario,
  email: string,
  rol: string,
  alcance: { alcance: 'grupo' | 'rama' | 'equipo'; ramaId?: string; equipoId?: string },
): Promise<Cliente> {
  const r = await esc.admin.post(`/grupos/${esc.grupoId}/usuarios`, { nombre: email.split('@')[0], email, rolId: esc.roles[rol], ...alcance });
  if (r.statusCode !== 201) throw new Error(`Invitación falló: ${r.body}`);
  return activar(e, email);
}

export const fichaValida = (extra: Record<string, unknown> = {}) => ({
  datos: {
    apellido: 'Pérez',
    nombre: 'Ana',
    dni: '50.890.337',
    fechaNacimiento: '2010-05-10',
    telEmergencia1: '11 5925-4075',
    ...extra,
  },
});
