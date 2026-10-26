import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sesionDe, type Dependencias } from '../app';
import { notificarErrorApp } from '../servicios/monitoreo';

const esquemaReporte = z.object({
  mensaje: z.string().trim().min(1).max(500),
  pila: z.string().max(8000).optional(),
  plataforma: z.enum(['android', 'ios', 'web']),
  version: z.string().trim().min(1).max(40),
  fatal: z.boolean(),
});

/**
 * RNF-034 del lado de la app: el celular y la web mandan acá sus errores inesperados. Pide sesión
 * para que nadie de afuera pueda llenar la base ni la casilla del responsable técnico; los errores
 * de antes de iniciar sesión quedan guardados en el dispositivo y se mandan después.
 */
export async function rutasMonitoreo(app: FastifyInstance, deps: Dependencias) {
  app.post('/errores-app', async (req, reply) => {
    const s = sesionDe(req);
    await notificarErrorApp(deps, esquemaReporte.parse(req.body), s.usuarioId);
    return reply.status(204).send();
  });
}
