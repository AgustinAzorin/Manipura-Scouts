/** Nómina: columnas, filtros, búsqueda y orden (RF-029 a RF-034). Se ejecuta en el dispositivo. */
import { confirmacionesProximas, NOMBRE_CONFIRMACION, type ActividadDTO, type Confirmacion } from './actividades';
import type { CatalogoValorDTO, EquipoDTO, FichaDTO, RamaConfigDTO } from './api';
import { calcularEdad, diaCumpleanios, formatearEdad, formatearFecha, hoyAR, type FechaISO } from './fechas';
import {
  DEF_CAMPO,
  NOMBRE_CORDI,
  NOMBRE_ESTADO_TADA,
  estadoTada,
  type CampoFicha,
  type Catalogo,
  type EstadoTada,
} from './ficha';
import { coincideBusqueda, compararNombres, nombreCompleto } from './normalizar';

export interface DefColumna {
  id: string;
  etiqueta: string;
  /** Campo de la ficha del que depende: si la rama lo oculta, la columna no está disponible (RF-048). */
  campo: CampoFicha | null;
  sensible: boolean;
  ancho: number;
  /** Muestra el logo del valor (RI-003). */
  conLogo?: Catalogo;
}

const col = (id: string, etiqueta: string, campo: CampoFicha | null, ancho: number, extra: Partial<DefColumna> = {}): DefColumna => ({
  id,
  etiqueta,
  campo,
  sensible: campo ? DEF_CAMPO[campo].sensible : false,
  ancho,
  ...extra,
});

/** Todas las columnas fijas. La columna Nombre siempre está y queda fija al desplazar. */
export const COLUMNAS_BASE: readonly DefColumna[] = [
  col('nombre', 'Nombre', null, 170),
  col('equipo', 'Equipo', 'equipoId', 130),
  col('elemento', 'Elemento', 'elementoId', 120, { conLogo: 'elemento' }),
  col('promesa', 'Promesa', 'promesaId', 170, { conLogo: 'promesa' }),
  col('etapa', 'Etapa', 'etapaId', 130),
  col('edad', 'Edad', null, 70),
  col('tada', 'TADA', 'tieneTada', 110),
  col('va', 'Va', null, 110),
  col('dni', 'DNI', 'dni', 110),
  col('fechaNacimiento', 'Nacimiento', 'fechaNacimiento', 120),
  col('cumpleanios', 'Cumpleaños', null, 110),
  col('telEmergencia1', 'Tel. emergencia 1', 'telEmergencia1', 140),
  col('telEmergencia2', 'Tel. emergencia 2', 'telEmergencia2', 140),
  col('telPropio', 'Tel. propio', 'telPropio', 130),
  col('religion', 'Religión', 'religionId', 120),
  col('categoriaMiembro', 'Categoría', 'categoriaMiembroId', 130),
  col('raid', 'Raid', 'raidId', 80),
  col('cordi', 'Cordi', 'cordi', 130),
  col('guardian', 'Guardián', 'guardianId', 110),
  col('rolComunidad', 'Rol en la comunidad', 'rolComunidad', 160),
  col('mistica', 'Mística', 'mistica', 140),
  col('ingresoMovimiento', 'Ingreso al movimiento', 'ingresoMovimientoId', 160),
  col('fechaRevisionDiario', 'Revisión diario', 'fechaRevisionDiario', 130),
  col('estado', 'Estado de la ficha', null, 130),
];

/** RF-029: columnas visibles por defecto. */
export const COLUMNAS_POR_DEFECTO = ['nombre', 'equipo', 'elemento', 'promesa', 'etapa', 'edad', 'tada', 'va'];

const CAMPO_DE_CATALOGO: Record<string, CampoFicha> = {
  elemento: 'elementoId',
  promesa: 'promesaId',
  etapa: 'etapaId',
  religion: 'religionId',
  categoriaMiembro: 'categoriaMiembroId',
  raid: 'raidId',
  guardian: 'guardianId',
  ingresoMovimiento: 'ingresoMovimientoId',
};

/**
 * RF-030 / RF-048 / RF-119: columnas que puede elegir el usuario en esta rama. Sin el permiso de
 * datos sensibles las columnas sensibles no se ofrecen.
 */
export function columnasDisponibles(rama: RamaConfigDTO, verSensibles: boolean): DefColumna[] {
  const ocultos = new Set<string>(rama.camposOcultos);
  const base = COLUMNAS_BASE.filter((c) => (!c.campo || !ocultos.has(c.campo)) && (verSensibles || !c.sensible));
  const propios = rama.camposPropios
    .filter((c) => c.activo && (verSensibles || !c.sensible))
    .map((c): DefColumna => ({ id: `cp:${c.id}`, etiqueta: c.nombre, campo: null, sensible: c.sensible, ancho: 140 }));
  return [...base, ...propios];
}

/** Índices para resolver nombres de catálogo y equipos sin recorrer listas. */
export interface IndiceRama {
  rama: RamaConfigDTO;
  valores: Map<string, CatalogoValorDTO>;
  equipos: Map<string, EquipoDTO>;
  /** RF-067: confirmación de cada ficha para su próxima actividad. */
  va: Map<string, Confirmacion>;
}

export function indexarRama(rama: RamaConfigDTO, actividades: ActividadDTO[] = [], ahora: Date = new Date()): IndiceRama {
  return {
    rama,
    valores: new Map(rama.catalogos.map((v) => [v.id, v])),
    equipos: new Map(rama.equipos.map((e) => [e.id, e])),
    va: confirmacionesProximas(actividades, ahora),
  };
}

export interface ValorCelda {
  texto: string;
  /** Valor para ordenar: número o texto. */
  orden: number | string;
  /** Id del logo (versión) si la columna lleva logo. */
  logo?: string | null;
  /** Equipo desactivado que el integrante conserva (RN-20). */
  inactivo?: boolean;
}

const VACIO: ValorCelda = { texto: '', orden: '' };

export function edadDe(f: FichaDTO, hoy: FechaISO): number | null {
  return f.fechaNacimiento ? calcularEdad(f.fechaNacimiento, hoy) : null;
}

export function estadoTadaDe(f: FichaDTO, hoy: FechaISO): EstadoTada | null {
  return estadoTada(edadDe(f, hoy), f.tieneTada);
}

export function valorColumna(f: FichaDTO, columna: string, ix: IndiceRama, hoy: FechaISO = hoyAR()): ValorCelda {
  const catalogo = (id: string | null | undefined): ValorCelda => {
    const v = id ? ix.valores.get(id) : undefined;
    return v ? { texto: v.nombre, orden: v.nombre.toLowerCase(), logo: v.logo, inactivo: !v.activo } : VACIO;
  };
  if (columna.startsWith('cp:')) {
    const v = f.camposPropios[columna.slice(3)];
    if (v === undefined || v === null || v === '') return VACIO;
    if (typeof v === 'boolean') return { texto: v ? 'Sí' : 'No', orden: v ? 1 : 0 };
    const s = String(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? { texto: formatearFecha(s), orden: s } : { texto: s, orden: s.toLowerCase() };
  }
  switch (columna) {
    case 'nombre': {
      const texto = nombreCompleto(f);
      return { texto, orden: texto.toLowerCase() };
    }
    case 'equipo': {
      const e = f.equipoId ? ix.equipos.get(f.equipoId) : undefined;
      return e ? { texto: e.nombre, orden: e.nombre.toLowerCase(), logo: e.logo, inactivo: !e.activo } : { texto: 'Sin equipo', orden: '￿' };
    }
    case 'edad': {
      const edad = edadDe(f, hoy);
      return edad === null ? { texto: '', orden: -1 } : { texto: formatearEdad(edad), orden: edad };
    }
    case 'tada': {
      const t = estadoTadaDe(f, hoy);
      return t ? { texto: NOMBRE_ESTADO_TADA[t], orden: t === 'tiene' ? 2 : t === 'puedeHacer' ? 1 : 0 } : VACIO;
    }
    // RF-067: sin próxima actividad en la que esté inscripto, "—".
    case 'va': {
      const c = ix.va.get(f.id);
      return c ? { texto: NOMBRE_CONFIRMACION[c], orden: c === 'va' ? 0 : c === 'sinRespuesta' ? 1 : 2 } : { texto: '—', orden: 3 };
    }
    case 'dni':
      return f.dni ? { texto: f.dni, orden: f.dni.padStart(10, '0') } : VACIO;
    case 'fechaNacimiento':
      return f.fechaNacimiento ? { texto: formatearFecha(f.fechaNacimiento), orden: f.fechaNacimiento } : VACIO;
    case 'fechaRevisionDiario':
      return f.fechaRevisionDiario ? { texto: formatearFecha(f.fechaRevisionDiario), orden: f.fechaRevisionDiario } : VACIO;
    case 'cumpleanios':
      return f.fechaNacimiento ? { texto: diaCumpleanios(f.fechaNacimiento), orden: f.fechaNacimiento.slice(5) } : VACIO;
    case 'cordi':
      return f.cordi ? { texto: NOMBRE_CORDI[f.cordi], orden: f.cordi } : VACIO;
    case 'estado':
      return { texto: f.estado === 'incompleta' ? 'Incompleta' : 'Completa', orden: f.estado };
    case 'telEmergencia1':
    case 'telEmergencia2':
    case 'telPropio':
    case 'rolComunidad':
    case 'mistica': {
      const v = f[columna];
      return v ? { texto: v, orden: v.toLowerCase() } : VACIO;
    }
    default: {
      const campo = CAMPO_DE_CATALOGO[columna];
      return campo ? catalogo(f[campo] as string | null | undefined) : VACIO;
    }
  }
}

// ---------------------------------------------------------------------------
// Filtros (RF-031)

/** Valor especial para filtrar fichas sin valor (por ejemplo "Sin equipo"). */
export const SIN_VALOR = '__sin__';

export interface FiltrosNomina {
  equipo?: string[];
  elemento?: string[];
  etapa?: string[];
  promesa?: string[];
  tada?: EstadoTada[];
  edadDesde?: number | null;
  edadHasta?: number | null;
  /** Campos propios de tipo lista o sí/no: id del campo → valores aceptados ("true"/"false" para sí/no). */
  propios?: Record<string, string[]>;
  /** Solo fichas incompletas (pendiente de RF-050). */
  soloIncompletas?: boolean;
}

export function hayFiltros(f: FiltrosNomina): boolean {
  return (
    !!f.equipo?.length ||
    !!f.elemento?.length ||
    !!f.etapa?.length ||
    !!f.promesa?.length ||
    !!f.tada?.length ||
    (f.edadDesde ?? null) !== null ||
    (f.edadHasta ?? null) !== null ||
    Object.values(f.propios ?? {}).some((v) => v.length > 0) ||
    !!f.soloIncompletas
  );
}

const enLista = (lista: string[] | undefined, valor: string | null | undefined) =>
  !lista?.length || lista.includes(valor ?? SIN_VALOR);

export function cumpleFiltros(ficha: FichaDTO, filtros: FiltrosNomina, hoy: FechaISO): boolean {
  if (filtros.soloIncompletas && ficha.estado !== 'incompleta') return false;
  if (!enLista(filtros.equipo, ficha.equipoId)) return false;
  if (!enLista(filtros.elemento, ficha.elementoId)) return false;
  if (!enLista(filtros.etapa, ficha.etapaId)) return false;
  if (!enLista(filtros.promesa, ficha.promesaId)) return false;
  if (filtros.tada?.length) {
    const t = estadoTadaDe(ficha, hoy);
    if (!t || !filtros.tada.includes(t)) return false;
  }
  if (filtros.edadDesde != null || filtros.edadHasta != null) {
    // "Edad de 16 a 17" incluye a quienes tienen 16 o 17 años cumplidos.
    const edad = edadDe(ficha, hoy);
    if (edad === null) return false;
    if (filtros.edadDesde != null && edad < filtros.edadDesde) return false;
    if (filtros.edadHasta != null && Math.floor(edad) > filtros.edadHasta) return false;
  }
  for (const [id, valores] of Object.entries(filtros.propios ?? {})) {
    if (!valores.length) continue;
    const v = ficha.camposPropios[id];
    if (!valores.includes(v === undefined || v === null || v === '' ? SIN_VALOR : String(v))) return false;
  }
  return true;
}

/**
 * Quita de los filtros guardados lo que ya no aplica en la rama: campos ocultos (RF-048)
 * o campos propios desactivados.
 */
export function filtrosAplicables(filtros: FiltrosNomina, rama: RamaConfigDTO): FiltrosNomina {
  const ocultos = new Set<string>(rama.camposOcultos);
  const r: FiltrosNomina = { ...filtros };
  if (ocultos.has('equipoId')) delete r.equipo;
  if (ocultos.has('elementoId')) delete r.elemento;
  if (ocultos.has('etapaId')) delete r.etapa;
  if (ocultos.has('promesaId')) delete r.promesa;
  if (ocultos.has('tieneTada')) delete r.tada;
  const activos = new Set(rama.camposPropios.filter((c) => c.activo).map((c) => c.id));
  if (r.propios) r.propios = Object.fromEntries(Object.entries(r.propios).filter(([k]) => activos.has(k)));
  return r;
}

/**
 * Filtros en palabras ("Etapa: Descubrimiento"), para mostrar en los gráficos que vienen de la
 * nómina (RF-112) y registrar en la exportación (RF-115, RNF-043). Solo lleva nombres de valores de
 * catálogo, equipos y edades, nunca datos de un protagonista.
 */
export function describirFiltros(filtros: FiltrosNomina, ix: IndiceRama): string[] {
  const f = filtrosAplicables(filtros, ix.rama);
  const nombre = (id: string, sinValor = 'Sin dato') =>
    id === SIN_VALOR ? sinValor : (ix.valores.get(id)?.nombre ?? ix.equipos.get(id)?.nombre ?? 'Valor eliminado');
  const lista = (etiqueta: string, ids: string[] | undefined, sinValor?: string) =>
    ids?.length ? [`${etiqueta}: ${ids.map((id) => nombre(id, sinValor)).join(', ')}`] : [];
  const r = [
    ...lista('Equipo', f.equipo, 'Sin equipo'),
    ...lista('Elemento', f.elemento),
    ...lista('Etapa', f.etapa),
    ...lista('Promesa', f.promesa),
    ...(f.tada?.length ? [`TADA: ${f.tada.map((t) => NOMBRE_ESTADO_TADA[t]).join(', ')}`] : []),
  ];
  const edad = (n: number) => String(n).replace('.', ',');
  if (f.edadDesde != null && f.edadHasta != null) r.push(`Edad de ${edad(f.edadDesde)} a ${edad(f.edadHasta)}`);
  else if (f.edadDesde != null) r.push(`Edad desde ${edad(f.edadDesde)}`);
  else if (f.edadHasta != null) r.push(`Edad hasta ${edad(f.edadHasta)}`);
  for (const [id, valores] of Object.entries(f.propios ?? {})) {
    const def = ix.rama.camposPropios.find((c) => c.id === id);
    if (!def || !valores.length) continue;
    const texto = valores.map((v) => (v === SIN_VALOR ? 'Sin dato' : v === 'true' ? 'Sí' : v === 'false' ? 'No' : v));
    r.push(`${def.nombre}: ${texto.join(', ')}`);
  }
  if (f.soloIncompletas) r.push('Solo fichas incompletas');
  return r;
}

// ---------------------------------------------------------------------------
// Búsqueda, orden y armado de la lista

export type Direccion = 'asc' | 'desc';

export interface OpcionesNomina {
  busqueda?: string;
  filtros?: FiltrosNomina;
  orden?: { columna: string; direccion: Direccion } | null;
  /** Vista por equipo (RF-034). */
  equipoId?: string | null;
  hoy?: FechaISO;
}

/** RF-031 a RF-034: aplica búsqueda, filtros, vista por equipo y orden. */
export function armarNomina(fichas: FichaDTO[], ix: IndiceRama, op: OpcionesNomina = {}): FichaDTO[] {
  const hoy = op.hoy ?? hoyAR();
  const filtros = filtrosAplicables(op.filtros ?? {}, ix.rama);
  const lista = fichas.filter(
    (f) =>
      (!op.equipoId || f.equipoId === op.equipoId) &&
      (!op.busqueda || coincideBusqueda(op.busqueda, f)) &&
      cumpleFiltros(f, filtros, hoy),
  );
  if (!op.orden) return lista.sort(compararNombres);
  const { columna, direccion } = op.orden;
  const signo = direccion === 'asc' ? 1 : -1;
  const claves = new Map(lista.map((f) => [f.id, valorColumna(f, columna, ix, hoy).orden]));
  return lista.sort((a, b) => {
    const x = claves.get(a.id)!;
    const y = claves.get(b.id)!;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es');
    return c !== 0 ? c * signo : compararNombres(a, b);
  });
}

/** RF-033: tocar el encabezado alterna ascendente y descendente. */
export function siguienteOrden(
  actual: { columna: string; direccion: Direccion } | null | undefined,
  columna: string,
): { columna: string; direccion: Direccion } {
  if (actual?.columna === columna) return { columna, direccion: actual.direccion === 'asc' ? 'desc' : 'asc' };
  return { columna, direccion: 'asc' };
}
