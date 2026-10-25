/** Ficha de Actividad en PDF (RF-068, RF-088 a RF-105). Reglas que usan el servidor y la app. */
import { horaAR, fechaAR } from './actividades';
import { NOMBRES_MES } from './calendario';
import { partesFecha } from './fechas';
import { normalizarTexto } from './normalizar';

// ---------------------------------------------------------------------------
// Datos de la ficha

export const ESTADOS_FICHA_ACTIVIDAD = ['enCarga', 'final'] as const;
export type EstadoFichaActividad = (typeof ESTADOS_FICHA_ACTIVIDAD)[number];

export const NOMBRE_ESTADO_FICHA_ACTIVIDAD: Record<EstadoFichaActividad, string> = {
  enCarga: 'En carga',
  final: 'Versión final generada',
};

/** RF-092: lista fija, en este orden. */
export const AREAS = ['corporalidad', 'afectividad', 'caracter', 'espiritualidad', 'creatividad', 'sociabilidad'] as const;
export type Area = (typeof AREAS)[number];

export const NOMBRE_AREA: Record<Area, string> = {
  corporalidad: 'Corporalidad',
  afectividad: 'Afectividad',
  caracter: 'Carácter',
  espiritualidad: 'Espiritualidad',
  creatividad: 'Creatividad',
  sociabilidad: 'Sociabilidad',
};

export interface AreaFicha {
  area: Area;
  descripcion: string;
}

/** RF-088 */
export interface EducadorCabecera {
  nombre: string;
  cargo: string;
  formacion: string;
}

export interface CabeceraDTO {
  ramaId: string;
  nombreGrupo: string;
  nombreComunidad: string;
  /** Id del logo de portada (se ve por /logos/:id); null si no tiene. */
  logo: string | null;
  educadores: EducadorCabecera[];
}

/** RF-094: uno o más usuarios de la rama, "Todos" o un nombre escrito a mano. */
export type Responsable = { tipo: 'todos' } | { tipo: 'usuarios'; ids: string[] } | { tipo: 'texto'; texto: string };

/** RF-093: una fila de la grilla de programación. */
export interface FilaGrilla {
  /** "HH:MM" */
  hora: string;
  nombre: string;
  responsable: Responsable | null;
  observaciones: string;
  /** Número del anexo que describe la dinámica, si tiene. */
  anexo: number | null;
}

/** RF-097: la cantidad puede faltar ("espacio de lanzamiento de 10–15 metros"). */
export interface MaterialAnexo {
  cantidad: number | null;
  descripcion: string;
  porEquipo: boolean;
}

/** RD-005: campos que completa el educador asignado. */
export interface DatosAnexo {
  titulo: string;
  categoriaId: string | null;
  edadDesde: number | null;
  edadHasta: number | null;
  participantes: number | null;
  duracionMinutos: number | null;
  espacio: string;
  /** Un número o "todos". */
  educadores: string;
  /** RN-10: null usa la cantidad de equipos activos de la rama. */
  equipos: number | null;
  motivacion: string;
  objetivos: string;
  areas: string;
  materiales: MaterialAnexo[];
  desarrollo: string;
}

export interface UsuarioRamaDTO {
  id: string;
  nombre: string;
}

export interface AnexoDTO extends DatosAnexo {
  id: string;
  numero: number;
  asignadoA: UsuarioRamaDTO | null;
  completo: boolean;
  actualizadoEn: string;
  /** El usuario es el asignado o tiene permiso de editar en Ficha de Actividad (RF-095). */
  puedeEditar: boolean;
}

export interface PdfFichaDTO {
  final: boolean;
  generadoEn: string;
  tamano: number;
}

export interface FichaActividadDTO {
  id: string;
  grupoId: string;
  ramaId: string;
  estado: EstadoFichaActividad;
  /** RF-068: la fecha y el lugar salen de la actividad. */
  actividad: { id: string; nombre: string; inicio: string; fin: string; lugar: string | null };
  cabecera: CabeceraDTO;
  diagnostico: string;
  porQue: string;
  aQueResponde: string;
  dondeNecesidad: string;
  porQueLugar: string;
  objetivosEducativos: string[];
  objetivosDirigente: string[];
  areas: AreaFicha[];
  grilla: FilaGrilla[];
  anexos: AnexoDTO[];
  /** RF-103: el último PDF guardado. */
  pdf: PdfFichaDTO | null;
  /** Hubo cambios después de generar el PDF guardado. */
  pdfDesactualizado: boolean;
  /** Para elegir responsables y asignar anexos. */
  usuariosRama: UsuarioRamaDTO[];
  /** Valores del catálogo "Categoría de anexo" de la rama. */
  categorias: { id: string; nombre: string; activo: boolean }[];
  equiposActivos: number;
  permisos: { editar: boolean; eliminar: boolean };
}

/** RF-095: anexo asignado al usuario que todavía no está completo. */
export interface AnexoPendienteDTO {
  id: string;
  numero: number;
  titulo: string;
  fichaActividadId: string;
  actividadNombre: string;
  inicio: string;
  ramaId: string;
}

/** RF-105: anexo de otra ficha que se puede copiar. */
export interface AnexoReutilizableDTO {
  id: string;
  numero: number;
  titulo: string;
  categoria: string | null;
  actividadNombre: string;
  inicio: string;
  ramaNombre: string;
}

// ---------------------------------------------------------------------------
// Validaciones (RF-092, RF-096, RN-09)

export const NOMBRE_CAMPO_ANEXO: Partial<Record<keyof DatosAnexo, string>> = {
  titulo: 'Título',
  categoriaId: 'Categoría',
  desarrollo: 'Desarrollo',
};

/** RD-005 / RF-096: campos obligatorios que faltan para marcar el anexo como completo. */
export function faltantesAnexo(a: Pick<DatosAnexo, 'titulo' | 'categoriaId' | 'desarrollo'>): (keyof DatosAnexo)[] {
  const faltan: (keyof DatosAnexo)[] = [];
  if (!a.titulo.trim()) faltan.push('titulo');
  if (!a.categoriaId) faltan.push('categoriaId');
  if (!a.desarrollo.trim()) faltan.push('desarrollo');
  return faltan;
}

/** Números de anexo que usa la grilla, sin repetir y en orden. */
export function anexosDeGrilla(grilla: readonly FilaGrilla[]): number[] {
  return [...new Set(grilla.map((f) => f.anexo).filter((n): n is number => n !== null))].sort((a, b) => a - b);
}

/**
 * RF-101 / RN-09 y RF-092: lo que falta para generar la versión final. Cada anexo que figura en la
 * grilla tiene que estar completo, y cada área elegida tiene que tener descripción.
 */
export function faltantesVersionFinal(f: { grilla: readonly FilaGrilla[]; areas: readonly AreaFicha[]; anexos: readonly { numero: number; completo: boolean }[] }): string[] {
  const faltan: string[] = [];
  for (const n of anexosDeGrilla(f.grilla)) {
    const a = f.anexos.find((x) => x.numero === n);
    if (!a) faltan.push(`La grilla usa el anexo ${n}, que no existe`);
    else if (!a.completo) faltan.push(`Falta completar el anexo ${n}`);
  }
  for (const a of ordenarAreas(f.areas)) {
    if (!a.descripcion.trim()) faltan.push(`Falta la descripción del área ${NOMBRE_AREA[a.area]}`);
  }
  return faltan;
}

// ---------------------------------------------------------------------------
// Armado del contenido del PDF

/** RF-092: las áreas elegidas en el orden de la lista fija. */
export function ordenarAreas<T extends { area: Area }>(areas: readonly T[]): T[] {
  return [...areas].sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area));
}

/** RF-093: filas ordenadas por hora; las de la misma hora conservan el orden de carga. */
export function ordenarGrilla<T extends { hora: string }>(filas: readonly T[]): T[] {
  return filas
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.hora.localeCompare(b.f.hora) || a.i - b.i)
    .map((x) => x.f);
}

/** Hora como en el ejemplo: "14.00". */
export const horaFicha = (hora: string) => hora.replace(':', '.');

/**
 * Nombre de pila para la columna Responsable, como en el ejemplo ("Brisa"). Si otro usuario de la
 * rama tiene el mismo nombre de pila, va el nombre completo.
 */
export function nombreCorto(u: UsuarioRamaDTO, todos: readonly UsuarioRamaDTO[]): string {
  const pila = (n: string) => n.trim().split(/\s+/)[0] ?? '';
  const propio = pila(u.nombre);
  const repetido = todos.some((o) => o.id !== u.id && normalizarTexto(pila(o.nombre)) === normalizarTexto(propio));
  return repetido ? u.nombre.trim() : propio;
}

/** RF-094: texto de la columna Responsable (un nombre por línea). */
export function textoResponsable(r: Responsable | null, usuarios: readonly UsuarioRamaDTO[]): string {
  if (!r) return '-';
  if (r.tipo === 'todos') return 'Todos';
  if (r.tipo === 'texto') return r.texto.trim() || '-';
  const nombres = r.ids.map((id) => usuarios.find((u) => u.id === id)).filter((u): u is UsuarioRamaDTO => !!u);
  return nombres.length ? nombres.map((u) => nombreCorto(u, usuarios)).join('\n') : '-';
}

/** Cantidad con coma decimal y sin ceros de más: 1,5 · 30. */
export function formatearCantidad(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** "6 palos de 1,5 m". Sin cantidad, solo la descripción. */
export function textoMaterial(m: Pick<MaterialAnexo, 'cantidad' | 'descripcion'>): string {
  return m.cantidad === null ? m.descripcion.trim() : `${formatearCantidad(m.cantidad)} ${m.descripcion.trim()}`;
}

/** RF-098: columna Materiales de una fila de la grilla. */
export function materialesDeFila(anexo: number | null, anexos: readonly { numero: number; materiales: MaterialAnexo[] }[]): string {
  if (anexo === null) return '-';
  const materiales = anexos.find((a) => a.numero === anexo)?.materiales ?? [];
  if (materiales.length === 0) return '-';
  return materiales.map((m) => `${textoMaterial(m)}${m.porEquipo ? ' (por equipo)' : ''}`).join('\n');
}

export interface ItemCompra {
  /** null si ningún ítem con esa descripción tenía cantidad. */
  cantidad: number | null;
  descripcion: string;
  anexos: number[];
}

/**
 * RN-10 / RF-099: agrupa los materiales con la misma descripción (sin distinguir mayúsculas,
 * tildes ni espacios de más) y suma sus cantidades. Uno "por equipo" se multiplica por la
 * cantidad de equipos del anexo o, si no la tiene, por los equipos activos de la rama.
 */
export function listaDeCompras(
  anexos: readonly { numero: number; equipos: number | null; materiales: MaterialAnexo[] }[],
  equiposActivos: number,
): ItemCompra[] {
  const items = new Map<string, ItemCompra>();
  for (const a of [...anexos].sort((x, y) => x.numero - y.numero)) {
    for (const m of a.materiales) {
      const clave = normalizarTexto(m.descripcion);
      if (!clave) continue;
      const item = items.get(clave) ?? { cantidad: null, descripcion: m.descripcion.trim().replace(/\s+/g, ' '), anexos: [] };
      if (m.cantidad !== null) {
        const multiplicador = m.porEquipo ? (a.equipos ?? equiposActivos) : 1;
        item.cantidad = (item.cantidad ?? 0) + m.cantidad * multiplicador;
      }
      if (!item.anexos.includes(a.numero)) item.anexos.push(a.numero);
      items.set(clave, item);
    }
  }
  return [...items.values()];
}

/** "30 minutos", "1 hora", "1 hora 30 minutos". */
export function formatearDuracion(minutos: number | null): string {
  if (minutos === null) return '';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  const horas = h === 0 ? '' : h === 1 ? '1 hora' : `${h} horas`;
  const mins = m === 0 ? '' : `${m} minutos`;
  return [horas, mins].filter(Boolean).join(' ') || '0 minutos';
}

/** "14 a 18", "desde 14", "hasta 18". */
export function textoEdades(desde: number | null, hasta: number | null): string {
  if (desde !== null && hasta !== null) return desde === hasta ? `${desde}` : `${desde} a ${hasta}`;
  if (desde !== null) return `desde ${desde}`;
  if (hasta !== null) return `hasta ${hasta}`;
  return '';
}

const fechaLarga = (f: string, conAnio = true) => {
  const { anio, mes, dia } = partesFecha(f);
  return `${dia} de ${NOMBRES_MES[mes - 1]}${conAnio ? ` del ${anio}` : ''}`;
};

/** Fecha de la actividad como en el ejemplo: "14 de marzo del 2026", "14 al 16 de noviembre del 2026". */
export function fechaFicha(inicio: string, fin: string): string {
  const [fi, ff] = [fechaAR(inicio), fechaAR(fin)];
  if (fi === ff) return fechaLarga(fi);
  const [i, f] = [partesFecha(fi), partesFecha(ff)];
  if (i.anio === f.anio && i.mes === f.mes) return `${i.dia} al ${fechaLarga(ff)}`;
  if (i.anio === f.anio) return `${fechaLarga(fi, false)} al ${fechaLarga(ff)}`;
  return `${fechaLarga(fi)} al ${fechaLarga(ff)}`;
}

/** Horario de la actividad cuando es en el día: "de 14:00 a 18:00". */
export function horarioFicha(inicio: string, fin: string): string | null {
  return fechaAR(inicio) === fechaAR(fin) ? `de ${horaAR(inicio)} a ${horaAR(fin)}` : null;
}

// ---------------------------------------------------------------------------
// Desarrollo del anexo: texto con negrita y listas (RD-005)

export interface Segmento {
  texto: string;
  negrita: boolean;
}

export type BloqueDesarrollo = { tipo: 'parrafo'; segmentos: Segmento[] } | { tipo: 'lista'; items: Segmento[][] };

const RE_ITEM = /^\s*[-•*●]\s+/;

/** Separa "**negrita**" del resto. Un "**" sin cerrar queda como texto. */
export function segmentosEnLinea(linea: string): Segmento[] {
  const partes = linea.split('**');
  if (partes.length % 2 === 0) {
    // Cantidad impar de marcas: la última no cierra.
    const ultima = partes.pop()!;
    partes[partes.length - 1] += `**${ultima}`;
  }
  return partes.map((texto, i) => ({ texto, negrita: i % 2 === 1 })).filter((s) => s.texto !== '');
}

/**
 * Convierte el texto del desarrollo en párrafos y listas. Las líneas que empiezan con "- " (o "•")
 * son ítems de lista; una línea en blanco separa párrafos; las demás líneas seguidas forman un
 * mismo párrafo.
 */
export function interpretarDesarrollo(texto: string): BloqueDesarrollo[] {
  const bloques: BloqueDesarrollo[] = [];
  let parrafo: string[] = [];
  const cerrarParrafo = () => {
    if (parrafo.length) bloques.push({ tipo: 'parrafo', segmentos: segmentosEnLinea(parrafo.join('\n')) });
    parrafo = [];
  };
  for (const linea of texto.replace(/\r\n?/g, '\n').split('\n')) {
    if (RE_ITEM.test(linea)) {
      cerrarParrafo();
      const item = segmentosEnLinea(linea.replace(RE_ITEM, '').trim());
      const ultimo = bloques[bloques.length - 1];
      if (ultimo?.tipo === 'lista') ultimo.items.push(item);
      else bloques.push({ tipo: 'lista', items: [item] });
    } else if (!linea.trim()) {
      cerrarParrafo();
    } else {
      parrafo.push(linea.trim());
    }
  }
  cerrarParrafo();
  return bloques;
}
