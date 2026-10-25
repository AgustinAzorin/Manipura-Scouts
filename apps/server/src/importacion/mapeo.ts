import { normalizarTexto, type CampoFicha, type ConceptoCuota, type TipoDocumento } from '@scouttracker/shared';

/** Destino de una columna de la planilla (RI-006, RD-002). */
export type Destino =
  | { tipo: 'campo'; campo: CampoFicha }
  | { tipo: 'apellidoYNombre'; orden: 'apellidoPrimero' | 'nombrePrimero' }
  | { tipo: 'cuota'; concepto: ConceptoCuota }
  | { tipo: 'documento'; documento: TipoDocumento }
  | { tipo: 'ignorar' };

export function normalizarEncabezado(h: string): string {
  return normalizarTexto(h)
    .replace(/[°º#]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const campo = (c: CampoFicha): Destino => ({ tipo: 'campo', campo: c });

/**
 * Encabezados reconocidos, ya normalizados. Cubre los nombres de la planilla actual y variantes
 * habituales. Una columna que no figura acá se informa como ignorada en el resumen.
 */
const ALIAS: [string[], Destino][] = [
  [['n', 'nro', 'numero', 'n de orden', 'orden'], { tipo: 'ignorar' }],
  [['apellido', 'apellidos'], campo('apellido')],
  [['nombre', 'nombres'], campo('nombre')],
  [['apellido y nombre', 'apellidos y nombres', 'apellido nombre'], { tipo: 'apellidoYNombre', orden: 'apellidoPrimero' }],
  [['nombre y apellido', 'nombres y apellidos', 'nombre completo', 'protagonista'], { tipo: 'apellidoYNombre', orden: 'nombrePrimero' }],
  [['dni', 'documento', 'n documento', 'nro documento', 'nro de documento', 'numero de documento', 'n dni', 'nro dni'], campo('dni')],
  [['fecha de nacimiento', 'fecha nacimiento', 'nacimiento', 'f nacimiento', 'fecha nac', 'f nac', 'fec nac'], campo('fechaNacimiento')],
  [['religion', 'credo'], campo('religionId')],
  [['categoria', 'categoria de miembro', 'categoria miembro', 'tipo de miembro', 'tipo miembro'], campo('categoriaMiembroId')],
  [
    ['telefono de emergencia', 'telefono de emergencia 1', 'telefono emergencia', 'telefono emergencia 1', 'tel emergencia', 'tel emergencia 1', 'tel de emergencia', 'tel de emergencia 1', 'emergencia', 'emergencia 1', 'contacto de emergencia', 'contacto emergencia', 'contacto de emergencia 1'],
    campo('telEmergencia1'),
  ],
  [
    ['telefono de emergencia 2', 'telefono emergencia 2', 'tel emergencia 2', 'tel de emergencia 2', 'emergencia 2', 'contacto de emergencia 2', 'contacto emergencia 2'],
    campo('telEmergencia2'),
  ],
  [['telefono', 'telefono propio', 'tel propio', 'tel', 'celular', 'cel', 'celular propio', 'whatsapp'], campo('telPropio')],
  [['equipo', 'patrulla', 'seisena'], campo('equipoId')],
  [['promesa', 'estado promesa', 'estado de promesa'], campo('promesaId')],
  [['etapa', 'progresion', 'etapa de progresion'], campo('etapaId')],
  [['elemento'], campo('elementoId')],
  [['raid', 'raids'], campo('raidId')],
  [['cordi', 'c', 'coordinador', 'cordinador', 'coordinacion'], campo('cordi')],
  [['guardian', 'guardiana', 'guardianes'], campo('guardianId')],
  [['rol', 'rol en la comunidad', 'rol comunidad', 'funcion', 'cargo'], campo('rolComunidad')],
  [['tada', 'tiene tada'], campo('tieneTada')],
  [['mistica'], campo('mistica')],
  [['ingreso', 'ingreso al movimiento', 'ingreso movimiento', 'como ingreso'], campo('ingresoMovimientoId')],
  [
    ['diario', 'diario de marcha', 'revision diario', 'revision del diario', 'revision diario de marcha', 'ultima revision del diario de marcha', 'ultima revision diario', 'fecha revision diario'],
    campo('fechaRevisionDiario'),
  ],
  ...(['abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const).map(
    (m): [string[], Destino] => [[m, `cuota ${m}`, `cuota social ${m}`, m.slice(0, 3)], { tipo: 'cuota', concepto: m }],
  ),
  [['setiembre', 'cuota setiembre'], { tipo: 'cuota', concepto: 'septiembre' }],
  [['distrito', 'cuota distrito'], { tipo: 'cuota', concepto: 'distrito' }],
  [['afiliacion', 'cuota afiliacion'], { tipo: 'cuota', concepto: 'afiliacion' }],
  // RD-003: las dos columnas de retiro de la planilla se unifican en un documento.
  [
    ['retiro solo', 'retirarse solo', 'se retira solo', 'puede retirarse solo', 'autorizacion retiro', 'autorizacion para retirarse solo', 'autorizacion retirarse solo', 'retiro', 'autorizacion de retiro', 'retiro sin adulto'],
    { tipo: 'documento', documento: 'retiroSolo' },
  ],
  [['ddjj', 'ddjj salud', 'ddjj de salud', 'declaracion jurada', 'declaracion jurada de salud', 'ficha medica', 'ficha de salud'], { tipo: 'documento', documento: 'ddjjSalud' }],
  [['uso de imagen', 'imagen', 'autorizacion imagen', 'autorizacion de imagen', 'autorizacion de uso de imagen', 'derecho de imagen', 'fotos'], { tipo: 'documento', documento: 'usoImagen' }],
  [['pdf', 'pdf adjunto', 'adjunto'], { tipo: 'documento', documento: 'pdfAdjunto' }],
  [['consentimiento', 'consentimiento datos', 'consentimiento de datos', 'autorizacion de datos', 'datos personales'], { tipo: 'documento', documento: 'consentimiento' }],
];

const MAPA = new Map<string, Destino>();
for (const [nombres, destino] of ALIAS) for (const n of nombres) MAPA.set(n, destino);

/** Cálculos de la planilla que la app calcula sola y no se importan. */
const CALCULADOS = new Set(['edad', 'cumpleanos', 'cumple', 'dia de cumpleanos', 'estado tada', 'puede tada', 'va', 'logo', 'logo elemento', 'logo promesa']);

export function destinoDeEncabezado(h: string): Destino | null {
  const n = normalizarEncabezado(h);
  if (!n) return { tipo: 'ignorar' };
  if (CALCULADOS.has(n)) return { tipo: 'ignorar' };
  return MAPA.get(n) ?? null;
}

// ---------------------------------------------------------------------------
// Valores

const SI = new Set(['si', 's', 'x', '1', 'true', 'verdadero', 'tiene', 'ok']);
const NO = new Set(['no', 'n', '0', 'false', 'falso', 'no tiene', '-']);

export function interpretarSiNo(v: string): boolean | null | 'invalido' {
  const n = normalizarTexto(v);
  if (!n) return null;
  if (SI.has(n)) return true;
  if (NO.has(n)) return false;
  return 'invalido';
}

/** RN-05. "X" y otros valores sin significado claro quedan sin dato (RF-050). */
export function interpretarCuota(v: string): 'pagada' | 'adeudada' | 'exenta' | null | 'invalido' {
  const n = normalizarTexto(v);
  if (!n) return null;
  if (['pagada', 'pagado', 'pago', 'paga', 'p', 'si', 'ok', '✓', '✔'].includes(n)) return 'pagada';
  if (['adeudada', 'adeudado', 'adeuda', 'debe', 'deuda', 'd', 'no', 'pendiente', 'impaga'].includes(n)) return 'adeudada';
  if (['exenta', 'exento', 'e', 'beca', 'becado', 'becada', 'no corresponde', 'n c'].includes(n)) return 'exenta';
  return 'invalido';
}

export function interpretarCordi(v: string): 'coordinador' | 'subcoordinador' | null | 'invalido' {
  const n = normalizarTexto(v).replace(/\./g, '');
  if (!n) return null;
  if (['c', 'coordinador', 'coordinadora', 'cordi', 'coord', 'si'].includes(n)) return 'coordinador';
  if (['sc', 's', 'sub', 'subcoordinador', 'subcoordinadora', 'subcordi', 'sub cordi', 'subcoord'].includes(n)) return 'subcoordinador';
  if (NO.has(n)) return null;
  return 'invalido';
}

/** Expresión para detectar filas de adultos aunque la categoría no esté cargada en el catálogo. */
export const RE_ADULTO = /\b(educador|educadora|dirigente|colaborador|colaboradora|jefe|jefa|subjefe|subjefa|adulto|adulta|scouter|asesor|asesora)\b/;
