import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { TAMANO_MAXIMO_ARCHIVO } from '@scouttracker/shared';
import { ZodError } from 'zod';
import type { Config } from './config';
import type { Db } from './db';
import { ErrorHttp, noAutenticado } from './errores';
import { cargarAsignaciones, type Sesion } from './servicios/acceso';
import type { Almacenamiento } from './servicios/almacenamiento';
import type { FuenteFeriados } from './servicios/feriados';
import type { TransportePush } from './servicios/push';
import { notificarError } from './servicios/monitoreo';
import { Mailer } from './servicios/mailer';
import { hashToken } from './servicios/seguridad';
import { rutasActividades } from './rutas/actividades';
import { rutasAdminGrupo } from './rutas/admin-grupo';
import { rutasCalendario } from './rutas/calendario';
import { rutasAdminRama } from './rutas/admin-rama';
import { rutasArchivos } from './rutas/archivos';
import { rutasAuth } from './rutas/auth';
import { rutasDocumentos } from './rutas/documentos';
import { rutasExportacion } from './rutas/exportacion';
import { rutasFichas } from './rutas/fichas';
import { rutasFichasActividad } from './rutas/fichas-actividad';
import { rutasImportacion } from './rutas/importacion';
import { rutasMonitoreo } from './rutas/monitoreo';
import { rutasPlataforma } from './rutas/plataforma';

export interface Dependencias {
  db: Db;
  mailer: Mailer;
  almacenamiento: Almacenamiento;
  /** RF-080: notificaciones push. */
  push: TransportePush;
  /** RF-075: feriados nacionales. */
  feriados: FuenteFeriados;
  config: Config;
  /** Reloj inyectable para probar vencimientos. */
  ahora: () => Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    sesion: Sesion | null;
  }
}

/** Obtiene la sesión de la petición o corta con 401. */
export function sesionDe(req: FastifyRequest): Sesion {
  if (!req.sesion) throw noAutenticado();
  return req.sesion;
}

async function autenticar(deps: Dependencias, req: FastifyRequest): Promise<Sesion | null> {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  const token = h.slice(7).trim();
  if (!token) return null;
  const fila = await deps.db
    .selectFrom('sesiones as s')
    .innerJoin('usuarios as u', 'u.id', 's.usuario_id')
    .select(['s.id as sesion_id', 's.vence_en', 'u.id', 'u.nombre', 'u.email', 'u.es_admin_plataforma'])
    .where('s.token_hash', '=', hashToken(token))
    .executeTakeFirst();
  if (!fila || fila.vence_en <= deps.ahora()) return null;
  return {
    sesionId: fila.sesion_id,
    usuarioId: fila.id,
    nombre: fila.nombre,
    email: fila.email,
    esAdminPlataforma: fila.es_admin_plataforma,
    asignaciones: await cargarAsignaciones(deps.db, fila.id),
  };
}

export async function construirApp(deps: Dependencias): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: 'info', redact: ['req.headers.authorization'] },
    bodyLimit: 1024 * 1024,
    trustProxy: true,
  });

  if (deps.config.origenesCors.length > 0) {
    await app.register(cors, { origin: deps.config.origenesCors, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  }
  await app.register(formbody);
  await app.register(multipart, { limits: { fileSize: TAMANO_MAXIMO_ARCHIVO, files: 1 } });

  app.decorateRequest('sesion', null);
  app.addHook('onRequest', async (req) => {
    req.sesion = await autenticar(deps, req);
  });

  app.setErrorHandler(async (error: unknown, req: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ErrorHttp) {
      return reply.status(error.estado).send({ codigo: error.codigo, mensaje: error.message, ...error.extra });
    }
    if (error instanceof ZodError) {
      const campos: Record<string, string> = {};
      for (const i of error.issues) campos[i.path.join('.') || '_'] = i.message;
      return reply.status(400).send({ codigo: 'VALIDACION', mensaje: 'Datos inválidos', campos });
    }
    const e = error as { statusCode?: number; code?: string; message?: string };
    if (e.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.status(413).send({ codigo: 'ARCHIVO_GRANDE', mensaje: 'El archivo supera el límite de 10 MB' });
    }
    if (e.statusCode && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ codigo: e.code ?? 'ERROR', mensaje: e.message ?? 'Error' });
    }
    req.log.error(error);
    await notificarError(deps, error, `${req.method} ${req.routeOptions.url ?? req.url}`).catch(() => {});
    return reply.status(500).send({ codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' });
  });

  app.get('/salud', async () => ({ ok: true }));

  await app.register(async (r) => rutasAuth(r, deps));
  await app.register(async (r) => rutasPlataforma(r, deps));
  await app.register(async (r) => rutasAdminGrupo(r, deps));
  await app.register(async (r) => rutasAdminRama(r, deps));
  await app.register(async (r) => rutasFichas(r, deps));
  await app.register(async (r) => rutasDocumentos(r, deps));
  await app.register(async (r) => rutasImportacion(r, deps));
  await app.register(async (r) => rutasArchivos(r, deps));
  await app.register(async (r) => rutasActividades(r, deps));
  await app.register(async (r) => rutasCalendario(r, deps));
  await app.register(async (r) => rutasFichasActividad(r, deps));
  await app.register(async (r) => rutasExportacion(r, deps));
  await app.register(async (r) => rutasMonitoreo(r, deps));

  return app;
}
