import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  armarNomina,
  describirFiltros,
  filtrosAplicables,
  hoyAR,
  indexarRama,
  permisosEfectivos,
  puede,
  tienePermiso,
  type FiltrosNomina,
} from '@scouttracker/shared';
import { sesionDe, type Dependencias } from '../app';
import { sinPermiso, validacion } from '../errores';
import { actividadesDeRama, serializarActividades } from '../servicios/actividades';
import { auditar } from '../servicios/auditoria';
import { nominaXlsx } from '../servicios/exportacion';
import { camposPropiosDeRama, cargarRama, configRama, documentosDeFichas, objetivoFicha, serializarFicha } from '../servicios/fichas';
import { exigirAccesoRama } from './fichas';

const ids = z.array(z.string().max(100)).max(200).optional();

/** Los mismos filtros de la nómina (RF-031); lo desconocido se descarta. */
const esquemaFiltros = z.object({
  equipo: ids,
  elemento: ids,
  etapa: ids,
  promesa: ids,
  tada: z.array(z.enum(['tiene', 'puedeHacer', 'noPuede'])).optional(),
  edadDesde: z.number().min(0).max(120).nullable().optional(),
  edadHasta: z.number().min(0).max(120).nullable().optional(),
  propios: z.record(z.string().max(100), z.array(z.string().max(200)).max(200)).optional(),
  soloIncompletas: z.boolean().optional(),
});

const esquemaConsulta = z.object({
  /** FiltrosNomina en JSON. */
  filtros: z.string().max(8000).optional(),
  /** Vista por equipo (RF-034). */
  equipo: z.string().uuid().optional(),
  /** "columna:asc" o "columna:desc" (RF-033). */
  orden: z
    .string()
    .regex(/^[\w:-]{1,60}:(asc|desc)$/)
    .optional(),
});

function leerFiltros(texto: string | undefined): FiltrosNomina {
  if (!texto) return {};
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw validacion('Los filtros no son válidos');
  }
  const r = esquemaFiltros.safeParse(datos);
  if (!r.success) throw validacion('Los filtros no son válidos');
  return r.data;
}

/** RF-115, RF-116 y RNF-043: exportación de la nómina a Excel. */
export async function rutasExportacion(app: FastifyInstance, deps: Dependencias) {
  // GET para que la app pueda descargar el archivo directo al celular con su sesión. La búsqueda
  // por texto no viaja: puede contener el nombre o el DNI de un protagonista, y los filtros quedan
  // registrados en la auditoría (RNF-043, RNF-046).
  app.get('/ramas/:ramaId/exportacion', async (req, reply) => {
    const s = sesionDe(req);
    const { ramaId } = z.object({ ramaId: z.string().uuid() }).parse(req.params);
    const q = esquemaConsulta.parse(req.query);
    const rama = await cargarRama(deps.db, ramaId);
    const asigs = await exigirAccesoRama(deps.db, s, rama.grupo_id, rama.id);
    const { permisos, verSensibles } = permisosEfectivos(asigs);
    if (!tienePermiso(permisos, 'exportacion', 'ver')) throw sinPermiso('Tu rol no tiene permiso de exportación');

    const config = await configRama(deps.db, rama);
    if (q.equipo && !config.equipos.some((e) => e.id === q.equipo)) throw validacion('El equipo no es de esta rama');
    const filtros = filtrosAplicables(leerFiltros(q.filtros), config);
    const [columna, direccion] = q.orden ? [q.orden.slice(0, q.orden.lastIndexOf(':')), q.orden.slice(q.orden.lastIndexOf(':') + 1)] : [];

    // Solo las fichas que el usuario puede ver y exportar (alcance de equipo incluido, RF-019).
    const filas = (
      await deps.db.selectFrom('fichas').selectAll().where('rama_id', '=', rama.id).where('estado', 'in', ['activa', 'incompleta']).execute()
    ).filter((f) => puede(s.asignaciones, 'padron', 'ver', objetivoFicha(f)) && puede(s.asignaciones, 'exportacion', 'ver', objetivoFicha(f)));
    const docs = await documentosDeFichas(deps.db, filas.map((f) => f.id));
    const camposPropios = await camposPropiosDeRama(deps.db, rama.id);
    const fichas = filas.map((f) => serializarFicha(s, f, docs.get(f.id), camposPropios));

    // La columna "Va" usa las actividades que no empezaron (RF-067).
    const ahora = deps.ahora();
    const actividades = await serializarActividades(deps.db, s, await actividadesDeRama(deps.db, s, rama, { desde: ahora }), { ramaId: rama.id, soloVigentes: true });
    const ix = indexarRama(config, actividades, ahora);
    const hoy = hoyAR(ahora);
    const lista = armarNomina(fichas, ix, {
      filtros,
      equipoId: q.equipo ?? null,
      orden: columna ? { columna, direccion: direccion as 'asc' | 'desc' } : null,
      hoy,
    });
    const descripcion = describirFiltros(filtros, ix);
    const equipo = q.equipo ? config.equipos.find((e) => e.id === q.equipo)!.nombre : null;

    const archivo = await nominaXlsx(lista, ix, {
      verSensibles,
      verCuotas: tienePermiso(permisos, 'cuotas', 'ver'),
      verDocumentos: tienePermiso(permisos, 'documentos', 'ver'),
      filtros: descripcion,
      equipo,
      usuario: s.nombre,
      generadoEn: ahora,
      hoy,
    });

    // RNF-043: usuario, fecha y hora (creado_en) y filtros aplicados. Sin datos de protagonistas.
    await auditar(deps.db, {
      accion: 'exportacion',
      grupoId: rama.grupo_id,
      usuarioId: s.usuarioId,
      detalle: { ramaId: rama.id, equipoId: q.equipo ?? null, filtros: descripcion, orden: q.orden ?? null, fichas: lista.length },
    });

    const nombre = `Nomina ${rama.nombre}${equipo ? ` ${equipo}` : ''} ${hoy}.xlsx`.replace(/[\\/:*?"<>|\r\n]/g, ' ');
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="nomina.xlsx"; filename*=UTF-8''${encodeURIComponent(nombre)}`)
      .header('Cache-Control', 'private, no-store')
      .send(archivo);
  });
}
