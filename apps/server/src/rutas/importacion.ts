import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hoyAR, type ResumenImportacion } from '@scouttracker/shared';
import { sesionDe, type Dependencias } from '../app';
import { validacion } from '../errores';
import { importarTabla } from '../importacion/procesar';
import { leerPlanilla } from '../importacion/leer';
import { exigirAdminRama } from '../servicios/acceso';
import { auditar } from '../servicios/auditoria';
import { cargarRama } from '../servicios/fichas';

/** RF-049 a RF-053: importación de la planilla actual a una rama. */
export async function rutasImportacion(app: FastifyInstance, deps: Dependencias) {
  app.post('/ramas/:ramaId/importar', async (req): Promise<ResumenImportacion> => {
    const s = sesionDe(req);
    const { ramaId } = z.object({ ramaId: z.string().uuid() }).parse(req.params);
    const rama = await cargarRama(deps.db, ramaId);
    exigirAdminRama(s, rama.grupo_id, rama.id, 'crear');
    if (!req.isMultipart()) throw validacion('Falta el archivo');
    const parte = await req.file();
    if (!parte) throw validacion('Falta el archivo');
    const datos = await parte.toBuffer();
    const tabla = await leerPlanilla(parte.filename ?? '', datos);
    const resumen = await importarTabla(deps.db, s.usuarioId, rama, tabla, hoyAR(deps.ahora()));
    await auditar(deps.db, {
      accion: 'importacion',
      grupoId: rama.grupo_id,
      usuarioId: s.usuarioId,
      detalle: { ramaId: rama.id, creadas: resumen.creadas, incompletas: resumen.incompletas, omitidas: resumen.omitidas.length },
    });
    return resumen;
  });
}
