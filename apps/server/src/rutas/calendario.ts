import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CANALES_AVISO,
  esFechaISO,
  esHora,
  preferenciasCompletas,
  TIPOS_AVISO,
  type AvisoManualDTO,
  type CanalAviso,
  type FeriadoDTO,
  type PreferenciasAvisos,
  type RecordatorioDTO,
} from '@scouttracker/shared';
import { sesionDe, type Dependencias } from '../app';
import type { Db } from '../db';
import { conflicto, noEncontrado, sinPermiso } from '../errores';
import { exigirAdminGrupo, type Sesion } from '../servicios/acceso';
import { destinatariosDeGrupo, enviarAviso, validarDestino } from '../servicios/avisos';
import { esquemaDestino } from './actividades';
import { exigirGrupoActivo } from './admin-grupo';

const pGrupo = z.object({ grupoId: z.string().uuid() });
const pId = z.object({ id: z.string().uuid() });
const fecha = z.string().refine(esFechaISO, 'Fecha inválida');
const esUnico = (e: unknown) => (e as { code?: string }).code === '23505';

/** El usuario tiene alguna asignación activa en el grupo. */
function exigirMiembro(s: Sesion, grupoId: string) {
  if (!s.asignaciones.some((a) => a.grupoId === grupoId)) throw sinPermiso();
}

/** RF-075 / RF-076: feriados nacionales y del grupo entre dos fechas. */
export async function feriadosDeGrupo(db: Db, grupoId: string, desde: string, hasta: string): Promise<FeriadoDTO[]> {
  const filas = await db
    .selectFrom('feriados')
    .select(['id', 'grupo_id', 'fecha', 'nombre'])
    .where((eb) => eb.or([eb('grupo_id', 'is', null), eb('grupo_id', '=', grupoId)]))
    .where('fecha', '>=', desde)
    .where('fecha', '<=', hasta)
    .orderBy('fecha')
    .execute();
  return filas.map((f) => ({ id: f.grupo_id ? f.id : null, fecha: f.fecha, nombre: f.nombre, origen: f.grupo_id ? 'manual' : 'nacional' }));
}

/** RF-077: recordatorios del usuario en el grupo entre dos fechas. */
export async function recordatoriosDeUsuario(db: Db, usuarioId: string, grupoId: string, desde: string, hasta: string): Promise<RecordatorioDTO[]> {
  return db
    .selectFrom('recordatorios')
    .select(['id', 'fecha', 'hora', 'titulo'])
    .where('usuario_id', '=', usuarioId)
    .where('grupo_id', '=', grupoId)
    .where('fecha', '>=', desde)
    .where('fecha', '<=', hasta)
    .orderBy('fecha')
    .orderBy('hora')
    .execute();
}

/** Calendario (RF-072 a RF-077) y avisos (RF-080, RF-084, RF-086, RF-087). */
export async function rutasCalendario(app: FastifyInstance, deps: Dependencias) {
  // ---- Feriados
  app.get('/grupos/:grupoId/feriados', async (req): Promise<FeriadoDTO[]> => {
    const s = sesionDe(req);
    const { grupoId } = pGrupo.parse(req.params);
    const { anio } = z.object({ anio: z.coerce.number().int().min(2000).max(2200) }).parse(req.query);
    await exigirGrupoActivo(deps, grupoId);
    exigirMiembro(s, grupoId);
    return feriadosDeGrupo(deps.db, grupoId, `${anio}-01-01`, `${anio}-12-31`);
  });

  // RF-076: por si la fuente pública no está disponible, o para días propios del grupo.
  app.post('/grupos/:grupoId/feriados', async (req, reply) => {
    const s = sesionDe(req);
    const { grupoId } = pGrupo.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(s, grupoId, 'crear');
    const d = z.object({ fecha, nombre: z.string().trim().min(1).max(200) }).parse(req.body);
    try {
      const f = await deps.db.insertInto('feriados').values({ grupo_id: grupoId, fecha: d.fecha, nombre: d.nombre }).returning('id').executeTakeFirstOrThrow();
      return reply.status(201).send({ id: f.id });
    } catch (e) {
      if (esUnico(e)) throw conflicto('FERIADO_REPETIDO', 'Ese feriado ya está cargado');
      throw e;
    }
  });

  app.delete('/feriados/:id', async (req) => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const f = await deps.db.selectFrom('feriados').select('grupo_id').where('id', '=', id).executeTakeFirst();
    // Los nacionales vienen de la fuente pública y no se borran.
    if (!f?.grupo_id) throw noEncontrado('El feriado no existe');
    await exigirGrupoActivo(deps, f.grupo_id);
    exigirAdminGrupo(s, f.grupo_id, 'eliminar');
    await deps.db.deleteFrom('feriados').where('id', '=', id).execute();
    return { ok: true };
  });

  // ---- Recordatorios personales (RF-077): solo los ve quien los crea.
  app.get('/recordatorios', async (req): Promise<RecordatorioDTO[]> => {
    const s = sesionDe(req);
    const q = z.object({ grupoId: z.string().uuid(), desde: fecha, hasta: fecha }).parse(req.query);
    exigirMiembro(s, q.grupoId);
    return recordatoriosDeUsuario(deps.db, s.usuarioId, q.grupoId, q.desde, q.hasta);
  });

  app.post('/recordatorios', async (req, reply): Promise<RecordatorioDTO> => {
    const s = sesionDe(req);
    const d = z
      .object({
        grupoId: z.string().uuid(),
        fecha,
        hora: z.string().refine(esHora, 'Hora inválida').nullish(),
        titulo: z.string().trim().min(1, 'Falta el texto').max(200),
      })
      .parse(req.body);
    await exigirGrupoActivo(deps, d.grupoId);
    exigirMiembro(s, d.grupoId);
    const r = await deps.db
      .insertInto('recordatorios')
      .values({ usuario_id: s.usuarioId, grupo_id: d.grupoId, fecha: d.fecha, hora: d.hora ?? null, titulo: d.titulo })
      .returning(['id', 'fecha', 'hora', 'titulo'])
      .executeTakeFirstOrThrow();
    return reply.status(201).send(r);
  });

  app.delete('/recordatorios/:id', async (req) => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const r = await deps.db.deleteFrom('recordatorios').where('id', '=', id).where('usuario_id', '=', s.usuarioId).executeTakeFirst();
    if (!r.numDeletedRows) throw noEncontrado('El recordatorio no existe');
    return { ok: true };
  });

  // ---- Dispositivos para push (RF-080): atados a la sesión actual.
  app.post('/dispositivos', async (req) => {
    const s = sesionDe(req);
    const d = z.object({ token: z.string().min(10).max(300), plataforma: z.enum(['android', 'ios']) }).parse(req.body);
    await deps.db
      .insertInto('dispositivos')
      .values({ token: d.token, usuario_id: s.usuarioId, sesion_id: s.sesionId, plataforma: d.plataforma })
      .onConflict((oc) => oc.column('token').doUpdateSet({ usuario_id: s.usuarioId, sesion_id: s.sesionId, plataforma: d.plataforma, actualizado_en: deps.ahora() }))
      .execute();
    return { ok: true };
  });

  // ---- Preferencias (RF-084)
  app.get('/yo/avisos', async (req): Promise<PreferenciasAvisos> => {
    const s = sesionDe(req);
    return preferenciasCompletas(await deps.db.selectFrom('preferencias_avisos').select(['tipo', 'canal', 'activo']).where('usuario_id', '=', s.usuarioId).execute());
  });

  app.put('/yo/avisos', async (req): Promise<PreferenciasAvisos> => {
    const s = sesionDe(req);
    const d = z.object({ tipo: z.enum(TIPOS_AVISO), canal: z.enum(CANALES_AVISO), activo: z.boolean() }).parse(req.body);
    await deps.db
      .insertInto('preferencias_avisos')
      .values({ usuario_id: s.usuarioId, tipo: d.tipo, canal: d.canal, activo: d.activo })
      .onConflict((oc) => oc.columns(['usuario_id', 'tipo', 'canal']).doUpdateSet({ activo: d.activo }))
      .execute();
    return preferenciasCompletas(await deps.db.selectFrom('preferencias_avisos').select(['tipo', 'canal', 'activo']).where('usuario_id', '=', s.usuarioId).execute());
  });

  // ---- Avisos manuales (RF-086) e historial (RF-087)
  app.post('/grupos/:grupoId/avisos', async (req, reply): Promise<AvisoManualDTO> => {
    const s = sesionDe(req);
    const { grupoId } = pGrupo.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(s, grupoId, 'crear');
    const d = z
      .object({
        titulo: z.string().trim().min(1, 'Falta el título').max(120),
        texto: z.string().trim().min(1, 'Falta el texto').max(2000),
        destino: esquemaDestino.refine((x) => x.tipo !== 'alcance', 'Elegí a quién va'),
        canales: z.array(z.enum(CANALES_AVISO)).min(1, 'Elegí al menos un canal'),
        importante: z.boolean().default(false),
      })
      .parse(req.body);
    const destinoNombre = await validarDestino(deps.db, grupoId, d.destino);
    const canales = [...new Set(d.canales)] as CanalAviso[];
    const destinatarios = await destinatariosDeGrupo(deps.db, grupoId, d.destino);
    const fila = await deps.db
      .insertInto('avisos_manuales')
      .values({
        grupo_id: grupoId,
        remitente_id: s.usuarioId,
        remitente_nombre: s.nombre,
        destino: JSON.stringify(d.destino),
        destino_nombre: destinoNombre,
        canales,
        importante: d.importante,
        titulo: d.titulo,
        texto: d.texto,
        destinatarios: destinatarios.length,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await enviarAviso(deps, destinatarios, { tipo: 'manuales', titulo: d.titulo, cuerpo: d.texto, importante: d.importante, canales });
    return reply.status(201).send({
      id: fila.id,
      remitente: s.nombre,
      destino: destinoNombre,
      canales,
      importante: d.importante,
      titulo: d.titulo,
      texto: d.texto,
      destinatarios: destinatarios.length,
      creadoEn: deps.ahora().toISOString(),
    });
  });

  app.get('/grupos/:grupoId/avisos', async (req): Promise<AvisoManualDTO[]> => {
    const s = sesionDe(req);
    const { grupoId } = pGrupo.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(s, grupoId, 'ver');
    const filas = await deps.db.selectFrom('avisos_manuales').selectAll().where('grupo_id', '=', grupoId).orderBy('creado_en', 'desc').limit(200).execute();
    return filas.map((f) => ({
      id: f.id,
      remitente: f.remitente_nombre,
      destino: f.destino_nombre,
      canales: f.canales as CanalAviso[],
      importante: f.importante,
      titulo: f.titulo,
      texto: f.texto,
      destinatarios: f.destinatarios,
      creadoEn: f.creado_en.toISOString(),
    }));
  });
}
