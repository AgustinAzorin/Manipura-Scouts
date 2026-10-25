/** RF-017: módulos con permisos y sus cuatro acciones. */
export const MODULOS = [
  'padron',
  'documentos',
  'cuotas',
  'actividades',
  'calendario',
  'fichaActividad',
  'graficos',
  'exportacion',
  'administracion',
] as const;
export type Modulo = (typeof MODULOS)[number];

export const NOMBRE_MODULO: Record<Modulo, string> = {
  padron: 'Padrón',
  documentos: 'Documentos',
  cuotas: 'Cuotas',
  actividades: 'Actividades',
  calendario: 'Calendario',
  fichaActividad: 'Ficha de Actividad',
  graficos: 'Gráficos',
  exportacion: 'Exportación',
  administracion: 'Administración',
};

export const ACCIONES = ['ver', 'crear', 'editar', 'eliminar'] as const;
export type Accion = (typeof ACCIONES)[number];

export const NOMBRE_ACCION: Record<Accion, string> = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
};

export type Permisos = Partial<Record<Modulo, Accion[]>>;

export type Alcance = 'grupo' | 'rama' | 'equipo';

export interface RolPermisos {
  permisos: Permisos;
  /** RF-020: permiso independiente de los módulos. */
  verSensibles: boolean;
}

export interface AsignacionConRol {
  grupoId: string;
  alcance: Alcance;
  ramaId: string | null;
  equipoId: string | null;
  rol: RolPermisos;
}

/**
 * Objeto sobre el que se pide un permiso. Una ficha es { grupoId, ramaId, equipoId };
 * la configuración de una rama es { grupoId, ramaId }; la del grupo es { grupoId }.
 */
export interface Objetivo {
  grupoId: string;
  ramaId?: string | null;
  equipoId?: string | null;
}

/** RF-019: indica si una asignación alcanza al objetivo. */
export function cubre(a: AsignacionConRol, o: Objetivo): boolean {
  if (a.grupoId !== o.grupoId) return false;
  switch (a.alcance) {
    case 'grupo':
      return true;
    case 'rama':
      return !!o.ramaId && a.ramaId === o.ramaId;
    case 'equipo':
      return !!o.equipoId && a.equipoId === o.equipoId;
  }
}

export function tienePermiso(permisos: Permisos, modulo: Modulo, accion: Accion): boolean {
  return permisos[modulo]?.includes(accion) ?? false;
}

/** Un permiso se concede si alguna asignación que alcanza al objetivo lo otorga. */
export function puede(asignaciones: AsignacionConRol[], modulo: Modulo, accion: Accion, o: Objetivo): boolean {
  return asignaciones.some((a) => cubre(a, o) && tienePermiso(a.rol.permisos, modulo, accion));
}

export function puedeVerSensibles(asignaciones: AsignacionConRol[], o: Objetivo): boolean {
  return asignaciones.some((a) => cubre(a, o) && a.rol.verSensibles);
}

/** Asignaciones que dan acceso a la rama: de grupo, de esa rama, o de un equipo de esa rama. */
export function asignacionesEnRama(
  asignaciones: AsignacionConRol[],
  grupoId: string,
  ramaId: string,
  equiposDeRama: ReadonlySet<string>,
): AsignacionConRol[] {
  return asignaciones.filter(
    (a) =>
      a.grupoId === grupoId &&
      (a.alcance === 'grupo' ||
        (a.alcance === 'rama' && a.ramaId === ramaId) ||
        (a.alcance === 'equipo' && !!a.equipoId && equiposDeRama.has(a.equipoId))),
  );
}

/**
 * Permisos de una rama tal como los ve la app para habilitar botones: un módulo/acción
 * figura si alguna asignación de la rama lo da. El servidor vuelve a validar cada
 * operación contra la ficha concreta con `puede`.
 */
export function permisosEfectivos(asignaciones: AsignacionConRol[]): { permisos: Permisos; verSensibles: boolean } {
  const permisos: Permisos = {};
  let verSensibles = false;
  for (const a of asignaciones) {
    verSensibles ||= a.rol.verSensibles;
    for (const m of MODULOS) {
      for (const acc of a.rol.permisos[m] ?? []) {
        const lista = (permisos[m] ??= []);
        if (!lista.includes(acc)) lista.push(acc);
      }
    }
  }
  return { permisos, verSensibles };
}

/** Normaliza permisos recibidos: descarta módulos o acciones desconocidos y duplicados. */
export function sanearPermisos(entrada: unknown): Permisos {
  const salida: Permisos = {};
  if (!entrada || typeof entrada !== 'object') return salida;
  for (const m of MODULOS) {
    const v = (entrada as Record<string, unknown>)[m];
    if (!Array.isArray(v)) continue;
    const acciones = ACCIONES.filter((a) => v.includes(a));
    if (acciones.length > 0) salida[m] = acciones;
  }
  return salida;
}

export const TODOS_LOS_PERMISOS: Permisos = Object.fromEntries(MODULOS.map((m) => [m, [...ACCIONES]])) as Permisos;
