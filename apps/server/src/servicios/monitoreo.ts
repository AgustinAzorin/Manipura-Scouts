import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import type { Dependencias } from '../app';

/**
 * RNF-034: registra los errores inesperados del servidor y avisa por mail al responsable
 * técnico la primera vez que aparece cada error (misma firma = mismo mensaje y origen).
 */
export async function notificarError(deps: Dependencias, error: unknown, origen: string): Promise<void> {
  const e = error instanceof Error ? error : new Error(String(error));
  const primeraLinea = (e.stack ?? '').split('\n').find((l) => l.trim().startsWith('at ')) ?? '';
  const firma = createHash('sha256').update(`${origen}|${e.message}|${primeraLinea.trim()}`).digest('hex').slice(0, 32);
  const r = await sql<{ nuevo: boolean }>`
    INSERT INTO errores_notificados (firma) VALUES (${firma})
    ON CONFLICT (firma) DO UPDATE SET ultima_vez = now(), cantidad = errores_notificados.cantidad + 1
    RETURNING (xmax = 0) AS nuevo`.execute(deps.db);
  if (!r.rows[0]?.nuevo || !deps.config.mailResponsableTecnico) return;
  await deps.mailer.enviar({
    tipo: 'error',
    para: deps.config.mailResponsableTecnico,
    asunto: `[ScoutTracker] Error nuevo en el servidor: ${e.message.slice(0, 80)}`,
    texto: `Origen: ${origen}\nFirma: ${firma}\n\n${e.stack ?? e.message}`,
  });
}
