import type { Db } from '../db';
import { generarToken, hashToken } from './seguridad';

/** RN-21: invitación 7 días, recuperación 1 hora. */
export const VIGENCIA_ENLACE_MS = {
  invitacion: 7 * 24 * 60 * 60 * 1000,
  recuperacion: 60 * 60 * 1000,
} as const;

export type TipoEnlace = keyof typeof VIGENCIA_ENLACE_MS;

/** Crea un enlace de un solo uso. Pedir uno nuevo invalida los anteriores del mismo tipo (RN-21). */
export async function crearEnlace(db: Db, usuarioId: string, tipo: TipoEnlace, ahora: Date): Promise<string> {
  const token = generarToken();
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('enlaces').where('usuario_id', '=', usuarioId).where('tipo', '=', tipo).execute();
    await trx
      .insertInto('enlaces')
      .values({
        usuario_id: usuarioId,
        tipo,
        token_hash: hashToken(token),
        vence_en: new Date(ahora.getTime() + VIGENCIA_ENLACE_MS[tipo]),
      })
      .execute();
  });
  return token;
}

export type EstadoEnlace = { valido: true; usuarioId: string; enlaceId: string } | { valido: false };

export async function verificarEnlace(db: Db, token: string, tipo: TipoEnlace, ahora: Date): Promise<EstadoEnlace> {
  const e = await db
    .selectFrom('enlaces')
    .select(['id', 'usuario_id', 'vence_en', 'usado_en'])
    .where('token_hash', '=', hashToken(token))
    .where('tipo', '=', tipo)
    .executeTakeFirst();
  if (!e || e.usado_en || e.vence_en <= ahora) return { valido: false };
  return { valido: true, usuarioId: e.usuario_id, enlaceId: e.id };
}
