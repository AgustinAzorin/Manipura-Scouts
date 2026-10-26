import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { hoyAR, type ReporteErrorApp } from '@scouttracker/shared';
import type { Dependencias } from '../app';

/** Registra la aparición de un error y dice si es la primera (misma firma = mismo mensaje y origen). */
async function esErrorNuevo(deps: Dependencias, e: Error, origen: string): Promise<{ firma: string; nuevo: boolean }> {
  const primeraLinea = (e.stack ?? '').split('\n').find((l) => l.trim().startsWith('at ')) ?? '';
  const firma = createHash('sha256').update(`${origen}|${e.message}|${primeraLinea.trim()}`).digest('hex').slice(0, 32);
  const r = await sql<{ nuevo: boolean }>`
    INSERT INTO errores_notificados (firma) VALUES (${firma})
    ON CONFLICT (firma) DO UPDATE SET ultima_vez = now(), cantidad = errores_notificados.cantidad + 1
    RETURNING (xmax = 0) AS nuevo`.execute(deps.db);
  return { firma, nuevo: !!r.rows[0]?.nuevo };
}

/**
 * RNF-034: registra los errores inesperados del servidor y avisa por mail al responsable
 * técnico la primera vez que aparece cada error.
 */
export async function notificarError(deps: Dependencias, error: unknown, origen: string): Promise<void> {
  const e = error instanceof Error ? error : new Error(String(error));
  const { firma, nuevo } = await esErrorNuevo(deps, e, origen);
  if (!nuevo || !deps.config.mailResponsableTecnico) return;
  await deps.mailer.enviar({
    tipo: 'error',
    para: deps.config.mailResponsableTecnico,
    asunto: `[ScoutTracker] Error nuevo en el servidor: ${e.message.slice(0, 80)}`,
    texto: `Origen: ${origen}\nFirma: ${firma}\n\n${e.stack ?? e.message}`,
  });
}

/**
 * Tope diario de mails por errores de la app: una versión con un error que cambia de mensaje
 * (o alguien que manda reportes inventados) no debe agotar el tope de RN-14, que también usan
 * las invitaciones y la recuperación de contraseña.
 */
export const TOPE_MAILS_ERRORES_APP = 10;

/** RNF-034 del lado de la app: los errores y cierres que manda el celular o la web. */
export async function notificarErrorApp(deps: Dependencias, reporte: ReporteErrorApp, usuarioId: string): Promise<void> {
  const e = new Error(reporte.mensaje);
  e.stack = reporte.pila ?? reporte.mensaje;
  const origen = `app ${reporte.plataforma} ${reporte.version}`;
  const { firma, nuevo } = await esErrorNuevo(deps, e, origen);
  if (!nuevo || !deps.config.mailResponsableTecnico) return;
  const inicio = new Date(`${hoyAR(deps.ahora())}T00:00:00-03:00`);
  const hoy = await deps.db
    .selectFrom('mails')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('tipo', '=', 'error-app')
    .where('enviado', '=', true)
    .where('creado_en', '>=', inicio)
    .executeTakeFirstOrThrow();
  if (hoy.n >= TOPE_MAILS_ERRORES_APP) return;
  await deps.mailer.enviar({
    tipo: 'error-app',
    para: deps.config.mailResponsableTecnico,
    asunto: `[ScoutTracker] ${reporte.fatal ? 'Cierre' : 'Error'} nuevo en la app (${reporte.plataforma}): ${reporte.mensaje.slice(0, 80)}`,
    texto: `Origen: ${origen}\nFatal: ${reporte.fatal ? 'sí' : 'no'}\nEnviado por el usuario: ${usuarioId}\nFirma: ${firma}\n\n${e.stack}`,
  });
}
