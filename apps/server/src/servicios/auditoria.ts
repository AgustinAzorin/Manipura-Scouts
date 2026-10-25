import type { Db } from '../db';
import { json } from '../db';

export type AccionAuditada = 'apertura_documento' | 'supresion' | 'anonimizacion' | 'importacion';

/**
 * RNF-044 a RNF-046: registro de auditoría. Se refiere a la ficha solo por su id interno;
 * `detalle` nunca debe llevar nombre, DNI ni otros datos personales del protagonista.
 */
export async function auditar(
  db: Db,
  r: { accion: AccionAuditada; grupoId: string | null; usuarioId: string | null; fichaId?: string | null; detalle?: Record<string, unknown> },
): Promise<void> {
  await db
    .insertInto('auditoria')
    .values({
      accion: r.accion,
      grupo_id: r.grupoId,
      usuario_id: r.usuarioId,
      ficha_id: r.fichaId ?? null,
      detalle: json(r.detalle ?? {}),
    })
    .execute();
}
