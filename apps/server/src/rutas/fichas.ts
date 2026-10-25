import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  asignacionesEnRama,
  CODIGOS_ERROR,
  permisosEfectivos,
  puede,
  type ConflictoEdicion,
  type FichaDTO,
  type SnapshotRama,
} from '@scouttracker/shared';
import { sesionDe, type Dependencias } from '../app';
import { conflicto, sinPermiso, validacion } from '../errores';
import { calcularContextos, exigir, exigirAdminGrupo, type Sesion } from '../servicios/acceso';
import { esquemaCuotas, esquemaDatosFicha, guardarFicha, traducirErrorUnico } from '../servicios/edicion';
import {
  camposPropiosDeRama,
  cargarFicha,
  cargarRama,
  configRama,
  documentosDeFichas,
  historialDeFicha,
  objetivoFicha,
  serializarFicha,
} from '../servicios/fichas';
import { suprimirFicha } from '../servicios/privacidad';
import { compararNombres } from '@scouttracker/shared';
import type { Db, FilaFicha } from '../db';

const pRama = z.object({ ramaId: z.string().uuid() });
const pFicha = z.object({ fichaId: z.string().uuid() });

const esquemaPedido = z.object({
  datos: esquemaDatosFicha.prefault({}),
  cuotas: esquemaCuotas.optional(),
  camposPropios: z.record(z.string(), z.unknown()).optional(),
  reemplazarCordi: z.boolean().optional(),
});

/** El usuario tiene alguna asignación que le da acceso a la rama (RF-021). */
async function exigirAccesoRama(db: Db, s: Sesion, grupoId: string, ramaId: string) {
  const equipos = await db.selectFrom('equipos').select('id').where('rama_id', '=', ramaId).execute();
  const asigs = asignacionesEnRama(s.asignaciones, grupoId, ramaId, new Set(equipos.map((e) => e.id)));
  if (asigs.length === 0) throw sinPermiso('No tenés acceso a esta rama');
  return asigs;
}

async function fichaParaUsuario(deps: Dependencias, s: Sesion, f: FilaFicha): Promise<FichaDTO> {
  const docs = await documentosDeFichas(deps.db, [f.id]);
  return serializarFicha(s, f, docs.get(f.id), await camposPropiosDeRama(deps.db, f.rama_id));
}

/** Padrón: nómina, alta, edición, historial, baja, reactivación, pase y supresión (RF-022 a RF-039, RF-054, RF-118). */
export async function rutasFichas(app: FastifyInstance, deps: Dependencias) {
  // RF-054: todo lo que la app necesita para mostrar la rama sin conexión. Solo incluye
  // las fichas que el usuario puede ver, sin los campos sensibles si no tiene el permiso.
  app.get('/ramas/:ramaId/snapshot', async (req): Promise<SnapshotRama> => {
    const s = sesionDe(req);
    const { ramaId } = pRama.parse(req.params);
    const rama = await cargarRama(deps.db, ramaId);
    const asigs = await exigirAccesoRama(deps.db, s, rama.grupo_id, rama.id);
    const contexto = (await calcularContextos(deps.db, s)).find((c) => c.ramaId === rama.id) ?? {
      grupoId: rama.grupo_id,
      grupoNombre: '',
      ramaId: rama.id,
      ramaNombre: rama.nombre,
      comunidad: rama.comunidad,
      soloEquipos: null,
      ...permisosEfectivos(asigs),
    };
    const filas = await deps.db
      .selectFrom('fichas')
      .selectAll()
      .where('rama_id', '=', rama.id)
      .where('estado', 'in', ['activa', 'incompleta'])
      .execute();
    const visibles = filas
      .filter((f) => puede(s.asignaciones, 'padron', 'ver', objetivoFicha(f)))
      .sort((a, b) => compararNombres(a, b));
    const docs = await documentosDeFichas(deps.db, visibles.map((f) => f.id));
    const camposPropios = await camposPropiosDeRama(deps.db, rama.id);
    return {
      generadoEn: deps.ahora().toISOString(),
      contexto,
      rama: await configRama(deps.db, rama),
      fichas: visibles.map((f) => serializarFicha(s, f, docs.get(f.id), camposPropios)),
    };
  });

  // RF-022
  app.post('/ramas/:ramaId/fichas', async (req, reply) => {
    const s = sesionDe(req);
    const { ramaId } = pRama.parse(req.params);
    const pedido = esquemaPedido.parse(req.body);
    const rama = await cargarRama(deps.db, ramaId);
    const camposPropios = await camposPropiosDeRama(deps.db, rama.id);
    const fila = await deps.db
      .transaction()
      .execute((trx) => guardarFicha(trx, s, rama, null, pedido, camposPropios))
      .catch(traducirErrorUnico);
    return reply.status(201).send(await fichaParaUsuario(deps, s, fila));
  });

  app.get('/fichas/:fichaId', async (req): Promise<FichaDTO> => {
    const s = sesionDe(req);
    const { fichaId } = pFicha.parse(req.params);
    const f = await cargarFicha(deps.db, fichaId);
    exigir(s, 'padron', 'ver', objetivoFicha(f));
    return fichaParaUsuario(deps, s, f);
  });

  // RF-024 / RF-025: `version` es la que el usuario abrió. Si otro guardó después, se devuelve
  // el conflicto con los cambios ajenos; para guardar igual se reenvía con `forzar`.
  app.patch('/fichas/:fichaId', async (req) => {
    const s = sesionDe(req);
    const { fichaId } = pFicha.parse(req.params);
    const pedido = esquemaPedido.extend({ version: z.number().int().positive(), forzar: z.boolean().optional() }).parse(req.body);
    const previa = await cargarFicha(deps.db, fichaId);
    exigir(s, 'padron', 'ver', objetivoFicha(previa));
    if (previa.estado !== 'activa' && previa.estado !== 'incompleta') {
      throw validacion('Una ficha archivada no se puede editar. Reactivala primero.');
    }
    const camposPropios = await camposPropiosDeRama(deps.db, previa.rama_id);
    const fila = await deps.db
      .transaction()
      .execute(async (trx) => {
        const actual = await trx.selectFrom('fichas').selectAll().where('id', '=', fichaId).forUpdate().executeTakeFirstOrThrow();
        if (actual.version !== pedido.version && !pedido.forzar) {
          const cambios = await historialDeFicha(deps.db, s, actual, pedido.version);
          const error: Omit<ConflictoEdicion, 'mensaje' | 'codigo'> = { versionActual: actual.version, cambios };
          throw conflicto(CODIGOS_ERROR.conflictoEdicion, 'Otra persona modificó esta ficha mientras la editabas', error as never);
        }
        return guardarFicha(trx, s, { id: actual.rama_id, grupo_id: actual.grupo_id }, actual, pedido, camposPropios);
      })
      .catch(traducirErrorUnico);
    return fichaParaUsuario(deps, s, fila);
  });

  // RF-026
  app.get('/fichas/:fichaId/historial', async (req) => {
    const s = sesionDe(req);
    const { fichaId } = pFicha.parse(req.params);
    const f = await cargarFicha(deps.db, fichaId);
    exigir(s, 'padron', 'ver', objetivoFicha(f));
    return historialDeFicha(deps.db, s, f);
  });

  // RF-027: la baja archiva sin borrar. Pierde la función de cordi.
  app.post('/fichas/:fichaId/archivar', async (req) => {
    const s = sesionDe(req);
    const { fichaId } = pFicha.parse(req.params);
    const f = await cargarFicha(deps.db, fichaId);
    exigir(s, 'padron', 'eliminar', objetivoFicha(f), 'No tenés permiso para dar de baja fichas');
    if (f.estado !== 'activa' && f.estado !== 'incompleta') throw validacion('La ficha ya está dada de baja');
    const fila = await deps.db.transaction().execute(async (trx) => {
      const fila = await trx
        .updateTable('fichas')
        .set({ estado: 'archivada', archivada_en: deps.ahora(), cordi: null, version: f.version + 1, actualizado_en: new Date() })
        .where('id', '=', f.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('historial')
        .values({ grupo_id: f.grupo_id, ficha_id: f.id, usuario_id: s.usuarioId, campo: '_archivo', valor_anterior: f.estado, valor_nuevo: 'archivada', version: fila.version })
        .execute();
      return fila;
    });
    return fichaParaUsuario(deps, s, fila);
  });

  app.post('/fichas/:fichaId/reactivar', async (req) => {
    const s = sesionDe(req);
    const { fichaId } = pFicha.parse(req.params);
    const f = await cargarFicha(deps.db, fichaId);
    exigir(s, 'padron', 'crear', objetivoFicha(f), 'No tenés permiso para reactivar fichas');
    if (f.estado !== 'archivada') throw validacion('Solo se puede reactivar una ficha archivada');
    // Si el equipo se desactivó mientras estaba archivada, vuelve sin equipo.
    const equipo = f.equipo_id
      ? await deps.db.selectFrom('equipos').select('activo').where('id', '=', f.equipo_id).executeTakeFirst()
      : undefined;
    const completa = !!(f.apellido && f.nombre && f.dni && f.fecha_nacimiento && (f.tel_emergencia_1 || f.tel_emergencia_2));
    const fila = await deps.db.transaction().execute(async (trx) => {
      const fila = await trx
        .updateTable('fichas')
        .set({
          estado: completa ? 'activa' : 'incompleta',
          archivada_en: null,
          equipo_id: equipo?.activo ? f.equipo_id : null,
          version: f.version + 1,
          actualizado_en: new Date(),
        })
        .where('id', '=', f.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('historial')
        .values({ grupo_id: f.grupo_id, ficha_id: f.id, usuario_id: s.usuarioId, campo: '_reactivacion', valor_anterior: 'archivada', valor_nuevo: fila.estado, version: fila.version })
        .execute();
      return fila;
    });
    return fichaParaUsuario(deps, s, fila);
  });

  // Listado de ex integrantes (RF-027).
  app.get('/ramas/:ramaId/archivadas', async (req): Promise<FichaDTO[]> => {
    const s = sesionDe(req);
    const { ramaId } = pRama.parse(req.params);
    const rama = await cargarRama(deps.db, ramaId);
    await exigirAccesoRama(deps.db, s, rama.grupo_id, rama.id);
    const filas = await deps.db
      .selectFrom('fichas')
      .selectAll()
      .where('rama_id', '=', rama.id)
      .where('estado', '=', 'archivada')
      .orderBy('archivada_en', 'desc')
      .execute();
    const camposPropios = await camposPropiosDeRama(deps.db, rama.id);
    return filas
      .filter((f) => puede(s.asignaciones, 'padron', 'ver', objetivoFicha(f)))
      .map((f) => serializarFicha(s, f, undefined, camposPropios));
  });

  // RF-028: el pase conserva el historial. Los valores de catálogo se buscan por nombre en la
  // rama de destino (los catálogos son por rama); el equipo y la función de cordi se pierden.
  app.post('/fichas/:fichaId/pase', async (req) => {
    const s = sesionDe(req);
    const { fichaId } = pFicha.parse(req.params);
    const { ramaId } = z.object({ ramaId: z.string().uuid() }).parse(req.body);
    const f = await cargarFicha(deps.db, fichaId);
    if (f.estado !== 'activa' && f.estado !== 'incompleta') throw validacion('Solo se puede pasar de rama una ficha activa');
    if (ramaId === f.rama_id) throw validacion('La ficha ya está en esa rama');
    const destino = await cargarRama(deps.db, ramaId);
    if (destino.grupo_id !== f.grupo_id) {
      throw validacion('El pase entre grupos se hace archivando la ficha y creando una nueva en el otro grupo');
    }
    exigir(s, 'padron', 'editar', objetivoFicha(f));
    exigir(s, 'padron', 'crear', { grupoId: destino.grupo_id, ramaId: destino.id, equipoId: null }, 'No tenés permiso para crear fichas en la rama de destino');
    const fila = await deps.db.transaction().execute(async (trx) => {
      const origen = await trx.selectFrom('ramas').select('nombre').where('id', '=', f.rama_id).executeTakeFirstOrThrow();
      const valoresOrigen = await trx.selectFrom('catalogo_valores').select(['id', 'catalogo', 'nombre']).where('rama_id', '=', f.rama_id).execute();
      const valoresDestino = await trx
        .selectFrom('catalogo_valores')
        .select(['id', 'catalogo', 'nombre'])
        .where('rama_id', '=', destino.id)
        .where('activo', '=', true)
        .execute();
      const mapear = (id: string | null) => {
        if (!id) return null;
        const v = valoresOrigen.find((x) => x.id === id);
        return v ? (valoresDestino.find((x) => x.catalogo === v.catalogo && x.nombre.toLowerCase() === v.nombre.toLowerCase())?.id ?? null) : null;
      };
      const fila = await trx
        .updateTable('fichas')
        .set({
          rama_id: destino.id,
          equipo_id: null,
          cordi: null,
          religion_id: mapear(f.religion_id),
          categoria_miembro_id: mapear(f.categoria_miembro_id),
          promesa_id: mapear(f.promesa_id),
          etapa_id: mapear(f.etapa_id),
          elemento_id: mapear(f.elemento_id),
          raid_id: mapear(f.raid_id),
          guardian_id: mapear(f.guardian_id),
          ingreso_movimiento_id: mapear(f.ingreso_movimiento_id),
          version: f.version + 1,
          actualizado_en: new Date(),
        })
        .where('id', '=', f.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('historial')
        .values({ grupo_id: f.grupo_id, ficha_id: f.id, usuario_id: s.usuarioId, campo: '_pase', valor_anterior: origen.nombre, valor_nuevo: destino.nombre, version: fila.version })
        .execute();
      return fila;
    });
    return fichaParaUsuario(deps, s, fila);
  });

  // RF-118: supresión definitiva, solo el admin de grupo y con confirmación explícita.
  app.delete('/fichas/:fichaId', async (req) => {
    const s = sesionDe(req);
    const { fichaId } = pFicha.parse(req.params);
    const { confirmar } = z.object({ confirmar: z.literal(true) }).parse(req.body ?? {});
    const f = await cargarFicha(deps.db, fichaId);
    exigirAdminGrupo(s, f.grupo_id, 'eliminar');
    void confirmar;
    await suprimirFicha(deps, f.id, s.usuarioId);
    return { ok: true };
  });
}
