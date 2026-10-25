import { CATALOGOS, normalizarTexto, type Catalogo } from '@scouttracker/shared';
import { z } from 'zod';
import type { Db } from '../db';

/** Equipos y valores de catálogo de una rama (RF-044 a RF-048), para cargarlos de una vez antes de importar. */
export const esquemaConfiguracionRama = z
  .object({
    equipos: z.array(z.string().trim().min(1).max(100)).default([]),
    catalogos: z.partialRecord(z.enum(CATALOGOS), z.array(z.string().trim().min(1).max(100))).default({}),
    /** Valores de "categoría de miembro" que corresponden a adultos: no se importan al padrón (RF-049). */
    adultos: z.array(z.string().trim().min(1)).default([]),
  })
  .refine((c) => c.adultos.every((a) => c.catalogos.categoriaMiembro?.includes(a)), {
    message: 'Cada valor de "adultos" tiene que estar también en catalogos.categoriaMiembro',
  });
export type ConfiguracionRama = z.infer<typeof esquemaConfiguracionRama>;

export interface ResultadoCarga {
  equiposCreados: string[];
  valoresCreados: string[];
  yaExistian: number;
}

/** Crea lo que falte; lo que ya existe (sin distinguir mayúsculas ni tildes) se deja como está. */
export async function cargarConfiguracionRama(db: Db, rama: { id: string; grupo_id: string }, config: ConfiguracionRama): Promise<ResultadoCarga> {
  const r: ResultadoCarga = { equiposCreados: [], valoresCreados: [], yaExistian: 0 };
  await db.transaction().execute(async (trx) => {
    const equipos = new Set((await trx.selectFrom('equipos').select('nombre').where('rama_id', '=', rama.id).execute()).map((e) => normalizarTexto(e.nombre)));
    for (const nombre of config.equipos) {
      if (equipos.has(normalizarTexto(nombre))) {
        r.yaExistian++;
        continue;
      }
      await trx.insertInto('equipos').values({ grupo_id: rama.grupo_id, rama_id: rama.id, nombre }).execute();
      equipos.add(normalizarTexto(nombre));
      r.equiposCreados.push(nombre);
    }

    const existentes = await trx.selectFrom('catalogo_valores').select(['catalogo', 'nombre', 'orden']).where('rama_id', '=', rama.id).execute();
    const adultos = new Set(config.adultos.map(normalizarTexto));
    for (const [catalogo, nombres] of Object.entries(config.catalogos) as [Catalogo, string[]][]) {
      const delCatalogo = existentes.filter((v) => v.catalogo === catalogo);
      const ya = new Set(delCatalogo.map((v) => normalizarTexto(v.nombre)));
      let orden = Math.max(0, ...delCatalogo.map((v) => v.orden));
      for (const nombre of nombres) {
        if (ya.has(normalizarTexto(nombre))) {
          r.yaExistian++;
          continue;
        }
        await trx
          .insertInto('catalogo_valores')
          .values({
            grupo_id: rama.grupo_id,
            rama_id: rama.id,
            catalogo,
            nombre,
            orden: ++orden,
            es_adulto: catalogo === 'categoriaMiembro' && adultos.has(normalizarTexto(nombre)),
          })
          .execute();
        ya.add(normalizarTexto(nombre));
        r.valoresCreados.push(`${catalogo}: ${nombre}`);
      }
    }
  });
  return r;
}
