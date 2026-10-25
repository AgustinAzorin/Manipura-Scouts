import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CONFIRMACIONES,
  ESTADOS_AUTORIZACION_ACTIVIDAD,
  esColor,
  esFechaISO,
  puede,
  TIPOS_ARCHIVO_PERMITIDOS,
  type ActividadDTO,
  type RegistroActividad,
  type ResultadoRegistro,
  type TipoActividadDTO,
} from '@scouttracker/shared';
import { sesionDe, type Dependencias } from '../app';
import { conflicto, noEncontrado, sinPermiso, validacion } from '../errores';
import { exigir, exigirAdminGrupo, verSensibles, type Sesion } from '../servicios/acceso';
import {
  actividadesDeRama,
  aplicarRegistros,
  cargarActividad,
  inscribirAlcance,
  objetivoActividad,
  serializarActividades,
  tiposDeGrupo,
} from '../servicios/actividades';
import { auditar } from '../servicios/auditoria';
import { cargarRama, objetivoFicha } from '../servicios/fichas';
import { leerArchivoSubido } from '../servicios/subidas';
import { enlaceArchivo } from './archivos';
import { exigirGrupoActivo } from './admin-grupo';
import { exigirAccesoRama } from './fichas';

const pGrupo = z.object({ grupoId: z.string().uuid() });
const pId = z.object({ id: z.string().uuid() });
const pInscripcion = z.object({ id: z.string().uuid(), fichaId: z.string().uuid() });

const esUnico = (e: unknown) => (e as { code?: string }).code === '23505';

const esquemaTipo = z.object({
  nombre: z.string().trim().min(1).max(100),
  color: z.string().refine(esColor, 'Color inválido'),
  requiereAutorizacion: z.boolean(),
});

const instante = z.string().datetime({ offset: true });

const esquemaDatosActividad = z.object({
  tipoId: z.string().uuid(),
  nombre: z.string().trim().min(1, 'Falta el nombre').max(200),
  inicio: instante,
  fin: instante,
  lugar: z.string().trim().max(300).nullish(),
});

const esquemaRegistro = z.discriminatedUnion('campo', [
  z.object({ campo: z.literal('presente'), valor: z.boolean(), anterior: z.boolean() }),
  z.object({ campo: z.literal('confirmacion'), valor: z.enum(CONFIRMACIONES), anterior: z.enum(CONFIRMACIONES) }),
  z.object({
    campo: z.literal('autorizacion'),
    valor: z.enum(ESTADOS_AUTORIZACION_ACTIVIDAD),
    anterior: z.enum(ESTADOS_AUTORIZACION_ACTIVIDAD),
    fecha: z.string().refine(esFechaISO, 'Fecha inválida').nullish(),
  }),
]);

const esquemaSincronizar = z.object({
  registros: z
    .array(
      z.intersection(
        z.object({ id: z.string().min(1).max(100), actividadId: z.string().uuid(), fichaId: z.string().uuid(), en: instante }),
        esquemaRegistro,
      ),
    )
    .max(1000),
});

/** RF-060: la fecha de fin no puede ser anterior a la de inicio. */
function validarFechas(inicio: string, fin: string) {
  if (new Date(fin).getTime() < new Date(inicio).getTime()) {
    throw validacion('La fecha de fin no puede ser anterior a la de inicio', { fin: 'Tiene que ser posterior al inicio' });
  }
}

/** Actividades, tipos de actividad, inscriptos, asistencia y autorizaciones (RF-057 a RF-071). */
export async function rutasActividades(app: FastifyInstance, deps: Dependencias) {
  async function tipoDelGrupo(grupoId: string, tipoId: string) {
    const t = await deps.db.selectFrom('tipos_actividad').select(['id', 'activo']).where('id', '=', tipoId).where('grupo_id', '=', grupoId).executeTakeFirst();
    if (!t) throw validacion('El tipo de actividad no existe', { tipoId: 'Elegí un tipo' });
    return t;
  }

  async function respuesta(s: Sesion, id: string, ramaId: string | null): Promise<ActividadDTO> {
    const a = await cargarActividad(deps.db, s, id);
    return (await serializarActividades(deps.db, s, [a], { ramaId }))[0]!;
  }

  // ---- Tipos de actividad (RF-063)
  app.get('/grupos/:grupoId/tipos-actividad', async (req): Promise<TipoActividadDTO[]> => {
    const s = sesionDe(req);
    const { grupoId } = pGrupo.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    if (!s.asignaciones.some((a) => a.grupoId === grupoId)) throw sinPermiso();
    return tiposDeGrupo(deps.db, grupoId);
  });

  app.post('/grupos/:grupoId/tipos-actividad', async (req, reply) => {
    const s = sesionDe(req);
    const { grupoId } = pGrupo.parse(req.params);
    await exigirGrupoActivo(deps, grupoId);
    exigirAdminGrupo(s, grupoId, 'crear');
    const d = esquemaTipo.parse(req.body);
    try {
      const t = await deps.db
        .insertInto('tipos_actividad')
        .values({ grupo_id: grupoId, nombre: d.nombre, color: d.color.toUpperCase(), requiere_autorizacion: d.requiereAutorizacion })
        .returning('id')
        .executeTakeFirstOrThrow();
      return reply.status(201).send({ id: t.id });
    } catch (e) {
      if (esUnico(e)) throw conflicto('NOMBRE_REPETIDO', 'Ya hay un tipo de actividad con ese nombre');
      throw e;
    }
  });

  app.patch('/tipos-actividad/:id', async (req) => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const t = await deps.db.selectFrom('tipos_actividad').select('grupo_id').where('id', '=', id).executeTakeFirst();
    if (!t) throw noEncontrado();
    await exigirGrupoActivo(deps, t.grupo_id);
    exigirAdminGrupo(s, t.grupo_id, 'editar');
    const d = esquemaTipo.partial().extend({ activo: z.boolean().optional() }).parse(req.body);
    try {
      await deps.db
        .updateTable('tipos_actividad')
        .set({
          ...(d.nombre !== undefined && { nombre: d.nombre }),
          ...(d.color !== undefined && { color: d.color.toUpperCase() }),
          ...(d.requiereAutorizacion !== undefined && { requiere_autorizacion: d.requiereAutorizacion }),
          ...(d.activo !== undefined && { activo: d.activo }),
        })
        .where('id', '=', id)
        .execute();
    } catch (e) {
      if (esUnico(e)) throw conflicto('NOMBRE_REPETIDO', 'Ya hay un tipo de actividad con ese nombre');
      throw e;
    }
    return { ok: true };
  });

  // ---- Actividades
  // Historial de la rama (RF-070): actividades del año que el usuario puede ver.
  app.get('/ramas/:ramaId/actividades', async (req): Promise<ActividadDTO[]> => {
    const s = sesionDe(req);
    const { ramaId } = z.object({ ramaId: z.string().uuid() }).parse(req.params);
    const { anio } = z.object({ anio: z.coerce.number().int().min(2000).max(2200) }).parse(req.query);
    const rama = await cargarRama(deps.db, ramaId);
    await exigirAccesoRama(deps.db, s, rama.grupo_id, rama.id);
    const filas = await actividadesDeRama(deps.db, s, rama, {
      desde: new Date(`${anio}-01-01T00:00:00-03:00`),
      hasta: new Date(`${anio + 1}-01-01T00:00:00-03:00`),
    });
    return serializarActividades(deps.db, s, filas, { ramaId: rama.id });
  });

  // `ramaId` limita los inscriptos a la rama en la que trabaja el usuario.
  app.get('/actividades/:id', async (req): Promise<ActividadDTO> => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const { ramaId } = z.object({ ramaId: z.string().uuid().optional() }).parse(req.query);
    return respuesta(s, id, ramaId ?? null);
  });

  // RF-060 / RF-064
  app.post('/actividades', async (req, reply) => {
    const s = sesionDe(req);
    const d = esquemaDatosActividad
      .extend({
        grupoId: z.string().uuid(),
        alcance: z.enum(['grupo', 'rama', 'equipo']),
        ramaId: z.string().uuid().nullish(),
        equipoId: z.string().uuid().nullish(),
      })
      .parse(req.body);
    await exigirGrupoActivo(deps, d.grupoId);
    validarFechas(d.inicio, d.fin);
    const tipo = await tipoDelGrupo(d.grupoId, d.tipoId);
    if (!tipo.activo) throw validacion('El tipo de actividad está desactivado', { tipoId: 'Elegí otro tipo' });
    const ramaId = d.alcance === 'grupo' ? null : (d.ramaId ?? null);
    const equipoId = d.alcance === 'equipo' ? (d.equipoId ?? null) : null;
    if (d.alcance !== 'grupo') {
      if (!ramaId) throw validacion('Falta la rama', { ramaId: 'Elegí la rama' });
      const r = await deps.db.selectFrom('ramas').select('id').where('id', '=', ramaId).where('grupo_id', '=', d.grupoId).executeTakeFirst();
      if (!r) throw validacion('La rama no es de este grupo');
    }
    if (d.alcance === 'equipo') {
      if (!equipoId) throw validacion('Falta el equipo', { equipoId: 'Elegí el equipo' });
      const eq = await deps.db.selectFrom('equipos').select('activo').where('id', '=', equipoId).where('rama_id', '=', ramaId!).executeTakeFirst();
      if (!eq) throw validacion('El equipo no es de esta rama');
      if (!eq.activo) throw validacion('El equipo está desactivado');
    }
    exigir(s, 'actividades', 'crear', { grupoId: d.grupoId, ramaId, equipoId }, 'No tenés permiso para crear actividades con ese alcance');
    const a = await deps.db.transaction().execute(async (trx) => {
      const a = await trx
        .insertInto('actividades')
        .values({
          grupo_id: d.grupoId,
          tipo_id: d.tipoId,
          nombre: d.nombre,
          inicio: d.inicio,
          fin: d.fin,
          lugar: d.lugar || null,
          alcance: d.alcance,
          rama_id: ramaId,
          equipo_id: equipoId,
          creado_por: s.usuarioId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await inscribirAlcance(trx, a);
      return a;
    });
    return reply.status(201).send(await respuesta(s, a.id, ramaId));
  });

  // RF-061. El alcance no cambia: para otro alcance se cancela y se crea otra actividad.
  // TODO(RF-085): reprogramar los avisos y avisar el cambio cuando lleguen los avisos.
  app.patch('/actividades/:id', async (req) => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const a = await cargarActividad(deps.db, s, id);
    exigir(s, 'actividades', 'editar', objetivoActividad(a), 'No tenés permiso para editar esta actividad');
    if (a.cancelada_en) throw validacion('La actividad está cancelada');
    const d = esquemaDatosActividad.partial().parse(req.body);
    validarFechas(d.inicio ?? a.inicio.toISOString(), d.fin ?? a.fin.toISOString());
    if (d.tipoId && d.tipoId !== a.tipo_id) {
      const t = await tipoDelGrupo(a.grupo_id, d.tipoId);
      if (!t.activo) throw validacion('El tipo de actividad está desactivado', { tipoId: 'Elegí otro tipo' });
    }
    await deps.db
      .updateTable('actividades')
      .set({
        ...(d.tipoId !== undefined && { tipo_id: d.tipoId }),
        ...(d.nombre !== undefined && { nombre: d.nombre }),
        ...(d.inicio !== undefined && { inicio: d.inicio }),
        ...(d.fin !== undefined && { fin: d.fin }),
        ...(d.lugar !== undefined && { lugar: d.lugar || null }),
        actualizado_en: deps.ahora(),
      })
      .where('id', '=', a.id)
      .execute();
    return { ok: true };
  });

  // RF-062: queda visible como cancelada.
  // TODO(RF-085): anular los avisos pendientes y avisar la cancelación cuando lleguen los avisos.
  app.post('/actividades/:id/cancelar', async (req) => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const a = await cargarActividad(deps.db, s, id);
    exigir(s, 'actividades', 'eliminar', objetivoActividad(a), 'No tenés permiso para cancelar esta actividad');
    if (a.cancelada_en) throw validacion('La actividad ya está cancelada');
    await deps.db.updateTable('actividades').set({ cancelada_en: deps.ahora(), actualizado_en: deps.ahora() }).where('id', '=', a.id).execute();
    return { ok: true };
  });

  // RF-064: agregar o quitar inscriptos. Se puede agregar cualquier protagonista activo del grupo
  // que el usuario vea (por ejemplo, uno de otro equipo invitado a la actividad).
  app.put('/actividades/:id/inscripciones', async (req) => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const a = await cargarActividad(deps.db, s, id);
    exigir(s, 'actividades', 'editar', objetivoActividad(a), 'No tenés permiso para cambiar los inscriptos');
    if (a.cancelada_en) throw validacion('La actividad está cancelada');
    const d = z.object({ agregar: z.array(z.string().uuid()).max(1000).default([]), quitar: z.array(z.string().uuid()).max(1000).default([]) }).parse(req.body);
    const ids = [...new Set([...d.agregar, ...d.quitar])];
    const fichas = ids.length
      ? await deps.db.selectFrom('fichas').select(['id', 'grupo_id', 'rama_id', 'equipo_id', 'estado']).where('id', 'in', ids).execute()
      : [];
    const porId = new Map(fichas.map((f) => [f.id, f]));
    for (const fichaId of ids) {
      const f = porId.get(fichaId);
      if (!f || f.grupo_id !== a.grupo_id || !puede(s.asignaciones, 'padron', 'ver', objetivoFicha(f))) throw validacion('Hay protagonistas que no existen o no podés ver');
      if (d.agregar.includes(fichaId) && f.estado !== 'activa' && f.estado !== 'incompleta') throw validacion('Solo se pueden inscribir fichas activas');
    }
    await deps.db.transaction().execute(async (trx) => {
      if (d.quitar.length) await trx.deleteFrom('inscripciones').where('actividad_id', '=', a.id).where('ficha_id', 'in', d.quitar).execute();
      if (d.agregar.length) {
        await trx
          .insertInto('inscripciones')
          .values(d.agregar.map((fichaId) => ({ actividad_id: a.id, ficha_id: fichaId, grupo_id: a.grupo_id })))
          .onConflict((oc) => oc.doNothing())
          .execute();
      }
    });
    return { ok: true };
  });

  // RF-057: registros de asistencia (RF-058), autorización (RF-059) y confirmación (RF-065).
  // La app manda todo por acá, con o sin conexión previa; reenviar un registro no lo duplica.
  app.post('/sincronizar', async (req): Promise<{ resultados: ResultadoRegistro[] }> => {
    const s = sesionDe(req);
    const { registros } = esquemaSincronizar.parse(req.body);
    return { resultados: await aplicarRegistros(deps.db, s, registros as RegistroActividad[], deps.ahora()) };
  });

  // ---- Archivo de la autorización (RF-059): solo con conexión y con el permiso de datos sensibles.
  async function inscripcionConPermiso(req: Parameters<typeof sesionDe>[0], accion: 'ver' | 'editar') {
    const s = sesionDe(req);
    const { id, fichaId } = pInscripcion.parse(req.params);
    const a = await cargarActividad(deps.db, s, id);
    const i = await deps.db
      .selectFrom('inscripciones as i')
      .innerJoin('fichas as f', 'f.id', 'i.ficha_id')
      .innerJoin('tipos_actividad as t', (j) => j.on('t.id', '=', a.tipo_id))
      .select(['i.autorizacion_archivo_id', 'f.grupo_id', 'f.rama_id', 'f.equipo_id', 't.requiere_autorizacion'])
      .where('i.actividad_id', '=', a.id)
      .where('i.ficha_id', '=', fichaId)
      .executeTakeFirst();
    if (!i) throw noEncontrado('El protagonista no está inscripto en la actividad');
    const o = objetivoFicha(i);
    exigir(s, 'actividades', accion, o);
    if (!verSensibles(s, o)) throw sinPermiso('Las autorizaciones requieren el permiso de datos sensibles');
    if (!i.requiere_autorizacion) throw validacion('Este tipo de actividad no pide autorización');
    return { s, a, fichaId, archivoId: i.autorizacion_archivo_id };
  }

  async function borrarArchivo(archivoId: string) {
    const ar = await deps.db.deleteFrom('archivos').where('id', '=', archivoId).returning('clave').executeTakeFirst();
    if (ar) await deps.almacenamiento.borrar(ar.clave);
  }

  app.post('/actividades/:id/inscripciones/:fichaId/autorizacion/archivo', async (req, reply) => {
    const { a, fichaId, archivoId } = await inscripcionConPermiso(req, 'editar');
    const archivo = await leerArchivoSubido(req, { tiposPermitidos: TIPOS_ARCHIVO_PERMITIDOS });
    const clave = await deps.almacenamiento.guardar(archivo.datos);
    const nuevo = await deps.db
      .insertInto('archivos')
      .values({ grupo_id: a.grupo_id, clave, nombre: archivo.nombre, mime: archivo.mime, tamano: archivo.datos.length })
      .returning('id')
      .executeTakeFirstOrThrow();
    await deps.db.updateTable('inscripciones').set({ autorizacion_archivo_id: nuevo.id }).where('actividad_id', '=', a.id).where('ficha_id', '=', fichaId).execute();
    if (archivoId) await borrarArchivo(archivoId);
    return reply.status(201).send({ nombre: archivo.nombre, mime: archivo.mime, tamano: archivo.datos.length });
  });

  app.delete('/actividades/:id/inscripciones/:fichaId/autorizacion/archivo', async (req) => {
    const { a, fichaId, archivoId } = await inscripcionConPermiso(req, 'editar');
    if (!archivoId) throw noEncontrado('La autorización no tiene archivo');
    await deps.db.updateTable('inscripciones').set({ autorizacion_archivo_id: null }).where('actividad_id', '=', a.id).where('ficha_id', '=', fichaId).execute();
    await borrarArchivo(archivoId);
    return { ok: true };
  });

  // RNF-022 / RNF-044: enlace de 10 minutos y registro de cada apertura.
  app.get('/actividades/:id/inscripciones/:fichaId/autorizacion/enlace', async (req) => {
    const { s, a, fichaId, archivoId } = await inscripcionConPermiso(req, 'ver');
    if (!archivoId) throw noEncontrado('La autorización no tiene archivo');
    await auditar(deps.db, { accion: 'apertura_documento', grupoId: a.grupo_id, usuarioId: s.usuarioId, fichaId, detalle: { tipo: 'autorizacionActividad', actividadId: a.id } });
    return enlaceArchivo(deps, archivoId);
  });
}
