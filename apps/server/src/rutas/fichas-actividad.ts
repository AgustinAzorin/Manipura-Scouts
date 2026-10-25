import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AREAS,
  esHora,
  faltantesAnexo,
  faltantesVersionFinal,
  NOMBRE_CAMPO_ANEXO,
  normalizarTexto,
  ordenarGrilla,
  puede,
  type AnexoDTO,
  type AnexoPendienteDTO,
  type AnexoReutilizableDTO,
  type CabeceraDTO,
  type FichaActividadDTO,
  type PdfFichaDTO,
} from '@scouttracker/shared';
import type { Insertable } from 'kysely';
import { sesionDe, type Dependencias } from '../app';
import { json, type TablaAnexos } from '../db';
import { conflicto, ErrorHttp, noEncontrado, sinPermiso, validacion } from '../errores';
import { exigir, exigirAdminGrupo, type Sesion } from '../servicios/acceso';
import { cargarActividad } from '../servicios/actividades';
import { cargarRama } from '../servicios/fichas';
import {
  cabeceraDeRama,
  cargarFichaActividad,
  exigirEditarFicha,
  exigirVerFicha,
  marcarEditada,
  objetivoFichaActividad,
  puedeEditarAnexo,
  serializarAnexo,
  serializarFichaActividad,
  usuariosDeRama,
  type FichaCargada,
} from '../servicios/fichas-actividad';
import { generarPdfFicha } from '../servicios/pdf-ficha';
import { leerArchivoSubido } from '../servicios/subidas';
import { enlaceArchivo } from './archivos';
import { exigirAccesoRama } from './fichas';

const pId = z.object({ id: z.string().uuid() });
const pRama = z.object({ ramaId: z.string().uuid() });
const TAMANO_MAXIMO_LOGO = 1024 * 1024;

const textoLargo = z.string().max(20_000);
const listaObjetivos = z.array(z.string().trim().min(1).max(1000)).max(50);

const esquemaCabecera = z.object({
  nombreGrupo: z.string().trim().max(200),
  nombreComunidad: z.string().trim().max(200),
  educadores: z
    .array(z.object({ nombre: z.string().trim().min(1, 'Falta el nombre').max(200), cargo: z.string().trim().max(200), formacion: z.string().trim().max(300) }))
    .max(30),
});

/** RF-094 */
const esquemaResponsable = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('todos') }),
  z.object({ tipo: z.literal('usuarios'), ids: z.array(z.string().uuid()).min(1, 'Elegí al menos un usuario').max(20) }),
  z.object({ tipo: z.literal('texto'), texto: z.string().trim().min(1, 'Escribí el nombre').max(200) }),
]);

const esquemaFila = z.object({
  hora: z.string().refine(esHora, 'Hora inválida (hh:mm)'),
  nombre: z.string().trim().min(1, 'Falta el nombre de la actividad').max(300),
  responsable: esquemaResponsable.nullable(),
  observaciones: z.string().trim().max(1000),
  anexo: z.number().int().positive().nullable(),
});

const esquemaFicha = z
  .object({
    diagnostico: textoLargo,
    porQue: textoLargo,
    aQueResponde: textoLargo,
    dondeNecesidad: textoLargo,
    porQueLugar: textoLargo,
    objetivosEducativos: listaObjetivos,
    objetivosDirigente: listaObjetivos,
    areas: z
      .array(z.object({ area: z.enum(AREAS), descripcion: z.string().max(5000) }))
      .refine((l) => new Set(l.map((a) => a.area)).size === l.length, 'Hay áreas repetidas'),
    grilla: z.array(esquemaFila).max(100),
  })
  .partial();

const enteroOpcional = (max: number) => z.number().int().min(0).max(max).nullable();

/** RD-005 */
const esquemaAnexo = z
  .object({
    titulo: z.string().trim().max(300),
    categoriaId: z.string().uuid().nullable(),
    edadDesde: enteroOpcional(120),
    edadHasta: enteroOpcional(120),
    participantes: enteroOpcional(10_000),
    duracionMinutos: enteroOpcional(60 * 24 * 7),
    espacio: z.string().trim().max(300),
    educadores: z
      .string()
      .trim()
      .max(20)
      .refine((v) => v === '' || normalizarTexto(v) === 'todos' || /^\d{1,3}$/.test(v), 'Indicá un número o "todos"')
      .transform((v) => (normalizarTexto(v) === 'todos' ? 'todos' : v)),
    equipos: z.number().int().min(1).max(100).nullable(),
    motivacion: z.string().trim().max(2000),
    objetivos: z.string().trim().max(5000),
    areas: z.string().trim().max(2000),
    materiales: z
      .array(z.object({ cantidad: z.number().positive().max(100_000).nullable(), descripcion: z.string().trim().min(1, 'Falta la descripción').max(300), porEquipo: z.boolean() }))
      .max(100),
    desarrollo: z.string().max(30_000),
  })
  .partial()
  .refine((a) => a.edadDesde == null || a.edadHasta == null || a.edadDesde <= a.edadHasta, { message: 'La edad "desde" no puede ser mayor que "hasta"', path: ['edadHasta'] });

/** Nombre del archivo del PDF, sin caracteres que confundan al celular. */
const nombrePdf = (actividad: string) => `Ficha de Actividad - ${actividad.replace(/[\\/:*?"<>|\r\n]/g, ' ').trim()}.pdf`.slice(0, 200);

/** Ficha de Actividad: cabecera, ficha, grilla, anexos, PDF y anexos pendientes (RF-068, RF-088 a RF-105). */
export async function rutasFichasActividad(app: FastifyInstance, deps: Dependencias) {
  async function borrarArchivo(archivoId: string) {
    const a = await deps.db.deleteFrom('archivos').where('id', '=', archivoId).returning('clave').executeTakeFirst();
    if (a) await deps.almacenamiento.borrar(a.clave);
  }

  const respuesta = async (s: Sesion, id: string): Promise<FichaActividadDTO> => serializarFichaActividad(deps.db, s, await cargarFichaActividad(deps.db, id));

  async function anexoConFicha(s: Sesion, id: string) {
    const anexo = await deps.db.selectFrom('anexos').selectAll().where('id', '=', id).executeTakeFirst();
    if (!anexo) throw noEncontrado('El anexo no existe');
    const f = await cargarFichaActividad(deps.db, anexo.ficha_actividad_id);
    await exigirVerFicha(deps.db, s, f);
    return { anexo, f };
  }

  async function respuestaAnexo(s: Sesion, f: FichaCargada, id: string): Promise<AnexoDTO> {
    const a = await deps.db.selectFrom('anexos').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    const usuarios = await usuariosDeRama(deps.db, f.ficha.grupo_id, f.ficha.rama_id);
    return serializarAnexo(a, usuarios, new Map(), puedeEditarAnexo(s, f, a));
  }

  async function validarUsuarioDeRama(f: FichaCargada, usuarioId: string) {
    const usuarios = await usuariosDeRama(deps.db, f.ficha.grupo_id, f.ficha.rama_id);
    if (!usuarios.some((u) => u.id === usuarioId)) throw validacion('El usuario no trabaja en esta rama', { asignadoA: 'Elegí un usuario de la rama' });
  }

  // ---- Cabecera de la rama (RF-088): la configura el admin de grupo.
  app.get('/ramas/:ramaId/cabecera-ficha', async (req): Promise<CabeceraDTO> => {
    const s = sesionDe(req);
    const { ramaId } = pRama.parse(req.params);
    const rama = await cargarRama(deps.db, ramaId);
    await exigirAccesoRama(deps.db, s, rama.grupo_id, rama.id);
    return cabeceraDeRama(deps.db, rama.id);
  });

  app.put('/ramas/:ramaId/cabecera-ficha', async (req): Promise<CabeceraDTO> => {
    const s = sesionDe(req);
    const { ramaId } = pRama.parse(req.params);
    const rama = await cargarRama(deps.db, ramaId);
    exigirAdminGrupo(s, rama.grupo_id);
    const d = esquemaCabecera.parse(req.body);
    const valores = { nombre_grupo: d.nombreGrupo || null, nombre_comunidad: d.nombreComunidad || null, educadores: json(d.educadores), actualizado_en: deps.ahora() };
    await deps.db
      .insertInto('cabeceras_ficha')
      .values({ rama_id: rama.id, grupo_id: rama.grupo_id, ...valores })
      .onConflict((oc) => oc.column('rama_id').doUpdateSet(valores))
      .execute();
    return cabeceraDeRama(deps.db, rama.id);
  });

  app.post('/ramas/:ramaId/cabecera-ficha/logo', async (req) => {
    const s = sesionDe(req);
    const { ramaId } = pRama.parse(req.params);
    const rama = await cargarRama(deps.db, ramaId);
    exigirAdminGrupo(s, rama.grupo_id);
    const archivo = await leerArchivoSubido(req, { tiposPermitidos: ['image/png', 'image/jpeg'], tamanoMaximo: TAMANO_MAXIMO_LOGO });
    const clave = await deps.almacenamiento.guardar(archivo.datos);
    const nuevo = await deps.db
      .insertInto('archivos')
      .values({ grupo_id: rama.grupo_id, clave, nombre: archivo.nombre, mime: archivo.mime, tamano: archivo.datos.length })
      .returning('id')
      .executeTakeFirstOrThrow();
    const anterior = await deps.db.selectFrom('cabeceras_ficha').select('logo_archivo_id').where('rama_id', '=', rama.id).executeTakeFirst();
    await deps.db
      .insertInto('cabeceras_ficha')
      .values({ rama_id: rama.id, grupo_id: rama.grupo_id, logo_archivo_id: nuevo.id })
      .onConflict((oc) => oc.column('rama_id').doUpdateSet({ logo_archivo_id: nuevo.id, actualizado_en: deps.ahora() }))
      .execute();
    if (anterior?.logo_archivo_id) await borrarArchivo(anterior.logo_archivo_id);
    return { logo: nuevo.id };
  });

  app.delete('/ramas/:ramaId/cabecera-ficha/logo', async (req) => {
    const s = sesionDe(req);
    const { ramaId } = pRama.parse(req.params);
    const rama = await cargarRama(deps.db, ramaId);
    exigirAdminGrupo(s, rama.grupo_id);
    const c = await deps.db.selectFrom('cabeceras_ficha').select('logo_archivo_id').where('rama_id', '=', rama.id).executeTakeFirst();
    if (!c?.logo_archivo_id) throw noEncontrado('La cabecera no tiene logo');
    await deps.db.updateTable('cabeceras_ficha').set({ logo_archivo_id: null, actualizado_en: deps.ahora() }).where('rama_id', '=', rama.id).execute();
    await borrarArchivo(c.logo_archivo_id);
    return { ok: true };
  });

  // ---- Ficha de una actividad (RF-068)
  app.get('/actividades/:id/ficha-actividad', async (req): Promise<FichaActividadDTO> => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const a = await cargarActividad(deps.db, s, id);
    const f = await deps.db.selectFrom('fichas_actividad').select('id').where('actividad_id', '=', a.id).executeTakeFirst();
    if (!f) throw new ErrorHttp(404, 'SIN_FICHA', 'La actividad todavía no tiene Ficha de Actividad');
    const cargada = await cargarFichaActividad(deps.db, f.id);
    await exigirVerFicha(deps.db, s, cargada);
    return serializarFichaActividad(deps.db, s, cargada);
  });

  // RF-068 / RF-089: la ficha toma fecha y lugar de la actividad y el diagnóstico de la última
  // ficha de la rama. Una actividad de grupo no tiene rama: se usa la rama desde la que se crea.
  app.post('/actividades/:id/ficha-actividad', async (req, reply) => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const { ramaId } = z.object({ ramaId: z.string().uuid().nullish() }).parse(req.body ?? {});
    const a = await cargarActividad(deps.db, s, id);
    const rama = a.rama_id ?? ramaId;
    if (!rama) throw validacion('Indicá la rama de la ficha', { ramaId: 'Elegí la rama' });
    if (!a.rama_id) {
      const r = await deps.db.selectFrom('ramas').select('id').where('id', '=', rama).where('grupo_id', '=', a.grupo_id).executeTakeFirst();
      if (!r) throw validacion('La rama no es de este grupo');
    }
    exigir(s, 'fichaActividad', 'crear', { grupoId: a.grupo_id, ramaId: rama, equipoId: a.equipo_id }, 'No tenés permiso para crear Fichas de Actividad en esta rama');
    if (await deps.db.selectFrom('fichas_actividad').select('id').where('actividad_id', '=', a.id).executeTakeFirst()) {
      throw conflicto('YA_TIENE_FICHA', 'La actividad ya tiene Ficha de Actividad');
    }
    const ultima = await deps.db.selectFrom('fichas_actividad').select('diagnostico').where('rama_id', '=', rama).orderBy('creado_en', 'desc').limit(1).executeTakeFirst();
    try {
      const f = await deps.db
        .insertInto('fichas_actividad')
        .values({ grupo_id: a.grupo_id, rama_id: rama, actividad_id: a.id, diagnostico: ultima?.diagnostico ?? '', creado_por: s.usuarioId, creado_en: deps.ahora(), actualizado_en: deps.ahora() })
        .returning('id')
        .executeTakeFirstOrThrow();
      return reply.status(201).send(await respuesta(s, f.id));
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw conflicto('YA_TIENE_FICHA', 'La actividad ya tiene Ficha de Actividad');
      throw e;
    }
  });

  app.get('/fichas-actividad/:id', async (req): Promise<FichaActividadDTO> => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const f = await cargarFichaActividad(deps.db, id);
    await exigirVerFicha(deps.db, s, f);
    return serializarFichaActividad(deps.db, s, f);
  });

  // RF-089 a RF-094: textos, objetivos, áreas y grilla.
  app.patch('/fichas-actividad/:id', async (req): Promise<FichaActividadDTO> => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const f = await cargarFichaActividad(deps.db, id);
    exigirEditarFicha(s, f);
    const d = esquemaFicha.parse(req.body);
    if (d.grilla) {
      const numeros = new Set((await deps.db.selectFrom('anexos').select('numero').where('ficha_actividad_id', '=', id).execute()).map((a) => a.numero));
      const sinAnexo = d.grilla.find((fila) => fila.anexo !== null && !numeros.has(fila.anexo));
      if (sinAnexo) throw validacion(`El anexo ${sinAnexo.anexo} no existe. Agregalo antes de usarlo en la grilla.`);
      const usuarios = new Set((await usuariosDeRama(deps.db, f.ficha.grupo_id, f.ficha.rama_id)).map((u) => u.id));
      if (d.grilla.some((fila) => fila.responsable?.tipo === 'usuarios' && fila.responsable.ids.some((u) => !usuarios.has(u)))) {
        throw validacion('Hay responsables que no trabajan en esta rama');
      }
    }
    await deps.db
      .updateTable('fichas_actividad')
      .set({
        ...(d.diagnostico !== undefined && { diagnostico: d.diagnostico }),
        ...(d.porQue !== undefined && { por_que: d.porQue }),
        ...(d.aQueResponde !== undefined && { a_que_responde: d.aQueResponde }),
        ...(d.dondeNecesidad !== undefined && { donde_necesidad: d.dondeNecesidad }),
        ...(d.porQueLugar !== undefined && { por_que_lugar: d.porQueLugar }),
        ...(d.objetivosEducativos !== undefined && { objetivos_educativos: d.objetivosEducativos }),
        ...(d.objetivosDirigente !== undefined && { objetivos_dirigente: d.objetivosDirigente }),
        ...(d.areas !== undefined && { areas: json(d.areas) }),
        ...(d.grilla !== undefined && { grilla: json(ordenarGrilla(d.grilla)) }),
        estado: 'enCarga',
        actualizado_en: deps.ahora(),
      })
      .where('id', '=', id)
      .execute();
    return respuesta(s, id);
  });

  app.delete('/fichas-actividad/:id', async (req) => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const f = await cargarFichaActividad(deps.db, id);
    exigir(s, 'fichaActividad', 'eliminar', objetivoFichaActividad(f), 'No tenés permiso para eliminar esta Ficha de Actividad');
    await deps.db.deleteFrom('fichas_actividad').where('id', '=', id).execute();
    if (f.ficha.pdf_archivo_id) await borrarArchivo(f.ficha.pdf_archivo_id);
    return { ok: true };
  });

  // ---- Anexos (RF-095 a RF-097)
  // El número es el siguiente libre; la fila de la ficha se bloquea para que dos altas a la vez no choquen.
  async function crearAnexo(f: FichaCargada, valores: Omit<Insertable<TablaAnexos>, 'grupo_id' | 'ficha_actividad_id' | 'numero'>): Promise<string> {
    return deps.db.transaction().execute(async (trx) => {
      await trx.selectFrom('fichas_actividad').select('id').where('id', '=', f.ficha.id).forUpdate().executeTakeFirstOrThrow();
      const max = await trx.selectFrom('anexos').select((eb) => eb.fn.max('numero').as('n')).where('ficha_actividad_id', '=', f.ficha.id).executeTakeFirst();
      const a = await trx
        .insertInto('anexos')
        .values({ grupo_id: f.ficha.grupo_id, ficha_actividad_id: f.ficha.id, numero: Number(max?.n ?? 0) + 1, actualizado_en: deps.ahora(), ...valores })
        .returning('id')
        .executeTakeFirstOrThrow();
      await marcarEditada(trx, f.ficha.id, deps.ahora());
      return a.id;
    });
  }

  app.post('/fichas-actividad/:id/anexos', async (req, reply) => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const f = await cargarFichaActividad(deps.db, id);
    exigirEditarFicha(s, f);
    const { asignadoA } = z.object({ asignadoA: z.string().uuid().nullish() }).parse(req.body ?? {});
    if (asignadoA) await validarUsuarioDeRama(f, asignadoA);
    await crearAnexo(f, { asignado_a: asignadoA ?? null });
    return reply.status(201).send(await respuesta(s, id));
  });

  // RF-095 / RF-096: el asignado completa; asignar a otro requiere permiso de editar.
  app.patch('/anexos/:id', async (req): Promise<AnexoDTO> => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const { anexo, f } = await anexoConFicha(s, id);
    if (!puedeEditarAnexo(s, f, anexo)) throw sinPermiso('Solo el educador asignado o quien puede editar la Ficha de Actividad completa este anexo');
    const cuerpo = (req.body ?? {}) as Record<string, unknown>;
    const d = esquemaAnexo.parse(cuerpo);
    const { asignadoA } = z.object({ asignadoA: z.string().uuid().nullish() }).parse(cuerpo);
    if (asignadoA !== undefined) {
      exigirEditarFicha(s, f);
      if (asignadoA) await validarUsuarioDeRama(f, asignadoA);
    }
    if (d.categoriaId) {
      const c = await deps.db
        .selectFrom('catalogo_valores')
        .select('id')
        .where('id', '=', d.categoriaId)
        .where('rama_id', '=', f.ficha.rama_id)
        .where('catalogo', '=', 'categoriaAnexo')
        .executeTakeFirst();
      if (!c) throw validacion('La categoría no es de esta rama', { categoriaId: 'Elegí una categoría' });
    }
    if (d.edadDesde !== undefined || d.edadHasta !== undefined) {
      const desde = d.edadDesde !== undefined ? d.edadDesde : anexo.edad_desde;
      const hasta = d.edadHasta !== undefined ? d.edadHasta : anexo.edad_hasta;
      if (desde != null && hasta != null && desde > hasta) throw validacion('La edad "desde" no puede ser mayor que "hasta"', { edadHasta: 'Tiene que ser mayor o igual' });
    }
    const nuevo = {
      titulo: d.titulo ?? anexo.titulo,
      categoriaId: d.categoriaId !== undefined ? d.categoriaId : anexo.categoria_id,
      desarrollo: d.desarrollo ?? anexo.desarrollo,
    };
    await deps.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('anexos')
        .set({
          ...(d.titulo !== undefined && { titulo: d.titulo }),
          ...(d.categoriaId !== undefined && { categoria_id: d.categoriaId }),
          ...(d.edadDesde !== undefined && { edad_desde: d.edadDesde }),
          ...(d.edadHasta !== undefined && { edad_hasta: d.edadHasta }),
          ...(d.participantes !== undefined && { participantes: d.participantes }),
          ...(d.duracionMinutos !== undefined && { duracion_minutos: d.duracionMinutos }),
          ...(d.espacio !== undefined && { espacio: d.espacio }),
          ...(d.educadores !== undefined && { educadores: d.educadores }),
          ...(d.equipos !== undefined && { equipos: d.equipos }),
          ...(d.motivacion !== undefined && { motivacion: d.motivacion }),
          ...(d.objetivos !== undefined && { objetivos: d.objetivos }),
          ...(d.areas !== undefined && { areas: d.areas }),
          ...(d.materiales !== undefined && { materiales: json(d.materiales) }),
          ...(d.desarrollo !== undefined && { desarrollo: d.desarrollo }),
          ...(asignadoA !== undefined && { asignado_a: asignadoA ?? null }),
          // Si faltan obligatorios, deja de estar completo.
          ...(faltantesAnexo(nuevo).length > 0 && { completo: false }),
          actualizado_en: deps.ahora(),
        })
        .where('id', '=', id)
        .execute();
      await marcarEditada(trx, f.ficha.id, deps.ahora());
    });
    return respuestaAnexo(s, f, id);
  });

  // RF-096: marcar como completo exige título, categoría y desarrollo.
  app.post('/anexos/:id/completo', async (req): Promise<AnexoDTO> => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const { anexo, f } = await anexoConFicha(s, id);
    if (!puedeEditarAnexo(s, f, anexo)) throw sinPermiso('Solo el educador asignado o quien puede editar la Ficha de Actividad completa este anexo');
    const { completo } = z.object({ completo: z.boolean() }).parse(req.body);
    if (completo) {
      const faltan = faltantesAnexo({ titulo: anexo.titulo, categoriaId: anexo.categoria_id, desarrollo: anexo.desarrollo });
      if (faltan.length) {
        throw validacion(
          `Faltan campos obligatorios: ${faltan.map((c) => NOMBRE_CAMPO_ANEXO[c]).join(', ')}`,
          Object.fromEntries(faltan.map((c) => [c, 'Obligatorio'])),
        );
      }
    }
    await deps.db.transaction().execute(async (trx) => {
      await trx.updateTable('anexos').set({ completo, actualizado_en: deps.ahora() }).where('id', '=', id).execute();
      await marcarEditada(trx, f.ficha.id, deps.ahora());
    });
    return respuestaAnexo(s, f, id);
  });

  app.delete('/anexos/:id', async (req) => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const { anexo, f } = await anexoConFicha(s, id);
    exigirEditarFicha(s, f);
    if (f.ficha.grilla.some((fila) => fila.anexo === anexo.numero)) {
      throw conflicto('ANEXO_EN_GRILLA', `La grilla usa el anexo ${anexo.numero}. Quitalo de la grilla antes de eliminarlo.`);
    }
    await deps.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('anexos').where('id', '=', id).execute();
      await marcarEditada(trx, f.ficha.id, deps.ahora());
    });
    return { ok: true };
  });

  // RF-105: anexos de otras fichas que el usuario puede ver, para copiarlos.
  app.get('/fichas-actividad/:id/anexos-reutilizables', async (req): Promise<AnexoReutilizableDTO[]> => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const f = await cargarFichaActividad(deps.db, id);
    exigirEditarFicha(s, f);
    const grupos = [...new Set(s.asignaciones.map((a) => a.grupoId))];
    const filas = await deps.db
      .selectFrom('anexos as x')
      .innerJoin('fichas_actividad as fa', 'fa.id', 'x.ficha_actividad_id')
      .innerJoin('actividades as a', 'a.id', 'fa.actividad_id')
      .innerJoin('ramas as r', 'r.id', 'fa.rama_id')
      .leftJoin('catalogo_valores as c', 'c.id', 'x.categoria_id')
      .select(['x.id', 'x.numero', 'x.titulo', 'c.nombre as categoria', 'a.nombre as actividad', 'a.inicio', 'a.equipo_id', 'fa.grupo_id', 'fa.rama_id', 'r.nombre as rama'])
      .where('fa.grupo_id', 'in', grupos.length ? grupos : ['00000000-0000-0000-0000-000000000000'])
      .where('fa.id', '!=', id)
      .where('x.titulo', '!=', '')
      .orderBy('a.inicio', 'desc')
      .orderBy('x.numero')
      .limit(500)
      .execute();
    return filas
      .filter((x) => puede(s.asignaciones, 'fichaActividad', 'ver', { grupoId: x.grupo_id, ramaId: x.rama_id, equipoId: x.equipo_id }))
      .map((x) => ({ id: x.id, numero: x.numero, titulo: x.titulo, categoria: x.categoria, actividadNombre: x.actividad, inicio: x.inicio.toISOString(), ramaNombre: x.rama }));
  });

  // La copia es independiente del original y queda asignada a quien la copia.
  app.post('/fichas-actividad/:id/anexos/copiar', async (req, reply) => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const f = await cargarFichaActividad(deps.db, id);
    exigirEditarFicha(s, f);
    const { anexoId } = z.object({ anexoId: z.string().uuid() }).parse(req.body);
    const origen = await deps.db.selectFrom('anexos').selectAll().where('id', '=', anexoId).executeTakeFirst();
    if (!origen) throw noEncontrado('El anexo no existe');
    const fo = await cargarFichaActividad(deps.db, origen.ficha_actividad_id);
    if (!puede(s.asignaciones, 'fichaActividad', 'ver', objetivoFichaActividad(fo))) throw sinPermiso('No tenés acceso a ese anexo');
    // La categoría es un catálogo de la rama: de otra rama se busca la del mismo nombre.
    let categoria = origen.categoria_id;
    if (categoria && fo.ficha.rama_id !== f.ficha.rama_id) {
      const nombre = await deps.db.selectFrom('catalogo_valores').select('nombre').where('id', '=', categoria).executeTakeFirst();
      const propias = await deps.db.selectFrom('catalogo_valores').select(['id', 'nombre']).where('rama_id', '=', f.ficha.rama_id).where('catalogo', '=', 'categoriaAnexo').where('activo', '=', true).execute();
      categoria = propias.find((c) => normalizarTexto(c.nombre) === normalizarTexto(nombre?.nombre))?.id ?? null;
    }
    const usuarios = await usuariosDeRama(deps.db, f.ficha.grupo_id, f.ficha.rama_id);
    const datos = {
      titulo: origen.titulo,
      categoria_id: categoria,
      edad_desde: origen.edad_desde,
      edad_hasta: origen.edad_hasta,
      participantes: origen.participantes,
      duracion_minutos: origen.duracion_minutos,
      espacio: origen.espacio,
      educadores: origen.educadores,
      // La cantidad de equipos depende de la rama: se vuelve a la de la rama actual.
      equipos: fo.ficha.rama_id === f.ficha.rama_id ? origen.equipos : null,
      motivacion: origen.motivacion,
      objetivos: origen.objetivos,
      areas: origen.areas,
      materiales: json(origen.materiales),
      desarrollo: origen.desarrollo,
      asignado_a: usuarios.some((u) => u.id === s.usuarioId) ? s.usuarioId : null,
    };
    await crearAnexo(f, { ...datos, completo: origen.completo && faltantesAnexo({ titulo: datos.titulo, categoriaId: categoria, desarrollo: datos.desarrollo }).length === 0 });
    return reply.status(201).send(await respuesta(s, id));
  });

  // RF-095: anexos asignados al usuario que faltan completar.
  app.get('/yo/anexos-pendientes', async (req): Promise<AnexoPendienteDTO[]> => {
    const s = sesionDe(req);
    const grupos = [...new Set(s.asignaciones.map((a) => a.grupoId))];
    if (grupos.length === 0) return [];
    const filas = await deps.db
      .selectFrom('anexos as x')
      .innerJoin('fichas_actividad as fa', 'fa.id', 'x.ficha_actividad_id')
      .innerJoin('actividades as a', 'a.id', 'fa.actividad_id')
      .select(['x.id', 'x.numero', 'x.titulo', 'fa.id as ficha_id', 'fa.rama_id', 'a.nombre', 'a.inicio'])
      .where('x.asignado_a', '=', s.usuarioId)
      .where('x.completo', '=', false)
      .where('fa.grupo_id', 'in', grupos)
      .where('a.cancelada_en', 'is', null)
      .orderBy('a.inicio')
      .orderBy('x.numero')
      .execute();
    return filas.map((x) => ({ id: x.id, numero: x.numero, titulo: x.titulo, fichaActividadId: x.ficha_id, actividadNombre: x.nombre, inicio: x.inicio.toISOString(), ramaId: x.rama_id }));
  });

  // ---- PDF (RF-099 a RF-104)
  // Borrador en cualquier momento; final solo con los anexos de la grilla completos (RN-09).
  // La actividad conserva solo el último PDF generado (RF-103).
  app.post('/fichas-actividad/:id/pdf', async (req): Promise<{ pdf: PdfFichaDTO; ficha: FichaActividadDTO }> => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const { final } = z.object({ final: z.boolean() }).parse(req.body);
    const f = await cargarFichaActividad(deps.db, id);
    exigirEditarFicha(s, f);
    // Lo que se edite mientras se genera deja el PDF desactualizado.
    const generadoEn = deps.ahora();
    const dto = await serializarFichaActividad(deps.db, s, f);
    if (final) {
      const faltan = faltantesVersionFinal(dto);
      if (faltan.length) throw conflicto('FALTAN_DATOS', `No se puede generar la versión final. ${faltan.join('. ')}.`, { faltantes: faltan });
    }
    let logo: { datos: Buffer; mime: string } | null = null;
    if (dto.cabecera.logo) {
      const ar = await deps.db.selectFrom('archivos').select(['clave', 'mime']).where('id', '=', dto.cabecera.logo).executeTakeFirst();
      if (ar) logo = { datos: await deps.almacenamiento.leer(ar.clave), mime: ar.mime };
    }
    const datos = await generarPdfFicha(dto, { borrador: !final, logo });
    const clave = await deps.almacenamiento.guardar(datos);
    const archivo = await deps.db
      .insertInto('archivos')
      .values({ grupo_id: f.ficha.grupo_id, clave, nombre: nombrePdf(f.actividad.nombre), mime: 'application/pdf', tamano: datos.length })
      .returning('id')
      .executeTakeFirstOrThrow();
    await deps.db
      .updateTable('fichas_actividad')
      .set({ pdf_archivo_id: archivo.id, pdf_final: final, pdf_generado_en: generadoEn, estado: final ? 'final' : 'enCarga' })
      .where('id', '=', id)
      .execute();
    if (f.ficha.pdf_archivo_id) await borrarArchivo(f.ficha.pdf_archivo_id);
    const ficha = await respuesta(s, id);
    return { pdf: ficha.pdf!, ficha };
  });

  // RNF-022: enlace de 10 minutos para ver o compartir el PDF guardado (RF-104).
  app.get('/fichas-actividad/:id/pdf/enlace', async (req) => {
    const s = sesionDe(req);
    const { id } = pId.parse(req.params);
    const f = await cargarFichaActividad(deps.db, id);
    await exigirVerFicha(deps.db, s, f);
    if (!f.ficha.pdf_archivo_id) throw noEncontrado('Todavía no se generó el PDF');
    return { ...enlaceArchivo(deps, f.ficha.pdf_archivo_id), final: f.ficha.pdf_final };
  });
}
