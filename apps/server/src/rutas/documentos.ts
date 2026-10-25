import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEF_DOCUMENTO, TIPOS_ARCHIVO_PERMITIDOS, TIPOS_DOCUMENTO, validarDocumento } from '@scouttracker/shared';
import { sesionDe, type Dependencias } from '../app';
import { noEncontrado, sinPermiso, validacion } from '../errores';
import { exigir, verSensibles, type Sesion } from '../servicios/acceso';
import { auditar } from '../servicios/auditoria';
import { reevaluarIncompleta } from '../servicios/edicion';
import { cargarFicha, objetivoFicha, valorDocumentoLegible } from '../servicios/fichas';
import { leerArchivoSubido } from '../servicios/subidas';
import { enlaceArchivo } from './archivos';
import type { FilaFicha } from '../db';

const pDoc = z.object({ fichaId: z.string().uuid(), tipo: z.enum(TIPOS_DOCUMENTO) });

/** Documentos de la ficha (RF-040 a RF-042, RNF-022, RNF-023, RNF-044). */
export async function rutasDocumentos(app: FastifyInstance, deps: Dependencias) {
  async function preparar(req: Parameters<typeof sesionDe>[0], accion: 'ver' | 'editar') {
    const s = sesionDe(req);
    const { fichaId, tipo } = pDoc.parse(req.params);
    const f = await cargarFicha(deps.db, fichaId);
    const o = objetivoFicha(f);
    exigir(s, 'documentos', accion, o, accion === 'ver' ? 'No tenés permiso para ver documentos' : 'No tenés permiso para editar documentos');
    const def = DEF_DOCUMENTO[tipo];
    if (def.sensible && !verSensibles(s, o)) throw sinPermiso('Este documento requiere el permiso de datos sensibles');
    if (accion === 'editar' && f.estado !== 'activa' && f.estado !== 'incompleta') throw validacion('La ficha está dada de baja');
    return { s, f, tipo, def };
  }

  async function registrar(s: Sesion, f: FilaFicha, campo: string, anterior: string | null, nuevo: string | null) {
    await deps.db
      .insertInto('historial')
      .values({ grupo_id: f.grupo_id, ficha_id: f.id, usuario_id: s.usuarioId, campo, valor_anterior: anterior, valor_nuevo: nuevo, version: f.version })
      .execute();
  }

  // RF-040: estado y fecha de entrega (RN-06).
  app.put('/fichas/:fichaId/documentos/:tipo', async (req) => {
    const { s, f, tipo } = await preparar(req, 'editar');
    const d = z.object({ estado: z.string(), fechaEntrega: z.string().nullish() }).parse(req.body);
    const fecha = d.estado === 'noPresentado' ? null : (d.fechaEntrega ?? null);
    const error = validarDocumento(tipo, d.estado, fecha);
    if (error) throw validacion(error, { [d.estado === 'noPresentado' || !error.includes('fecha') ? 'estado' : 'fechaEntrega']: error });
    const previo = await deps.db.selectFrom('documentos').select(['estado', 'fecha_entrega']).where('ficha_id', '=', f.id).where('tipo', '=', tipo).executeTakeFirst();
    await deps.db
      .insertInto('documentos')
      .values({ grupo_id: f.grupo_id, ficha_id: f.id, tipo, estado: d.estado, fecha_entrega: fecha })
      .onConflict((oc) => oc.columns(['ficha_id', 'tipo']).doUpdateSet({ estado: d.estado, fecha_entrega: fecha, actualizado_en: new Date() }))
      .execute();
    const anterior = valorDocumentoLegible(previo?.estado ?? 'noPresentado', previo?.fecha_entrega ?? null);
    const nuevo = valorDocumentoLegible(d.estado, fecha);
    if (anterior !== nuevo) await registrar(s, f, `doc.${tipo}`, anterior, nuevo);
    await reevaluarIncompleta(deps.db, f.id, DEF_DOCUMENTO[tipo].nombre);
    return { ok: true };
  });

  // RF-041 / RF-042: un archivo por documento; el nuevo reemplaza y borra al anterior (RN-07).
  app.post('/fichas/:fichaId/documentos/:tipo/archivo', async (req, reply) => {
    const { s, f, tipo } = await preparar(req, 'editar');
    const archivo = await leerArchivoSubido(req, { tiposPermitidos: TIPOS_ARCHIVO_PERMITIDOS });
    const clave = await deps.almacenamiento.guardar(archivo.datos);
    const nuevo = await deps.db
      .insertInto('archivos')
      .values({ grupo_id: f.grupo_id, clave, nombre: archivo.nombre, mime: archivo.mime, tamano: archivo.datos.length })
      .returning('id')
      .executeTakeFirstOrThrow();
    const previo = await deps.db
      .selectFrom('documentos as d')
      .leftJoin('archivos as a', 'a.id', 'd.archivo_id')
      .select(['d.archivo_id', 'a.clave', 'a.nombre'])
      .where('d.ficha_id', '=', f.id)
      .where('d.tipo', '=', tipo)
      .executeTakeFirst();
    await deps.db
      .insertInto('documentos')
      .values({ grupo_id: f.grupo_id, ficha_id: f.id, tipo, estado: 'noPresentado', archivo_id: nuevo.id })
      .onConflict((oc) => oc.columns(['ficha_id', 'tipo']).doUpdateSet({ archivo_id: nuevo.id, actualizado_en: new Date() }))
      .execute();
    if (previo?.archivo_id && previo.clave) {
      await deps.db.deleteFrom('archivos').where('id', '=', previo.archivo_id).execute();
      await deps.almacenamiento.borrar(previo.clave);
    }
    await registrar(s, f, `archivo.${tipo}`, previo?.nombre ?? null, archivo.nombre);
    return reply.status(201).send({ nombre: archivo.nombre, mime: archivo.mime, tamano: archivo.datos.length });
  });

  app.delete('/fichas/:fichaId/documentos/:tipo/archivo', async (req) => {
    const { s, f, tipo } = await preparar(req, 'editar');
    const previo = await deps.db
      .selectFrom('documentos as d')
      .innerJoin('archivos as a', 'a.id', 'd.archivo_id')
      .select(['a.id', 'a.clave', 'a.nombre'])
      .where('d.ficha_id', '=', f.id)
      .where('d.tipo', '=', tipo)
      .executeTakeFirst();
    if (!previo) throw noEncontrado('El documento no tiene archivo');
    await deps.db.updateTable('documentos').set({ archivo_id: null }).where('ficha_id', '=', f.id).where('tipo', '=', tipo).execute();
    await deps.db.deleteFrom('archivos').where('id', '=', previo.id).execute();
    await deps.almacenamiento.borrar(previo.clave);
    await registrar(s, f, `archivo.${tipo}`, previo.nombre, null);
    return { ok: true };
  });

  // RNF-022: enlace temporal de 10 minutos. RNF-044: se registra cada apertura de documentos sensibles.
  app.get('/fichas/:fichaId/documentos/:tipo/enlace', async (req) => {
    const { s, f, tipo, def } = await preparar(req, 'ver');
    const d = await deps.db
      .selectFrom('documentos')
      .select('archivo_id')
      .where('ficha_id', '=', f.id)
      .where('tipo', '=', tipo)
      .executeTakeFirst();
    if (!d?.archivo_id) throw noEncontrado('El documento no tiene archivo');
    if (def.auditarApertura) {
      await auditar(deps.db, { accion: 'apertura_documento', grupoId: f.grupo_id, usuarioId: s.usuarioId, fichaId: f.id, detalle: { tipo } });
    }
    return enlaceArchivo(deps, d.archivo_id);
  });
}
