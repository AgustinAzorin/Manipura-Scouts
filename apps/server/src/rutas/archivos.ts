import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asignacionesEnRama } from '@scouttracker/shared';
import { sesionDe, type Dependencias } from '../app';
import { ErrorHttp, noEncontrado, sinPermiso } from '../errores';
import { firmaValida, firmar } from '../servicios/seguridad';

/** RNF-022 */
export const VIGENCIA_ENLACE_ARCHIVO_MS = 10 * 60 * 1000;

export function enlaceArchivo(deps: Dependencias, archivoId: string): { url: string; venceEn: string } {
  const vence = deps.ahora().getTime() + VIGENCIA_ENLACE_ARCHIVO_MS;
  const firma = firmar(deps.config.secretoEnlaces, `${archivoId}:${vence}`);
  return {
    url: `${deps.config.urlPublica}/archivos/${archivoId}?vence=${vence}&firma=${firma}`,
    venceEn: new Date(vence).toISOString(),
  };
}

export async function rutasArchivos(app: FastifyInstance, deps: Dependencias) {
  // Descarga con enlace firmado: no requiere sesión para que el visor del celular pueda abrirlo.
  app.get('/archivos/:archivoId', async (req, reply) => {
    const { archivoId } = z.object({ archivoId: z.string().uuid() }).parse(req.params);
    const q = z.object({ vence: z.coerce.number(), firma: z.string() }).safeParse(req.query);
    if (!q.success || !firmaValida(deps.config.secretoEnlaces, `${archivoId}:${q.data.vence}`, q.data.firma)) {
      throw new ErrorHttp(403, 'ENLACE_INVALIDO', 'Enlace inválido');
    }
    if (q.data.vence < deps.ahora().getTime()) throw new ErrorHttp(410, 'ENLACE_VENCIDO', 'El enlace venció. Volvé a abrir el documento desde la app.');
    const a = await deps.db.selectFrom('archivos').select(['clave', 'mime', 'nombre']).where('id', '=', archivoId).executeTakeFirst();
    if (!a) throw noEncontrado('El archivo ya no existe');
    const datos = await deps.almacenamiento.leer(a.clave);
    return reply
      .header('Content-Type', a.mime)
      .header('Content-Disposition', `inline; filename="${encodeURIComponent(a.nombre)}"`)
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .send(datos);
  });

  // Logos de equipos y de valores de catálogo (RF-047): no son datos sensibles, pero solo los
  // ve quien tiene acceso a la rama.
  app.get('/logos/:archivoId', async (req, reply) => {
    const s = sesionDe(req);
    const { archivoId } = z.object({ archivoId: z.string().uuid() }).parse(req.params);
    const origen =
      (await deps.db.selectFrom('equipos').select(['grupo_id', 'rama_id']).where('logo_archivo_id', '=', archivoId).executeTakeFirst()) ??
      (await deps.db.selectFrom('catalogo_valores').select(['grupo_id', 'rama_id']).where('logo_archivo_id', '=', archivoId).executeTakeFirst());
    if (!origen) throw noEncontrado('El logo no existe');
    const equipos = await deps.db.selectFrom('equipos').select('id').where('rama_id', '=', origen.rama_id).execute();
    if (asignacionesEnRama(s.asignaciones, origen.grupo_id, origen.rama_id, new Set(equipos.map((e) => e.id))).length === 0) {
      throw sinPermiso();
    }
    const a = await deps.db.selectFrom('archivos').select(['clave', 'mime']).where('id', '=', archivoId).executeTakeFirstOrThrow();
    return reply
      .header('Content-Type', a.mime)
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(await deps.almacenamiento.leer(a.clave));
  });
}
