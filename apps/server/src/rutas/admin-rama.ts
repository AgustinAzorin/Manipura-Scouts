import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  CAMPOS_OCULTABLES,
  CATALOGOS,
  CATALOGOS_CON_LOGO,
  DEF_CAMPOS,
  normalizarTexto,
  TIPOS_CAMPO_PROPIO,
  type RamaConfigDTO,
} from '@scouttracker/shared';
import { sesionDe, type Dependencias } from '../app';
import { conflicto, noEncontrado, validacion } from '../errores';
import { exigirAdminRama } from '../servicios/acceso';
import { cargarRama, configRama } from '../servicios/fichas';
import { leerArchivoSubido } from '../servicios/subidas';

const pRama = z.object({ ramaId: z.string().uuid() });
const pId = z.object({ id: z.string().uuid() });
const TAMANO_MAXIMO_LOGO = 1024 * 1024;
const TIPOS_LOGO = ['image/png', 'image/jpeg'] as const;

const esUnico = (e: unknown) => (e as { code?: string }).code === '23505';

/** Configuración de cada rama: equipos, catálogos, logos, campos ocultos y campos propios. */
export async function rutasAdminRama(app: FastifyInstance, deps: Dependencias) {
  /** Busca un registro de una tabla con rama y verifica permiso de administración sobre ella. */
  async function deRama(tabla: 'equipos' | 'catalogo_valores' | 'campos_propios', id: string, req: Parameters<typeof sesionDe>[0]) {
    const fila = await deps.db.selectFrom(tabla).select(['id', 'rama_id', 'grupo_id']).where('id', '=', id).executeTakeFirst();
    if (!fila) throw noEncontrado();
    const rama = await cargarRama(deps.db, fila.rama_id);
    exigirAdminRama(sesionDe(req), rama.grupo_id, rama.id);
    return rama;
  }

  async function ramaAdministrada(ramaId: string, req: Parameters<typeof sesionDe>[0]) {
    const rama = await cargarRama(deps.db, ramaId);
    exigirAdminRama(sesionDe(req), rama.grupo_id, rama.id);
    return rama;
  }

  async function guardarLogo(
    req: Parameters<typeof sesionDe>[0],
    grupoId: string,
    anterior: string | null,
  ): Promise<string> {
    const archivo = await leerArchivoSubido(req, { tiposPermitidos: TIPOS_LOGO, tamanoMaximo: TAMANO_MAXIMO_LOGO });
    const clave = await deps.almacenamiento.guardar(archivo.datos);
    const a = await deps.db
      .insertInto('archivos')
      .values({ grupo_id: grupoId, clave, nombre: archivo.nombre, mime: archivo.mime, tamano: archivo.datos.length })
      .returning('id')
      .executeTakeFirstOrThrow();
    if (anterior) await borrarArchivo(anterior);
    return a.id;
  }

  async function borrarArchivo(archivoId: string) {
    const a = await deps.db.deleteFrom('archivos').where('id', '=', archivoId).returning('clave').executeTakeFirst();
    if (a) await deps.almacenamiento.borrar(a.clave);
  }

  app.get('/ramas/:ramaId/config', async (req): Promise<RamaConfigDTO> => {
    const { ramaId } = pRama.parse(req.params);
    return configRama(deps.db, await ramaAdministrada(ramaId, req));
  });

  // ---- Equipos (RF-006 a RF-008)
  app.post('/ramas/:ramaId/equipos', async (req, reply) => {
    const { ramaId } = pRama.parse(req.params);
    const rama = await ramaAdministrada(ramaId, req);
    const { nombre } = z.object({ nombre: z.string().trim().min(1).max(100) }).parse(req.body);
    try {
      const e = await deps.db.insertInto('equipos').values({ grupo_id: rama.grupo_id, rama_id: rama.id, nombre }).returning('id').executeTakeFirstOrThrow();
      return reply.status(201).send({ id: e.id });
    } catch (e) {
      if (esUnico(e)) throw conflicto('NOMBRE_REPETIDO', 'Ya hay un equipo con ese nombre en la rama');
      throw e;
    }
  });

  app.patch('/equipos/:id', async (req) => {
    const { id } = pId.parse(req.params);
    await deRama('equipos', id, req);
    const { nombre } = z.object({ nombre: z.string().trim().min(1).max(100) }).parse(req.body);
    try {
      await deps.db.updateTable('equipos').set({ nombre }).where('id', '=', id).execute();
    } catch (e) {
      if (esUnico(e)) throw conflicto('NOMBRE_REPETIDO', 'Ya hay un equipo con ese nombre en la rama');
      throw e;
    }
    return { ok: true };
  });

  // RN-20: los integrantes lo conservan como inactivo 90 días; después la tarea diaria lo elimina.
  app.post('/equipos/:id/desactivar', async (req) => {
    const { id } = pId.parse(req.params);
    await deRama('equipos', id, req);
    await deps.db.updateTable('equipos').set({ activo: false, desactivado_en: deps.ahora() }).where('id', '=', id).where('activo', '=', true).execute();
    return { ok: true };
  });

  app.post('/equipos/:id/reactivar', async (req) => {
    const { id } = pId.parse(req.params);
    await deRama('equipos', id, req);
    await deps.db.updateTable('equipos').set({ activo: true, desactivado_en: null }).where('id', '=', id).execute();
    return { ok: true };
  });

  app.post('/equipos/:id/logo', async (req) => {
    const { id } = pId.parse(req.params);
    const rama = await deRama('equipos', id, req);
    const e = await deps.db.selectFrom('equipos').select('logo_archivo_id').where('id', '=', id).executeTakeFirstOrThrow();
    const logo = await guardarLogo(req, rama.grupo_id, e.logo_archivo_id);
    await deps.db.updateTable('equipos').set({ logo_archivo_id: logo }).where('id', '=', id).execute();
    return { logo };
  });

  app.delete('/equipos/:id/logo', async (req) => {
    const { id } = pId.parse(req.params);
    await deRama('equipos', id, req);
    const e = await deps.db.selectFrom('equipos').select('logo_archivo_id').where('id', '=', id).executeTakeFirstOrThrow();
    await deps.db.updateTable('equipos').set({ logo_archivo_id: null }).where('id', '=', id).execute();
    if (e.logo_archivo_id) await borrarArchivo(e.logo_archivo_id);
    return { ok: true };
  });

  // ---- Catálogos (RF-044 a RF-047)
  app.post('/ramas/:ramaId/catalogos', async (req, reply) => {
    const { ramaId } = pRama.parse(req.params);
    const rama = await ramaAdministrada(ramaId, req);
    const d = z
      .object({ catalogo: z.enum(CATALOGOS), nombre: z.string().trim().min(1).max(100), esAdulto: z.boolean().optional() })
      .parse(req.body);
    const ultimo = await deps.db
      .selectFrom('catalogo_valores')
      .select((eb) => eb.fn.max('orden').as('orden'))
      .where('rama_id', '=', rama.id)
      .where('catalogo', '=', d.catalogo)
      .executeTakeFirst();
    try {
      const v = await deps.db
        .insertInto('catalogo_valores')
        .values({
          grupo_id: rama.grupo_id,
          rama_id: rama.id,
          catalogo: d.catalogo,
          nombre: d.nombre,
          orden: (ultimo?.orden ?? 0) + 1,
          es_adulto: d.catalogo === 'categoriaMiembro' && d.esAdulto === true,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return reply.status(201).send({ id: v.id });
    } catch (e) {
      if (esUnico(e)) throw conflicto('NOMBRE_REPETIDO', 'Ese valor ya existe en el catálogo');
      throw e;
    }
  });

  // RF-045 (renombrar), RF-046 (desactivar): las fichas guardan el id, así que muestran el nombre nuevo
  // y conservan un valor desactivado.
  app.patch('/catalogo-valores/:id', async (req) => {
    const { id } = pId.parse(req.params);
    await deRama('catalogo_valores', id, req);
    const d = z
      .object({
        nombre: z.string().trim().min(1).max(100).optional(),
        activo: z.boolean().optional(),
        orden: z.number().int().min(0).max(10_000).optional(),
        esAdulto: z.boolean().optional(),
      })
      .parse(req.body);
    const v = await deps.db.selectFrom('catalogo_valores').select('catalogo').where('id', '=', id).executeTakeFirstOrThrow();
    const cambios: { nombre?: string; activo?: boolean; orden?: number; es_adulto?: boolean } = {};
    if (d.nombre !== undefined) cambios.nombre = d.nombre;
    if (d.activo !== undefined) cambios.activo = d.activo;
    if (d.orden !== undefined) cambios.orden = d.orden;
    if (d.esAdulto !== undefined && v.catalogo === 'categoriaMiembro') cambios.es_adulto = d.esAdulto;
    if (Object.keys(cambios).length === 0) return { ok: true };
    try {
      await deps.db.updateTable('catalogo_valores').set(cambios).where('id', '=', id).execute();
    } catch (e) {
      if (esUnico(e)) throw conflicto('NOMBRE_REPETIDO', 'Ese valor ya existe en el catálogo');
      throw e;
    }
    return { ok: true };
  });

  app.post('/catalogo-valores/:id/logo', async (req) => {
    const { id } = pId.parse(req.params);
    const rama = await deRama('catalogo_valores', id, req);
    const v = await deps.db.selectFrom('catalogo_valores').select(['catalogo', 'logo_archivo_id']).where('id', '=', id).executeTakeFirstOrThrow();
    if (!(CATALOGOS_CON_LOGO as readonly string[]).includes(v.catalogo)) throw validacion('Solo Elemento y Promesa llevan logo');
    const logo = await guardarLogo(req, rama.grupo_id, v.logo_archivo_id);
    await deps.db.updateTable('catalogo_valores').set({ logo_archivo_id: logo }).where('id', '=', id).execute();
    return { logo };
  });

  app.delete('/catalogo-valores/:id/logo', async (req) => {
    const { id } = pId.parse(req.params);
    await deRama('catalogo_valores', id, req);
    const v = await deps.db.selectFrom('catalogo_valores').select('logo_archivo_id').where('id', '=', id).executeTakeFirstOrThrow();
    await deps.db.updateTable('catalogo_valores').set({ logo_archivo_id: null }).where('id', '=', id).execute();
    if (v.logo_archivo_id) await borrarArchivo(v.logo_archivo_id);
    return { ok: true };
  });

  // ---- Campos ocultos (RF-048)
  app.put('/ramas/:ramaId/campos-ocultos', async (req) => {
    const { ramaId } = pRama.parse(req.params);
    const rama = await ramaAdministrada(ramaId, req);
    const { campos } = z.object({ campos: z.array(z.string()) }).parse(req.body);
    const invalidos = campos.filter((c) => !(CAMPOS_OCULTABLES as readonly string[]).includes(c));
    if (invalidos.length > 0) throw validacion(`Estos campos no se pueden ocultar: ${invalidos.join(', ')}`);
    await deps.db.updateTable('ramas').set({ campos_ocultos: [...new Set(campos)] }).where('id', '=', rama.id).execute();
    return { ok: true };
  });

  // ---- Campos propios (RF-119, RF-120)
  async function nombreDisponible(ramaId: string, nombre: string, excepto?: string) {
    const n = normalizarTexto(nombre);
    if (DEF_CAMPOS.some((d) => normalizarTexto(d.etiqueta) === n) || ['edad', 'estado de tada', 'cumpleanos', 'va'].includes(n)) {
      throw conflicto('NOMBRE_REPETIDO', 'Ya existe un campo con ese nombre en la ficha');
    }
    const otros = await deps.db.selectFrom('campos_propios').select(['id', 'nombre']).where('rama_id', '=', ramaId).execute();
    if (otros.some((o) => o.id !== excepto && normalizarTexto(o.nombre) === n)) {
      throw conflicto('NOMBRE_REPETIDO', 'Ya existe un campo con ese nombre en la rama');
    }
  }

  const esquemaOpciones = z.array(z.string().trim().min(1).max(100)).max(100);

  app.post('/ramas/:ramaId/campos-propios', async (req, reply) => {
    const { ramaId } = pRama.parse(req.params);
    const rama = await ramaAdministrada(ramaId, req);
    const d = z
      .object({
        nombre: z.string().trim().min(1).max(100),
        tipo: z.enum(TIPOS_CAMPO_PROPIO),
        seccion: z.enum(['datosPersonales', 'contacto', 'organizacion', 'progresion']),
        sensible: z.boolean(),
        opciones: esquemaOpciones.optional(),
      })
      .parse(req.body);
    const opciones = d.tipo === 'lista' ? [...new Set(d.opciones ?? [])] : [];
    if (d.tipo === 'lista' && opciones.length === 0) throw validacion('Una lista necesita al menos un valor', { opciones: 'Requerido' });
    await nombreDisponible(rama.id, d.nombre);
    const c = await deps.db
      .insertInto('campos_propios')
      .values({ grupo_id: rama.grupo_id, rama_id: rama.id, nombre: d.nombre, tipo: d.tipo, seccion: d.seccion, sensible: d.sensible, opciones })
      .returning('id')
      .executeTakeFirstOrThrow()
      .catch((e) => {
        if (esUnico(e)) throw conflicto('NOMBRE_REPETIDO', 'Ya existe un campo con ese nombre en la rama');
        throw e;
      });
    return reply.status(201).send({ id: c.id });
  });

  // RF-120: desactivar oculta el campo y conserva los valores cargados.
  app.patch('/campos-propios/:id', async (req) => {
    const { id } = pId.parse(req.params);
    const rama = await deRama('campos_propios', id, req);
    const d = z
      .object({ nombre: z.string().trim().min(1).max(100).optional(), opciones: esquemaOpciones.optional(), activo: z.boolean().optional() })
      .parse(req.body);
    const actual = await deps.db.selectFrom('campos_propios').select(['tipo', 'opciones']).where('id', '=', id).executeTakeFirstOrThrow();
    const cambios: { nombre?: string; opciones?: string[]; activo?: boolean } = {};
    if (d.nombre !== undefined) {
      await nombreDisponible(rama.id, d.nombre, id);
      cambios.nombre = d.nombre;
    }
    if (d.opciones !== undefined) {
      if (actual.tipo !== 'lista') throw validacion('Solo los campos de tipo lista tienen valores');
      const opciones = [...new Set(d.opciones)];
      // Se pueden agregar valores; quitar uno que ya está cargado dejaría fichas con un valor inválido.
      const quitados = actual.opciones.filter((o) => !opciones.includes(o));
      if (quitados.length > 0) {
        const usados = await deps.db
          .selectFrom('fichas')
          .select('id')
          .where('rama_id', '=', rama.id)
          .where(sql<string>`campos_propios ->> ${id}`, 'in', quitados)
          .executeTakeFirst();
        if (usados) throw conflicto('VALOR_EN_USO', 'Hay fichas que usan alguno de los valores que querés quitar');
      }
      cambios.opciones = opciones;
    }
    if (d.activo !== undefined) cambios.activo = d.activo;
    if (Object.keys(cambios).length > 0) await deps.db.updateTable('campos_propios').set(cambios).where('id', '=', id).execute();
    return { ok: true };
  });
}
