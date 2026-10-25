import { esFechaISO, hoyAR, type FechaISO } from '@scouttracker/shared';
import type { Dependencias } from '../app';

/** RI-010 / DEP-02: fuente pública de feriados nacionales de Argentina. */
export interface FuenteFeriados {
  obtener(anio: number): Promise<{ fecha: FechaISO; nombre: string }[]>;
}

export class FuenteArgentinaDatos implements FuenteFeriados {
  async obtener(anio: number) {
    const r = await fetch(`https://api.argentinadatos.com/v1/feriados/${anio}`, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`ArgentinaDatos respondió ${r.status}`);
    const lista = (await r.json()) as { fecha?: unknown; nombre?: unknown }[];
    return lista
      .filter((f) => esFechaISO(f.fecha) && typeof f.nombre === 'string' && f.nombre.trim())
      .map((f) => ({ fecha: f.fecha as FechaISO, nombre: (f.nombre as string).trim() }));
  }
}

export class FuenteFeriadosMemoria implements FuenteFeriados {
  disponible = true;
  constructor(public feriados: Record<number, { fecha: FechaISO; nombre: string }[]> = {}) {}
  async obtener(anio: number) {
    if (!this.disponible) throw new Error('Fuente no disponible');
    return this.feriados[anio] ?? [];
  }
}

/** Los feriados nacionales se vuelven a consultar una vez por semana. */
const DIAS_ENTRE_CONSULTAS = 7;

/**
 * RF-075: trae los feriados del año en curso y del siguiente. Si la fuente no responde, quedan
 * los guardados y el admin de grupo puede cargarlos a mano (RF-076). Devuelve los años actualizados.
 */
export async function actualizarFeriados(deps: Dependencias): Promise<number[]> {
  const ahora = deps.ahora();
  const anio = Number(hoyAR(ahora).slice(0, 4));
  const limite = new Date(ahora.getTime() - DIAS_ENTRE_CONSULTAS * 24 * 60 * 60 * 1000);
  const actualizados: number[] = [];
  for (const a of [anio, anio + 1]) {
    const reciente = await deps.db
      .selectFrom('feriados')
      .select('id')
      .where('grupo_id', 'is', null)
      .where('fecha', '>=', `${a}-01-01`)
      .where('fecha', '<=', `${a}-12-31`)
      .where('actualizado_en', '>', limite)
      .executeTakeFirst();
    if (reciente) continue;
    const lista = (await deps.feriados.obtener(a)).filter((f) => f.fecha.startsWith(`${a}-`));
    // Un año que la fuente todavía no publicó no borra lo que hubiera.
    if (lista.length === 0) continue;
    await deps.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('feriados').where('grupo_id', 'is', null).where('fecha', '>=', `${a}-01-01`).where('fecha', '<=', `${a}-12-31`).execute();
      await trx
        .insertInto('feriados')
        .values(lista.map((f) => ({ grupo_id: null, fecha: f.fecha, nombre: f.nombre, actualizado_en: ahora })))
        .onConflict((oc) => oc.doNothing())
        .execute();
    });
    actualizados.push(a);
  }
  return actualizados;
}
