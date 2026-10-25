/** Gráficos de la rama (RF-106 a RF-112). Se calculan en el dispositivo, también sin conexión. */
import type { FichaDTO } from './api';
import { aniosCumplidos, hoyAR, type FechaISO } from './fechas';
import { NOMBRE_ESTADO_TADA, type CampoFicha, type Catalogo, type EstadoTada } from './ficha';
import { estadoTadaDe, type IndiceRama } from './nomina';

export const GRAFICOS = ['edades', 'promesas', 'tada', 'equipos', 'elementos', 'etapas', 'religion'] as const;
export type IdGrafico = (typeof GRAFICOS)[number];

export const TITULO_GRAFICO: Record<IdGrafico, string> = {
  edades: 'Edades (años cumplidos)',
  promesas: 'Promesa',
  tada: 'TADA',
  equipos: 'Equipos',
  elementos: 'Elemento',
  etapas: 'Etapa',
  religion: 'Religión',
};

/**
 * RF-108: un color por categoría de TADA. Paleta validada para daltonismo (todas las parejas) y con
 * contraste ≥ 3:1 sobre los fondos claros de la app (RNF-029). Cada barra lleva además su nombre.
 */
export const COLOR_TADA: Record<EstadoTada, string> = {
  tiene: '#00876A',
  puedeHacer: '#2A78D6',
  noPuede: '#C75A00',
};

export interface Barra {
  /** Id del valor, edad en años, estado de TADA o `SIN_DATO`. */
  clave: string;
  etiqueta: string;
  valor: number;
  /** Logo del valor (RF-107, RI-003). */
  logo?: string | null;
  /** Valor de catálogo o equipo desactivado que todavía tiene integrantes. */
  inactivo?: boolean;
  /** Solo en los gráficos con un color por categoría (RF-108). */
  color?: string;
}

export interface Grafico {
  id: IdGrafico;
  titulo: string;
  barras: Barra[];
  /** Protagonistas contados. */
  total: number;
}

export const SIN_DATO = '__sin__';

/** Campo de la ficha que necesita cada gráfico: si la rama lo oculta, el gráfico no se muestra (RF-048). */
const CAMPO_GRAFICO: Partial<Record<IdGrafico, CampoFicha>> = {
  promesas: 'promesaId',
  tada: 'tieneTada',
  equipos: 'equipoId',
  elementos: 'elementoId',
  etapas: 'etapaId',
  religion: 'religionId',
};

const CATALOGO_GRAFICO: Partial<Record<IdGrafico, Catalogo>> = {
  promesas: 'promesa',
  elementos: 'elemento',
  etapas: 'etapa',
  religion: 'religion',
};

function contar<T>(lista: T[], clave: (x: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of lista) {
    const k = clave(x);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

const sinDato = (cuenta: Map<string, number>, etiqueta = 'Sin dato'): Barra[] =>
  cuenta.get(SIN_DATO) ? [{ clave: SIN_DATO, etiqueta, valor: cuenta.get(SIN_DATO)! }] : [];

/**
 * RF-106: protagonistas por años cumplidos. Las edades intermedias sin nadie aparecen en 0 para
 * que el eje no saltee años.
 */
function graficoEdades(fichas: FichaDTO[], hoy: FechaISO): Barra[] {
  const cuenta = contar(fichas, (f) => (f.fechaNacimiento ? String(Math.max(0, aniosCumplidos(f.fechaNacimiento, hoy))) : SIN_DATO));
  const edades = [...cuenta.keys()].filter((k) => k !== SIN_DATO).map(Number);
  const barras: Barra[] = [];
  if (edades.length) {
    for (let e = Math.min(...edades); e <= Math.max(...edades); e++) {
      barras.push({ clave: String(e), etiqueta: e === 1 ? '1 año' : `${e} años`, valor: cuenta.get(String(e)) ?? 0 });
    }
  }
  return [...barras, ...sinDato(cuenta)];
}

/**
 * RF-107 / RF-109 / RF-110: un valor de catálogo por barra, en el orden del catálogo. Los valores
 * activos aparecen aunque nadie los tenga; los desactivados, solo si alguien todavía los conserva.
 */
function graficoCatalogo(fichas: FichaDTO[], ix: IndiceRama, catalogo: Catalogo, campo: CampoFicha): Barra[] {
  const cuenta = contar(fichas, (f) => (f[campo] as string | null | undefined) ?? SIN_DATO);
  const valores = ix.rama.catalogos.filter((v) => v.catalogo === catalogo).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'));
  const barras: Barra[] = valores
    .filter((v) => v.activo || cuenta.get(v.id))
    .map((v) => ({ clave: v.id, etiqueta: v.nombre, valor: cuenta.get(v.id) ?? 0, logo: v.logo, inactivo: !v.activo }));
  // Un valor que ya no existe en la rama (por ejemplo, de antes de un pase) cuenta como sin dato.
  const conocidos = new Set(valores.map((v) => v.id));
  const otros = [...cuenta].filter(([k]) => k !== SIN_DATO && !conocidos.has(k)).reduce((s, [, n]) => s + n, 0);
  const vacios = (cuenta.get(SIN_DATO) ?? 0) + otros;
  return [...barras, ...(vacios ? [{ clave: SIN_DATO, etiqueta: 'Sin dato', valor: vacios }] : [])];
}

/** RF-109: una barra por equipo, más "Sin equipo" si corresponde. */
function graficoEquipos(fichas: FichaDTO[], ix: IndiceRama, equipos: readonly string[] | null | undefined): Barra[] {
  const cuenta = contar(fichas, (f) => (f.equipoId && ix.equipos.has(f.equipoId) ? f.equipoId : SIN_DATO));
  const barras: Barra[] = [...ix.equipos.values()]
    .filter((e) => (e.activo && (!equipos || equipos.includes(e.id))) || cuenta.get(e.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((e) => ({ clave: e.id, etiqueta: e.nombre, valor: cuenta.get(e.id) ?? 0, logo: e.logo, inactivo: !e.activo }));
  return [...barras, ...sinDato(cuenta, 'Sin equipo')];
}

/** RF-108: las tres categorías de TADA siempre, cada una con su color. */
function graficoTada(fichas: FichaDTO[], hoy: FechaISO): Barra[] {
  const cuenta = contar(fichas, (f) => estadoTadaDe(f, hoy) ?? SIN_DATO);
  const barras: Barra[] = (['tiene', 'puedeHacer', 'noPuede'] as const).map((t) => ({
    clave: t,
    etiqueta: NOMBRE_ESTADO_TADA[t],
    valor: cuenta.get(t) ?? 0,
    color: COLOR_TADA[t],
  }));
  return [...barras, ...sinDato(cuenta, 'Sin fecha de nacimiento')];
}

export interface OpcionesGraficos {
  /** RF-110: el gráfico de religión solo se arma con el permiso de datos sensibles. */
  verSensibles: boolean;
  /** Equipos que se muestran en 0: los del usuario con alcance de equipo o el elegido en el filtro. */
  equipos?: readonly string[] | null;
  hoy?: FechaISO;
}

/**
 * RF-106 a RF-110 sobre las fichas recibidas, que ya vienen filtradas (RF-111, RF-112). Las fichas
 * archivadas no llegan al dispositivo, así que se cuentan solo los protagonistas activos (RF-027).
 */
export function armarGraficos(fichas: FichaDTO[], ix: IndiceRama, op: OpcionesGraficos): Grafico[] {
  const hoy = op.hoy ?? hoyAR();
  const ocultos = new Set<string>(ix.rama.camposOcultos);
  const graficos: Grafico[] = [];
  for (const id of GRAFICOS) {
    const campo = CAMPO_GRAFICO[id];
    if (campo && ocultos.has(campo)) continue;
    if (id === 'religion' && !op.verSensibles) continue;
    // La religión llega solo en las fichas cuyos datos sensibles el usuario puede ver (RNF-018).
    const base = id === 'religion' ? fichas.filter((f) => 'religionId' in f) : fichas;
    let barras: Barra[];
    if (id === 'edades') barras = graficoEdades(base, hoy);
    else if (id === 'tada') barras = graficoTada(base, hoy);
    else if (id === 'equipos') barras = graficoEquipos(base, ix, op.equipos);
    else barras = graficoCatalogo(base, ix, CATALOGO_GRAFICO[id]!, campo!);
    graficos.push({ id, titulo: TITULO_GRAFICO[id], barras, total: base.length });
  }
  return graficos;
}

/** Porcentaje entero de una barra sobre el total del gráfico. */
export function porcentaje(valor: number, total: number): number {
  return total > 0 ? Math.round((valor / total) * 100) : 0;
}
