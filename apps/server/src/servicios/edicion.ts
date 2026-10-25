import {
  CAMPOS_FICHA,
  CAMPOS_SENSIBLES,
  CODIGOS_ERROR,
  CONCEPTOS_CUOTA,
  DEF_CAMPO,
  erroresDeFormato,
  hoyAR,
  nombreCompleto,
  normalizarDni,
  normalizarTelefono,
  obligatoriosFaltantes,
  puede,
  puedeVerSensibles,
  sanearCuotas,
  valorCampoPropioValido,
  type CampoFicha,
  type CampoPropioDef,
  type Cuotas,
  type DatosFicha,
} from '@scouttracker/shared';
import type { Kysely, Transaction } from 'kysely';
import { z } from 'zod';
import { json, type BaseDeDatos, type FilaFicha } from '../db';
import { conflicto, ErrorHttp, sinPermiso, validacion } from '../errores';
import type { Sesion } from './acceso';
import {
  cargarNombres,
  COLUMNA,
  valorCuotaLegible,
  valorLegible,
  valorPropioLegible,
  type Nombres,
} from './fichas';

type Trx = Transaction<BaseDeDatos>;

const texto = z
  .string()
  .max(2000)
  .nullish()
  .transform((v) => (v === undefined ? undefined : v?.trim() || null));
const id = z
  .string()
  .nullish()
  .transform((v) => (v === undefined ? undefined : v || null))
  .refine((v) => v === undefined || v === null || z.string().uuid().safeParse(v).success, 'Valor inválido');
const numeroOTexto = z.union([z.string().max(50), z.number()]).nullish();
const fecha = z
  .string()
  .max(10)
  .nullish()
  .transform((v) => (v === undefined ? undefined : v || null));

/** Datos de la ficha tal como llegan de la app; normaliza DNI y teléfonos (RN-03, RD-009). */
export const esquemaDatosFicha = z
  .object({
    apellido: texto,
    nombre: texto,
    dni: numeroOTexto.transform((v) => (v === undefined ? undefined : normalizarDni(v))),
    fechaNacimiento: fecha,
    religionId: id,
    categoriaMiembroId: id,
    telEmergencia1: numeroOTexto.transform((v) => (v === undefined ? undefined : normalizarTelefono(v))),
    telEmergencia2: numeroOTexto.transform((v) => (v === undefined ? undefined : normalizarTelefono(v))),
    telPropio: numeroOTexto.transform((v) => (v === undefined ? undefined : normalizarTelefono(v))),
    equipoId: id,
    promesaId: id,
    etapaId: id,
    elementoId: id,
    raidId: id,
    cordi: z.enum(['coordinador', 'subcoordinador']).nullish(),
    guardianId: id,
    rolComunidad: texto,
    tieneTada: z.boolean().nullish(),
    mistica: texto,
    ingresoMovimientoId: id,
    fechaRevisionDiario: fecha,
  })
  .strict();

export const esquemaCuotas = z.record(z.string(), z.enum(['pagada', 'adeudada', 'exenta']).nullable());

const igual = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

export interface CambioRegistrado {
  campo: string;
  anterior: string | null;
  nuevo: string | null;
}

/** Verifica que los valores de catálogo y el equipo sean de la rama y estén activos (RF-008, RF-046). */
async function validarReferencias(
  trx: Trx,
  ramaId: string,
  nuevos: DatosFicha,
  anteriores: DatosFicha,
  errores: Record<string, string>,
) {
  const ids: { campo: CampoFicha; valor: string }[] = [];
  for (const c of CAMPOS_FICHA) {
    const def = DEF_CAMPO[c];
    const v = nuevos[c];
    if ((def.tipo === 'catalogo' || def.tipo === 'equipo') && v && !igual(v, anteriores[c])) ids.push({ campo: c, valor: String(v) });
  }
  if (ids.length === 0) return;
  const valores = ids.map((i) => i.valor);
  const [cat, eq] = await Promise.all([
    trx.selectFrom('catalogo_valores').select(['id', 'catalogo', 'activo']).where('rama_id', '=', ramaId).where('id', 'in', valores).execute(),
    trx.selectFrom('equipos').select(['id', 'activo']).where('rama_id', '=', ramaId).where('id', 'in', valores).execute(),
  ]);
  for (const i of ids) {
    const def = DEF_CAMPO[i.campo];
    if (def.tipo === 'equipo') {
      const e = eq.find((x) => x.id === i.valor);
      if (!e) errores[i.campo] = 'El equipo no es de esta rama';
      else if (!e.activo) errores[i.campo] = 'El equipo está desactivado';
    } else {
      const v = cat.find((x) => x.id === i.valor);
      if (!v || v.catalogo !== def.catalogo) errores[i.campo] = 'Valor inválido';
      else if (!v.activo) errores[i.campo] = 'Ese valor está desactivado';
    }
  }
}

function validarCamposPropios(
  defs: CampoPropioDef[],
  valores: Record<string, unknown>,
  sensibles: boolean,
  errores: Record<string, string>,
): void {
  for (const [k, v] of Object.entries(valores)) {
    const def = defs.find((d) => d.id === k);
    if (!def || !def.activo) {
      errores[`cp.${k}`] = 'Campo inexistente';
      continue;
    }
    if (def.sensible && !sensibles) throw sinPermiso('No tenés permiso para editar datos sensibles');
    if (!valorCampoPropioValido(def, v)) errores[`cp.${k}`] = `Valor inválido para ${def.nombre}`;
  }
}

/** RF-023: DNI único en el grupo, entre fichas activas y archivadas. */
export async function verificarDniLibre(trx: Trx, grupoId: string, dni: string, excepto?: string) {
  let q = trx
    .selectFrom('fichas as f')
    .innerJoin('ramas as r', 'r.id', 'f.rama_id')
    .select(['f.id', 'f.apellido', 'f.nombre', 'f.estado', 'r.nombre as rama'])
    .where('f.grupo_id', '=', grupoId)
    .where('f.dni', '=', dni);
  if (excepto) q = q.where('f.id', '!=', excepto);
  const otra = await q.executeTakeFirst();
  if (otra) {
    const estado = otra.estado === 'archivada' ? ', archivada' : '';
    throw conflicto(
      CODIGOS_ERROR.dniDuplicado,
      `Ese DNI ya lo tiene la ficha de ${nombreCompleto(otra)} (rama ${otra.rama}${estado})`,
      { fichaId: otra.id },
    );
  }
}

/** RN-11: un coordinador y un subcoordinador por equipo. Devuelve la ficha que hay que liberar. */
async function verificarCordi(
  trx: Trx,
  equipoId: string,
  cordi: 'coordinador' | 'subcoordinador',
  fichaId: string | null,
  reemplazar: boolean,
): Promise<FilaFicha | null> {
  let q = trx.selectFrom('fichas').selectAll().where('equipo_id', '=', equipoId).where('cordi', '=', cordi);
  if (fichaId) q = q.where('id', '!=', fichaId);
  const actual = await q.forUpdate().executeTakeFirst();
  if (!actual) return null;
  if (!reemplazar) {
    throw conflicto(
      CODIGOS_ERROR.confirmarReemplazo,
      `${nombreCompleto(actual)} ya es ${cordi} del equipo. ¿Querés reemplazarlo?`,
      { fichaId: actual.id },
    );
  }
  return actual;
}

async function liberarCordi(trx: Trx, otra: FilaFicha, usuarioId: string, nombres: Nombres) {
  await trx
    .updateTable('fichas')
    .set({ cordi: null, version: otra.version + 1, actualizado_en: new Date() })
    .where('id', '=', otra.id)
    .execute();
  await trx
    .insertInto('historial')
    .values({
      grupo_id: otra.grupo_id,
      ficha_id: otra.id,
      usuario_id: usuarioId,
      campo: 'cordi',
      valor_anterior: valorLegible('cordi', otra.cordi, nombres),
      valor_nuevo: null,
      version: otra.version + 1,
    })
    .execute();
}

export interface PedidoGuardado {
  datos: z.infer<typeof esquemaDatosFicha>;
  cuotas?: Cuotas;
  camposPropios?: Record<string, unknown>;
  reemplazarCordi?: boolean;
  /** El usuario revisó los valores marcados al importar: se descartan esos motivos (RF-050). */
  revisada?: boolean;
}

/**
 * Motivos de "Ficha incompleta" que siguen vigentes después de un guardado. Los de valores no
 * reconocidos al importar se descartan solo si se cargó ese campo o si el usuario marcó la ficha
 * como revisada; los de obligatorios se recalculan siempre (RF-050).
 */
export function motivosVigentes(motivos: string[], faltan: string[], etiquetasCambiadas: string[], revisada: boolean): string[] {
  const resueltos = (m: string) =>
    revisada ||
    etiquetasCambiadas.some(
      (e) => m.includes(`en ${e}:`) || m.endsWith(`en ${e}`) || (e === 'Tiene TADA' && m.includes('TADA')) || ((e === 'Cordi' || e === 'Equipo') && m.includes('cordi')),
    );
  return [...faltan.map((f) => `Falta ${f}`), ...motivos.filter((m) => !m.startsWith('Falta ') && !resueltos(m))];
}

/**
 * Valida y aplica un alta o una edición. Comprueba permisos por campo, referencias,
 * formatos, DNI único y cordi; registra cada cambio en el historial (RF-026).
 * Para un alta `actual` es null.
 */
export async function guardarFicha(
  trx: Trx,
  s: Sesion,
  rama: { id: string; grupo_id: string },
  actual: FilaFicha | null,
  pedido: PedidoGuardado,
  camposPropiosDefs: CampoPropioDef[],
  opciones: { campoEvento?: string; hoy?: string } = {},
): Promise<FilaFicha> {
  const anteriores: DatosFicha = actual ? Object.fromEntries(CAMPOS_FICHA.map((c) => [c, actual[COLUMNA[c]] ?? null])) : {};
  const cambiosDatos = Object.fromEntries(Object.entries(pedido.datos).filter(([, v]) => v !== undefined)) as DatosFicha;
  const nuevos: DatosFicha = { ...anteriores, ...cambiosDatos };
  if (nuevos.tieneTada === null || nuevos.tieneTada === undefined) nuevos.tieneTada = false;

  // Al cambiar de equipo se pierde la función de cordi, salvo que se indique de nuevo.
  if (actual && !igual(nuevos.equipoId, anteriores.equipoId) && pedido.datos.cordi === undefined) nuevos.cordi = null;

  const objetivoAnterior = actual ? { grupoId: rama.grupo_id, ramaId: rama.id, equipoId: actual.equipo_id } : null;
  const objetivoNuevo = { grupoId: rama.grupo_id, ramaId: rama.id, equipoId: nuevos.equipoId ?? null };

  const cambiaFicha = Object.keys(cambiosDatos).length > 0 || Object.keys(pedido.camposPropios ?? {}).length > 0 || pedido.revisada === true;
  if (actual) {
    if (cambiaFicha && !puede(s.asignaciones, 'padron', 'editar', objetivoAnterior!)) throw sinPermiso('No tenés permiso para editar esta ficha');
    if (!igual(nuevos.equipoId, anteriores.equipoId) && !puede(s.asignaciones, 'padron', 'editar', objetivoNuevo)) {
      throw sinPermiso('No podés pasar la ficha a un equipo fuera de tu alcance');
    }
  } else if (!puede(s.asignaciones, 'padron', 'crear', objetivoNuevo)) {
    throw sinPermiso('No tenés permiso para crear fichas aquí');
  }
  const objetivoPermisos = objetivoAnterior ?? objetivoNuevo;
  if (pedido.cuotas && !puede(s.asignaciones, 'cuotas', 'editar', objetivoPermisos)) throw sinPermiso('No tenés permiso para editar cuotas');

  // RF-020: los datos sensibles solo se editan con el permiso. En el alta se aceptan
  // porque los obligatorios incluyen DNI y teléfono, y cargarlos no expone nada.
  const sensibles = puedeVerSensibles(s.asignaciones, objetivoPermisos);
  if (actual && !sensibles) {
    for (const c of CAMPOS_SENSIBLES) {
      if (c in cambiosDatos && !igual(cambiosDatos[c], anteriores[c])) throw sinPermiso('No tenés permiso para editar datos sensibles');
    }
  }

  const hoy = opciones.hoy ?? hoyAR();
  const errores: Record<string, string> = { ...(erroresDeFormato(nuevos, hoy) as Record<string, string>) };
  // RF-037: "Tiene TADA" ya cargado no bloquea otras ediciones; solo se valida si cambia.
  if (actual && igual(nuevos.tieneTada, anteriores.tieneTada) && igual(nuevos.fechaNacimiento, anteriores.fechaNacimiento)) delete errores.tieneTada;
  await validarReferencias(trx, rama.id, nuevos, anteriores, errores);
  validarCamposPropios(camposPropiosDefs, pedido.camposPropios ?? {}, sensibles || !actual, errores);
  if (Object.keys(errores).length > 0) throw validacion('Revisá los datos marcados', errores);

  const faltan = obligatoriosFaltantes(nuevos);
  let estado = actual?.estado ?? 'activa';
  let motivos = actual?.incompleta_motivos ?? [];
  if (estado === 'activa' && faltan.length > 0) {
    throw validacion(`Faltan datos obligatorios: ${faltan.join(', ')}`, Object.fromEntries(faltan.map((f) => [f, 'Obligatorio'])));
  }
  if (estado === 'incompleta') {
    const etiquetas = [
      ...Object.keys(cambiosDatos).map((c) => DEF_CAMPO[c as CampoFicha]?.etiqueta ?? c),
      ...Object.keys(pedido.cuotas ?? {}).map((c) => `cuota ${c}`),
    ];
    motivos = motivosVigentes(motivos, faltan, etiquetas, pedido.revisada === true);
    if (motivos.length === 0) estado = 'activa';
  }

  if (nuevos.dni && !igual(nuevos.dni, anteriores.dni)) await verificarDniLibre(trx, rama.grupo_id, nuevos.dni, actual?.id);

  const nombres = await cargarNombres(trx, rama.id);
  let liberar: FilaFicha | null = null;
  if (nuevos.cordi && nuevos.equipoId && (!igual(nuevos.cordi, anteriores.cordi) || !igual(nuevos.equipoId, anteriores.equipoId))) {
    liberar = await verificarCordi(trx, nuevos.equipoId, nuevos.cordi, actual?.id ?? null, pedido.reemplazarCordi === true);
  }
  if (liberar) await liberarCordi(trx, liberar, s.usuarioId, nombres);

  // Diferencias para el historial.
  const cambios: CambioRegistrado[] = [];
  for (const c of CAMPOS_FICHA) {
    if (!igual(nuevos[c], anteriores[c]) && !(actual === null && (nuevos[c] === null || nuevos[c] === false))) {
      cambios.push({ campo: c, anterior: valorLegible(c, anteriores[c], nombres), nuevo: valorLegible(c, nuevos[c], nombres) });
    }
  }
  const cuotasAnteriores = sanearCuotas(actual?.cuotas ?? {});
  const cuotasNuevas = { ...cuotasAnteriores, ...sanearCuotas(pedido.cuotas ?? {}) };
  for (const c of CONCEPTOS_CUOTA) {
    if (!igual(cuotasNuevas[c], cuotasAnteriores[c])) {
      cambios.push({ campo: `cuota.${c}`, anterior: valorCuotaLegible(cuotasAnteriores[c]), nuevo: valorCuotaLegible(cuotasNuevas[c]) });
    }
  }
  const propiosAnteriores = actual?.campos_propios ?? {};
  const propiosNuevos: Record<string, unknown> = { ...propiosAnteriores };
  for (const [k, v] of Object.entries(pedido.camposPropios ?? {})) {
    const valor = v === '' ? null : v;
    if (!igual(valor, propiosAnteriores[k])) {
      cambios.push({ campo: `cp.${k}`, anterior: valorPropioLegible(propiosAnteriores[k]), nuevo: valorPropioLegible(valor) });
    }
    if (valor === null) delete propiosNuevos[k];
    else propiosNuevos[k] = valor;
  }
  if (actual && estado !== actual.estado) cambios.push({ campo: '_estado', anterior: actual.estado, nuevo: estado });

  const columnas: Record<string, unknown> = {};
  for (const c of CAMPOS_FICHA) columnas[COLUMNA[c]] = nuevos[c] ?? null;
  columnas.tiene_tada = nuevos.tieneTada === true;

  let fila: FilaFicha;
  if (actual) {
    const mismosMotivos = motivos.length === actual.incompleta_motivos.length && motivos.every((m, i) => m === actual.incompleta_motivos[i]);
    if (cambios.length === 0 && mismosMotivos) return actual;
    fila = await trx
      .updateTable('fichas')
      .set({
        ...columnas,
        estado,
        incompleta_motivos: motivos,
        cuotas: json(cuotasNuevas),
        campos_propios: json(propiosNuevos),
        version: actual.version + 1,
        actualizado_en: new Date(),
      })
      .where('id', '=', actual.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  } else {
    fila = await trx
      .insertInto('fichas')
      .values({
        ...(columnas as object),
        grupo_id: rama.grupo_id,
        rama_id: rama.id,
        estado,
        incompleta_motivos: motivos,
        cuotas: json(cuotasNuevas),
        campos_propios: json(propiosNuevos),
      } as never)
      .returningAll()
      .executeTakeFirstOrThrow();
    cambios.unshift({ campo: opciones.campoEvento ?? '_alta', anterior: null, nuevo: null });
  }
  if (cambios.length === 0) return fila;
  await trx
    .insertInto('historial')
    .values(
      cambios.map((c) => ({
        grupo_id: rama.grupo_id,
        ficha_id: fila.id,
        usuario_id: s.usuarioId,
        campo: c.campo,
        valor_anterior: c.anterior,
        valor_nuevo: c.nuevo,
        version: fila.version,
      })),
    )
    .execute();
  return fila;
}

/** Errores de unicidad de la base que pueden escaparse por carreras entre dos guardados. */
export function traducirErrorUnico(e: unknown): never {
  const err = e as { code?: string; constraint?: string };
  if (err.code === '23505' && err.constraint === 'fichas_dni_grupo') {
    throw conflicto(CODIGOS_ERROR.dniDuplicado, 'Ese DNI ya existe en el grupo');
  }
  if (err.code === '23505' && err.constraint === 'fichas_cordi_equipo') {
    throw conflicto(CODIGOS_ERROR.confirmarReemplazo, 'El equipo ya tiene esa función de cordi asignada');
  }
  throw e;
}


/**
 * Al registrar un documento de una ficha incompleta se descarta el motivo de ese documento y,
 * si no queda ninguno, la ficha pasa a activa (RF-050).
 */
export async function reevaluarIncompleta(db: Kysely<BaseDeDatos>, fichaId: string, etiqueta: string): Promise<void> {
  const f = await db.selectFrom('fichas').selectAll().where('id', '=', fichaId).executeTakeFirstOrThrow();
  if (f.estado !== 'incompleta') return;
  const datos = Object.fromEntries(CAMPOS_FICHA.map((c) => [c, f[COLUMNA[c]] ?? null])) as DatosFicha;
  const motivos = motivosVigentes(f.incompleta_motivos, obligatoriosFaltantes(datos), [etiqueta], false);
  if (motivos.length === f.incompleta_motivos.length) return;
  await db
    .updateTable('fichas')
    .set({ incompleta_motivos: motivos, estado: motivos.length ? 'incompleta' : 'activa', actualizado_en: new Date() })
    .where('id', '=', fichaId)
    .execute();
}
