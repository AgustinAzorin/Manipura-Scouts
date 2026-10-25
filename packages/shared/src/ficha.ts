import { calcularEdad, esFechaISO, type FechaISO } from './fechas';
import { esDniValido, esTelefonoValido } from './normalizar';

/** RF-044: catálogos configurables por rama. */
export const CATALOGOS = [
  'elemento',
  'promesa',
  'etapa',
  'raid',
  'guardian',
  'categoriaMiembro',
  'ingresoMovimiento',
  'religion',
  'tipoActividad',
  'categoriaAnexo',
] as const;
export type Catalogo = (typeof CATALOGOS)[number];

export const NOMBRE_CATALOGO: Record<Catalogo, string> = {
  elemento: 'Elemento',
  promesa: 'Promesa',
  etapa: 'Etapa',
  raid: 'Raid',
  guardian: 'Guardián',
  categoriaMiembro: 'Categoría de miembro',
  ingresoMovimiento: 'Ingreso al movimiento',
  religion: 'Religión',
  tipoActividad: 'Tipo de actividad',
  categoriaAnexo: 'Categoría de anexo',
};

/** RF-047: catálogos cuyos valores llevan logo. */
export const CATALOGOS_CON_LOGO: readonly Catalogo[] = ['elemento', 'promesa'];

/** RF-035: secciones de la ficha. */
export const SECCIONES = ['datosPersonales', 'contacto', 'organizacion', 'progresion', 'administrativa', 'documentos'] as const;
export type Seccion = (typeof SECCIONES)[number];

export const NOMBRE_SECCION: Record<Seccion, string> = {
  datosPersonales: 'Datos personales',
  contacto: 'Contacto',
  organizacion: 'Organización',
  progresion: 'Progresión',
  administrativa: 'Administrativa',
  documentos: 'Documentos',
};

export type TipoCampo = 'texto' | 'dni' | 'telefono' | 'fecha' | 'booleano' | 'catalogo' | 'equipo' | 'cordi';

export interface DefCampo {
  clave: CampoFicha;
  etiqueta: string;
  seccion: Seccion;
  tipo: TipoCampo;
  catalogo?: Catalogo;
  sensible: boolean;
  /** RF-048: el admin puede ocultarlo en una rama. */
  ocultable: boolean;
}

export const CAMPOS_FICHA = [
  'apellido',
  'nombre',
  'dni',
  'fechaNacimiento',
  'religionId',
  'categoriaMiembroId',
  'telEmergencia1',
  'telEmergencia2',
  'telPropio',
  'equipoId',
  'promesaId',
  'etapaId',
  'elementoId',
  'raidId',
  'cordi',
  'guardianId',
  'rolComunidad',
  'tieneTada',
  'mistica',
  'ingresoMovimientoId',
  'fechaRevisionDiario',
] as const;
export type CampoFicha = (typeof CAMPOS_FICHA)[number];

/** RD-002: campos de la ficha, en el orden de cada sección. */
export const DEF_CAMPOS: readonly DefCampo[] = [
  { clave: 'apellido', etiqueta: 'Apellido', seccion: 'datosPersonales', tipo: 'texto', sensible: false, ocultable: false },
  { clave: 'nombre', etiqueta: 'Nombre', seccion: 'datosPersonales', tipo: 'texto', sensible: false, ocultable: false },
  { clave: 'dni', etiqueta: 'DNI', seccion: 'datosPersonales', tipo: 'dni', sensible: true, ocultable: false },
  { clave: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', seccion: 'datosPersonales', tipo: 'fecha', sensible: false, ocultable: false },
  { clave: 'religionId', etiqueta: 'Religión', seccion: 'datosPersonales', tipo: 'catalogo', catalogo: 'religion', sensible: true, ocultable: true },
  { clave: 'categoriaMiembroId', etiqueta: 'Categoría de miembro', seccion: 'datosPersonales', tipo: 'catalogo', catalogo: 'categoriaMiembro', sensible: false, ocultable: true },
  { clave: 'telEmergencia1', etiqueta: 'Teléfono de emergencia 1', seccion: 'contacto', tipo: 'telefono', sensible: true, ocultable: false },
  { clave: 'telEmergencia2', etiqueta: 'Teléfono de emergencia 2', seccion: 'contacto', tipo: 'telefono', sensible: true, ocultable: false },
  { clave: 'telPropio', etiqueta: 'Teléfono propio', seccion: 'contacto', tipo: 'telefono', sensible: true, ocultable: true },
  { clave: 'equipoId', etiqueta: 'Equipo', seccion: 'organizacion', tipo: 'equipo', sensible: false, ocultable: true },
  { clave: 'promesaId', etiqueta: 'Promesa', seccion: 'organizacion', tipo: 'catalogo', catalogo: 'promesa', sensible: false, ocultable: true },
  { clave: 'etapaId', etiqueta: 'Etapa', seccion: 'organizacion', tipo: 'catalogo', catalogo: 'etapa', sensible: false, ocultable: true },
  { clave: 'elementoId', etiqueta: 'Elemento', seccion: 'organizacion', tipo: 'catalogo', catalogo: 'elemento', sensible: false, ocultable: true },
  { clave: 'raidId', etiqueta: 'Raid', seccion: 'organizacion', tipo: 'catalogo', catalogo: 'raid', sensible: false, ocultable: true },
  { clave: 'cordi', etiqueta: 'Cordi', seccion: 'organizacion', tipo: 'cordi', sensible: false, ocultable: true },
  { clave: 'guardianId', etiqueta: 'Guardián', seccion: 'organizacion', tipo: 'catalogo', catalogo: 'guardian', sensible: false, ocultable: true },
  { clave: 'rolComunidad', etiqueta: 'Rol en la comunidad', seccion: 'organizacion', tipo: 'texto', sensible: false, ocultable: true },
  { clave: 'tieneTada', etiqueta: 'Tiene TADA', seccion: 'progresion', tipo: 'booleano', sensible: false, ocultable: true },
  { clave: 'mistica', etiqueta: 'Mística', seccion: 'progresion', tipo: 'texto', sensible: false, ocultable: true },
  { clave: 'ingresoMovimientoId', etiqueta: 'Ingreso al movimiento', seccion: 'progresion', tipo: 'catalogo', catalogo: 'ingresoMovimiento', sensible: false, ocultable: true },
  { clave: 'fechaRevisionDiario', etiqueta: 'Última revisión del diario de marcha', seccion: 'progresion', tipo: 'fecha', sensible: false, ocultable: true },
];

export const DEF_CAMPO: Record<CampoFicha, DefCampo> = Object.fromEntries(DEF_CAMPOS.map((d) => [d.clave, d])) as Record<
  CampoFicha,
  DefCampo
>;

export const CAMPOS_SENSIBLES: readonly CampoFicha[] = DEF_CAMPOS.filter((d) => d.sensible).map((d) => d.clave);
export const CAMPOS_OCULTABLES: readonly CampoFicha[] = DEF_CAMPOS.filter((d) => d.ocultable).map((d) => d.clave);

/** RF-022: obligatorios. "Un teléfono de emergencia" se cumple con el 1 o el 2. */
export const CAMPOS_OBLIGATORIOS = ['apellido', 'nombre', 'dni', 'fechaNacimiento', 'telEmergencia'] as const;

export type Cordi = 'coordinador' | 'subcoordinador';
export const NOMBRE_CORDI: Record<Cordi, string> = { coordinador: 'Coordinador', subcoordinador: 'Subcoordinador' };

// ---------------------------------------------------------------------------
// Cuotas (RN-05)

export const CONCEPTOS_CUOTA = [
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
  'distrito',
  'afiliacion',
] as const;
export type ConceptoCuota = (typeof CONCEPTOS_CUOTA)[number];

export const NOMBRE_CONCEPTO_CUOTA: Record<ConceptoCuota, string> = {
  abril: 'Abril',
  mayo: 'Mayo',
  junio: 'Junio',
  julio: 'Julio',
  agosto: 'Agosto',
  septiembre: 'Septiembre',
  octubre: 'Octubre',
  noviembre: 'Noviembre',
  diciembre: 'Diciembre',
  distrito: 'Distrito',
  afiliacion: 'Afiliación',
};

export const ESTADOS_CUOTA = ['pagada', 'adeudada', 'exenta'] as const;
export type EstadoCuota = (typeof ESTADOS_CUOTA)[number];
export const NOMBRE_ESTADO_CUOTA: Record<EstadoCuota, string> = { pagada: 'Pagada', adeudada: 'Adeudada', exenta: 'Exenta' };

/** Sin dato = null (por ejemplo, un valor no reconocido al importar, RF-050). */
export type Cuotas = Partial<Record<ConceptoCuota, EstadoCuota | null>>;

export function sanearCuotas(entrada: unknown): Cuotas {
  const salida: Cuotas = {};
  if (!entrada || typeof entrada !== 'object') return salida;
  for (const c of CONCEPTOS_CUOTA) {
    const v = (entrada as Record<string, unknown>)[c];
    if (v === null) salida[c] = null;
    else if (typeof v === 'string' && (ESTADOS_CUOTA as readonly string[]).includes(v)) salida[c] = v as EstadoCuota;
  }
  return salida;
}

/** Conceptos adeudados: una cuota exenta o pagada no cuenta (RF-043). */
export function cuotasAdeudadas(cuotas: Cuotas): ConceptoCuota[] {
  return CONCEPTOS_CUOTA.filter((c) => cuotas[c] === 'adeudada');
}

// ---------------------------------------------------------------------------
// Documentos (RD-003, RN-06)

export const TIPOS_DOCUMENTO = ['retiroSolo', 'ddjjSalud', 'usoImagen', 'pdfAdjunto', 'consentimiento'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const ESTADOS_AUTORIZACION = ['noPresentado', 'presentadoAutoriza', 'presentadoNoAutoriza'] as const;
export const ESTADOS_DOCUMENTO_SIMPLE = ['noPresentado', 'presentado'] as const;
export type EstadoDocumento = (typeof ESTADOS_AUTORIZACION)[number] | (typeof ESTADOS_DOCUMENTO_SIMPLE)[number];

export const NOMBRE_ESTADO_DOCUMENTO: Record<EstadoDocumento, string> = {
  noPresentado: 'No presentado',
  presentado: 'Presentado',
  presentadoAutoriza: 'Presentado: autoriza',
  presentadoNoAutoriza: 'Presentado: no autoriza',
};

export interface DefDocumento {
  tipo: TipoDocumento;
  nombre: string;
  estados: readonly EstadoDocumento[];
  /** Datos sensibles: autorizaciones, DDJJ de salud y consentimiento (glosario, RF-020). */
  sensible: boolean;
  /** RNF-044: cada apertura del archivo queda registrada. */
  auditarApertura: boolean;
}

export const DEF_DOCUMENTOS: readonly DefDocumento[] = [
  { tipo: 'retiroSolo', nombre: 'Autorización para retirarse solo', estados: ESTADOS_AUTORIZACION, sensible: true, auditarApertura: true },
  { tipo: 'ddjjSalud', nombre: 'DDJJ de salud', estados: ESTADOS_DOCUMENTO_SIMPLE, sensible: true, auditarApertura: true },
  { tipo: 'usoImagen', nombre: 'Autorización de uso de imagen', estados: ESTADOS_AUTORIZACION, sensible: true, auditarApertura: true },
  { tipo: 'pdfAdjunto', nombre: 'PDF adjunto general', estados: ESTADOS_DOCUMENTO_SIMPLE, sensible: false, auditarApertura: false },
  { tipo: 'consentimiento', nombre: 'Consentimiento de tratamiento de datos', estados: ESTADOS_DOCUMENTO_SIMPLE, sensible: true, auditarApertura: true },
];
export const DEF_DOCUMENTO: Record<TipoDocumento, DefDocumento> = Object.fromEntries(
  DEF_DOCUMENTOS.map((d) => [d.tipo, d]),
) as Record<TipoDocumento, DefDocumento>;

/** RD-004 */
export const TAMANO_MAXIMO_ARCHIVO = 10 * 1024 * 1024;
export const TIPOS_ARCHIVO_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'] as const;

/** RN-06: un documento presentado lleva fecha de entrega. */
export function validarDocumento(
  tipo: TipoDocumento,
  estado: string,
  fechaEntrega: string | null | undefined,
): string | null {
  const def = DEF_DOCUMENTO[tipo];
  if (!(def.estados as readonly string[]).includes(estado)) return `Estado inválido para ${def.nombre}`;
  if (estado !== 'noPresentado' && !esFechaISO(fechaEntrega)) return 'Indicá la fecha de entrega';
  return null;
}

// ---------------------------------------------------------------------------
// TADA (RN-02)

export type EstadoTada = 'tiene' | 'puedeHacer' | 'noPuede';
export const NOMBRE_ESTADO_TADA: Record<EstadoTada, string> = { tiene: 'Tiene', puedeHacer: 'Puede hacer', noPuede: 'No puede' };
export const EDAD_MINIMA_TADA = 16;

export function estadoTada(edad: number | null, tieneTada: boolean | null | undefined): EstadoTada | null {
  if (edad === null) return null;
  if (edad < EDAD_MINIMA_TADA) return 'noPuede';
  return tieneTada ? 'tiene' : 'puedeHacer';
}

/** RF-037: "Tiene TADA" solo puede editarse desde los 16 años. */
export function tadaEditable(edad: number | null): boolean {
  return edad !== null && edad >= EDAD_MINIMA_TADA;
}

// ---------------------------------------------------------------------------
// Campos propios por rama (RF-119)

export const TIPOS_CAMPO_PROPIO = ['texto', 'booleano', 'fecha', 'lista'] as const;
export type TipoCampoPropio = (typeof TIPOS_CAMPO_PROPIO)[number];
export const NOMBRE_TIPO_CAMPO_PROPIO: Record<TipoCampoPropio, string> = {
  texto: 'Texto',
  booleano: 'Sí / No',
  fecha: 'Fecha',
  lista: 'Lista de valores',
};

export interface CampoPropioDef {
  id: string;
  nombre: string;
  tipo: TipoCampoPropio;
  seccion: Exclude<Seccion, 'documentos' | 'administrativa'>;
  sensible: boolean;
  opciones: string[];
  activo: boolean;
}

export function valorCampoPropioValido(def: Pick<CampoPropioDef, 'tipo' | 'opciones'>, valor: unknown): boolean {
  if (valor === null || valor === undefined || valor === '') return true;
  switch (def.tipo) {
    case 'texto':
      return typeof valor === 'string' && valor.length <= 2000;
    case 'booleano':
      return typeof valor === 'boolean';
    case 'fecha':
      return esFechaISO(valor);
    case 'lista':
      return typeof valor === 'string' && def.opciones.includes(valor);
  }
}

// ---------------------------------------------------------------------------
// Datos de la ficha y validación

export type EstadoFicha = 'activa' | 'incompleta' | 'archivada' | 'anonimizada';

export interface DatosFicha {
  apellido?: string | null;
  nombre?: string | null;
  dni?: string | null;
  fechaNacimiento?: FechaISO | null;
  religionId?: string | null;
  categoriaMiembroId?: string | null;
  telEmergencia1?: string | null;
  telEmergencia2?: string | null;
  telPropio?: string | null;
  equipoId?: string | null;
  promesaId?: string | null;
  etapaId?: string | null;
  elementoId?: string | null;
  raidId?: string | null;
  cordi?: Cordi | null;
  guardianId?: string | null;
  rolComunidad?: string | null;
  tieneTada?: boolean | null;
  mistica?: string | null;
  ingresoMovimientoId?: string | null;
  fechaRevisionDiario?: FechaISO | null;
}

export const ETIQUETA_OBLIGATORIO: Record<(typeof CAMPOS_OBLIGATORIOS)[number], string> = {
  apellido: 'Apellido',
  nombre: 'Nombre',
  dni: 'DNI',
  fechaNacimiento: 'Fecha de nacimiento',
  telEmergencia: 'Teléfono de emergencia',
};

/** Obligatorios faltantes (RF-022). */
export function obligatoriosFaltantes(d: DatosFicha): string[] {
  const faltan: string[] = [];
  if (!d.apellido?.trim()) faltan.push(ETIQUETA_OBLIGATORIO.apellido);
  if (!d.nombre?.trim()) faltan.push(ETIQUETA_OBLIGATORIO.nombre);
  if (!d.dni) faltan.push(ETIQUETA_OBLIGATORIO.dni);
  if (!d.fechaNacimiento) faltan.push(ETIQUETA_OBLIGATORIO.fechaNacimiento);
  if (!d.telEmergencia1 && !d.telEmergencia2) faltan.push(ETIQUETA_OBLIGATORIO.telEmergencia);
  return faltan;
}

/** Errores de formato de los valores cargados, por campo. */
export function erroresDeFormato(d: DatosFicha, hoy?: FechaISO): Partial<Record<CampoFicha, string>> {
  const e: Partial<Record<CampoFicha, string>> = {};
  if (d.dni && !esDniValido(d.dni)) e.dni = 'El DNI debe tener entre 6 y 9 dígitos';
  if (d.fechaNacimiento) {
    if (!esFechaISO(d.fechaNacimiento)) e.fechaNacimiento = 'Fecha inválida';
    else if (hoy && d.fechaNacimiento > hoy) e.fechaNacimiento = 'La fecha de nacimiento no puede ser futura';
  }
  if (d.fechaRevisionDiario && !esFechaISO(d.fechaRevisionDiario)) e.fechaRevisionDiario = 'Fecha inválida';
  for (const k of ['telEmergencia1', 'telEmergencia2', 'telPropio'] as const) {
    if (d[k] && !esTelefonoValido(d[k])) e[k] = 'El teléfono debe tener entre 6 y 15 dígitos';
  }
  if (d.cordi && d.cordi !== 'coordinador' && d.cordi !== 'subcoordinador') e.cordi = 'Valor inválido';
  if (d.cordi && !d.equipoId) e.cordi = 'Para ser cordi tiene que tener equipo';
  if (d.tieneTada && d.fechaNacimiento && esFechaISO(d.fechaNacimiento) && !tadaEditable(calcularEdad(d.fechaNacimiento, hoy))) {
    e.tieneTada = 'Solo puede tener TADA desde los 16 años';
  }
  for (const k of ['apellido', 'nombre', 'rolComunidad', 'mistica'] as const) {
    if (d[k] && d[k]!.length > 2000) e[k] = 'Texto demasiado largo';
  }
  return e;
}
