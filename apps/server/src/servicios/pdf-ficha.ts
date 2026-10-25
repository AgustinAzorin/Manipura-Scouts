import { createRequire } from 'node:module';
import path from 'node:path';
import {
  formatearCantidad,
  formatearDuracion,
  fechaFicha,
  horaFicha,
  interpretarDesarrollo,
  listaDeCompras,
  materialesDeFila,
  NOMBRE_AREA,
  ordenarAreas,
  ordenarGrilla,
  textoEdades,
  textoMaterial,
  textoResponsable,
  type AnexoDTO,
  type FichaActividadDTO,
  type MaterialAnexo,
  type Segmento,
} from '@scouttracker/shared';
import type * as PdfMake from 'pdfmake';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';

const requerir = createRequire(import.meta.url);
const pdfmake = requerir('pdfmake') as typeof PdfMake;
const DIR_FUENTES = path.join(path.dirname(requerir.resolve('pdfmake/fonts/Roboto.js')), 'Roboto');

pdfmake.setFonts({
  Roboto: {
    normal: path.join(DIR_FUENTES, 'Roboto-Regular.ttf'),
    bold: path.join(DIR_FUENTES, 'Roboto-Medium.ttf'),
    italics: path.join(DIR_FUENTES, 'Roboto-Italic.ttf'),
    bolditalics: path.join(DIR_FUENTES, 'Roboto-MediumItalic.ttf'),
  },
});
// El contenido lo escriben los usuarios: el PDF no descarga nada ni lee otros archivos del servidor.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((ruta) => path.resolve(ruta).startsWith(DIR_FUENTES));

export interface OpcionesPdf {
  /** RF-100: marca "BORRADOR" y anexos pendientes. */
  borrador: boolean;
  logo: { datos: Buffer; mime: string } | null;
}

/** Celeste de las cabeceras de los anexos del ejemplo; con texto negro el contraste es 7,7:1. */
const COLOR_ANEXO = '#6D9EEB';
// fontkit acepta un objeto para apagar funciones que vienen activas; los tipos solo prevén la lista.
const SIN_LIGADURAS = { liga: false, clig: false } as unknown as PDFKit.Mixins.OpenTypeFeatures[];

const etiqueta = (titulo: string, valor: string): Content => ({ text: [{ text: titulo, bold: true }, `: ${valor}`] });
/** Título de sección: no queda solo al pie de una página (ver `pageBreakBefore`). */
const titulo = (texto: string, extra: Partial<Record<'decoration' | 'margin', unknown>> = {}): Content =>
  ({ text: texto, bold: true, margin: [0, 6, 0, 0], headlineLevel: 1, ...extra }) as Content;
const enLinea = (segmentos: Segmento[]) => segmentos.map((s) => ({ text: s.texto, bold: s.negrita }));
const lista = (items: string[]): Content => ({ ul: items, margin: [16, 2, 0, 8] });

function desarrollo(texto: string): Content[] {
  return interpretarDesarrollo(texto).map((b) =>
    b.tipo === 'parrafo' ? { text: enLinea(b.segmentos), margin: [0, 0, 0, 6] } : { ul: b.items.map((i) => ({ text: enLinea(i) })), margin: [12, 0, 0, 6] },
  );
}

function celdaMateriales(a: AnexoDTO, equipos: number): Content[] {
  const porEquipo = a.materiales.filter((m) => m.porEquipo);
  const generales = a.materiales.filter((m) => !m.porEquipo);
  const items = (ms: MaterialAnexo[]) => lista(ms.map(textoMaterial));
  if (a.materiales.length === 0) return [{ text: [{ text: 'Materiales', bold: true }, ': -'] }];
  const partes: Content[] = [];
  if (porEquipo.length) partes.push({ text: `Materiales por equipo (${a.equipos ?? equipos} equipos):`, bold: true }, items(porEquipo));
  if (generales.length) partes.push({ text: porEquipo.length ? 'Material general:' : 'Materiales:', bold: true }, items(generales));
  return partes;
}

/** Un anexo como la tabla del ejemplo; todos con el mismo formato (RF-102). */
function tablaAnexo(a: AnexoDTO, ficha: FichaActividadDTO, borrador: boolean): Content {
  const encabezadoAnexo: TableCell = {
    text: `ANEXO ${a.numero}${a.titulo.trim() ? `   ${a.titulo.trim()}` : ''}`,
    bold: true,
    colSpan: 3,
    fillColor: COLOR_ANEXO,
    margin: [4, 6, 4, 6],
  };
  const fila3 = (c: TableCell): TableCell[] => [Object.assign(c, { colSpan: 3 }), {}, {}];
  if (borrador && !a.completo) {
    const quien = a.asignadoA ? `asignado a ${a.asignadoA.nombre}` : 'sin asignar';
    return {
      table: { widths: ['*', '*', '*'], headerRows: 1, keepWithHeaderRows: 1, body: [[encabezadoAnexo, {}, {}], fila3({ text: `Pendiente — ${quien}`, italics: true, margin: [4, 8, 4, 8] })] },
      margin: [0, 16, 0, 0],
    };
  }
  const categoria = ficha.categorias.find((c) => c.id === a.categoriaId)?.nombre ?? '';
  const valor = (t: string, v: string): TableCell => ({ text: [{ text: `${t}: `, bold: true }, v || '-'] });
  return {
    table: {
      widths: ['*', '*', '*'],
      // El título se repite si el anexo sigue en otra página.
      headerRows: 1,
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      body: [
        [encabezadoAnexo, {}, {}],
        [valor('Categoría', categoria), valor('Edad', textoEdades(a.edadDesde, a.edadHasta)), valor('Cantidad de participantes', a.participantes?.toString() ?? '')],
        [valor('Espacio', a.espacio), valor('Duración', formatearDuracion(a.duracionMinutos)), valor('Cantidad de educadores', a.educadores)],
        fila3(valor('Motivación', a.motivacion)),
        [{ stack: celdaMateriales(a, ficha.equiposActivos) }, valor('Objetivos', a.objetivos), valor('Áreas', a.areas)],
        fila3({ stack: [{ text: 'Desarrollo:', bold: true, margin: [0, 0, 0, 4] }, ...desarrollo(a.desarrollo)] }),
      ],
    },
    margin: [0, 16, 0, 0],
  };
}

/**
 * RF-102: el PDF con el orden de secciones del ejemplo (RES-04). En la versión final van solo los
 * anexos completos; en el borrador, todos, con los faltantes señalados como pendientes.
 */
export function definicionPdf(ficha: FichaActividadDTO, op: OpcionesPdf): TDocumentDefinitions {
  const anexos = op.borrador ? ficha.anexos : ficha.anexos.filter((a) => a.completo);
  const contenido: Content[] = [];

  // Portada
  contenido.push({ text: [ficha.cabecera.nombreGrupo, '\n', ficha.cabecera.nombreComunidad], style: 'portada' });
  if (op.logo) contenido.push({ image: 'logo', fit: [200, 300], alignment: 'center', margin: [0, 24, 0, 32] });
  else contenido.push({ text: '', margin: [0, 0, 0, 24] });

  // Fecha, lugar y diagnóstico
  contenido.push(
    etiqueta('Fecha', fechaFicha(ficha.actividad.inicio, ficha.actividad.fin)),
    etiqueta('Lugar', ficha.actividad.lugar ?? '-'),
    etiqueta('Diagnóstico', ficha.diagnostico.trim() || '-'),
  );
  if (ficha.cabecera.educadores.length) {
    contenido.push(
      titulo('Equipo de educadores:'),
      lista(ficha.cabecera.educadores.map((e) => [e.nombre, e.cargo && `(${e.cargo})`, e.formacion && `— ${e.formacion}`].filter(Boolean).join(' '))),
    );
  }

  // Justificación (RF-090)
  contenido.push(
    { text: '', margin: [0, 6, 0, 0] },
    etiqueta('Por qué se debe realizar esta actividad', ficha.porQue.trim() || '-'),
    etiqueta('A qué responde', ficha.aQueResponde.trim() || '-'),
    etiqueta('Dónde se detectó la necesidad', ficha.dondeNecesidad.trim() || '-'),
    etiqueta('Por qué se eligió este lugar', ficha.porQueLugar.trim() || '-'),
  );

  // Objetivos (RF-091)
  contenido.push(titulo('Objetivos educativos:'));
  contenido.push(ficha.objetivosEducativos.length ? lista(ficha.objetivosEducativos) : { text: '-' });
  contenido.push(titulo('Objetivos que persigue el dirigente:'));
  contenido.push(ficha.objetivosDirigente.length ? lista(ficha.objetivosDirigente) : { text: '-' });

  // Áreas a trabajar (RF-092)
  contenido.push(titulo('Áreas a trabajar:', { decoration: 'underline', margin: [0, 6, 0, 4] }));
  const areas = ordenarAreas(ficha.areas);
  contenido.push(
    areas.length
      ? { stack: areas.map((a, i) => ({ text: [`${i + 1}- `, { text: NOMBRE_AREA[a.area], decoration: 'underline' }, `: ${a.descripcion.trim()}`], margin: [16, 0, 0, 2] })) }
      : { text: '-' },
  );

  // Programación de actividades (RF-093, RF-094, RF-098)
  const encabezado = ['HORA', 'NOMBRE ACTIVIDAD', 'RESPONSABLE', 'MATERIALES', 'OBSERVACIONES', 'ANEXO'].map((t) => ({ text: t, style: 'encabezadoTabla' }));
  const filas = ordenarGrilla(ficha.grilla).map((f) => [
    horaFicha(f.hora),
    f.nombre,
    { text: textoResponsable(f.responsable, ficha.usuariosRama), alignment: 'center' as const },
    materialesDeFila(f.anexo, anexos),
    f.observaciones.trim() || '-',
    { text: f.anexo?.toString() ?? '-', alignment: 'center' as const },
  ]);
  contenido.push(
    titulo('Programación de actividades', { margin: [0, 20, 0, 4] }),
    {
      table: { headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: true, widths: [38, '*', 72, '*', 72, 38], body: [encabezado, ...filas] },
      style: 'tabla',
    },
  );
  if (filas.length === 0) contenido.push({ text: 'Sin actividades cargadas.', italics: true, margin: [0, 4, 0, 0] });

  // Un anexo por sección (RF-102)
  for (const a of anexos) contenido.push(tablaAnexo(a, ficha, op.borrador));

  // Lista de compras / logística (RF-099, RN-10)
  const compras = listaDeCompras(anexos, ficha.equiposActivos);
  contenido.push({ text: 'Lista de compras / logística', style: 'titulo', pageBreak: 'before' });
  contenido.push(
    compras.length
      ? {
          table: {
            headerRows: 1,
            widths: [60, '*', 60],
            body: [
              ['CANTIDAD', 'MATERIAL', 'ANEXO'].map((t) => ({ text: t, style: 'encabezadoTabla' })),
              ...compras.map((c) => [
                { text: c.cantidad === null ? '-' : formatearCantidad(c.cantidad), alignment: 'center' as const },
                c.descripcion,
                { text: c.anexos.join(', '), alignment: 'center' as const },
              ]),
            ],
          },
          style: 'tabla',
        }
      : { text: 'Los anexos no tienen materiales cargados.', italics: true },
  );

  return {
    pageSize: 'A4',
    pageMargins: [64, 56, 64, 56],
    info: { title: `Ficha de Actividad — ${ficha.actividad.nombre}`, subject: ficha.cabecera.nombreComunidad },
    ...(op.borrador
      ? {
          watermark: { text: 'BORRADOR', color: '#9E9E9E', opacity: 0.25, bold: true },
          header: () => ({ text: 'BORRADOR', bold: true, color: '#A11D1D', alignment: 'right', margin: [0, 24, 64, 0] }),
        }
      : {}),
    ...(op.logo ? { images: { logo: `data:${op.logo.mime};base64,${op.logo.datos.toString('base64')}` } } : {}),
    content: contenido,
    pageBreakBefore: (nodo) => nodo.headlineLevel === 1 && nodo.startPosition.verticalRatio > 0.88,
    // Sin ligaduras: con "fi" ligada, al copiar o buscar texto del PDF se pierde la "i".
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.35, fontFeatures: SIN_LIGADURAS },
    styles: {
      portada: { fontSize: 14, bold: true, alignment: 'center', lineHeight: 1.6, margin: [0, 32, 0, 0] },
      titulo: { fontSize: 13, bold: true, margin: [0, 0, 0, 8] },
      tabla: { fontSize: 10, lineHeight: 1.15 },
      encabezadoTabla: { bold: true, fontSize: 8, alignment: 'center' },
    },
  };
}

export async function generarPdfFicha(ficha: FichaActividadDTO, op: OpcionesPdf): Promise<Buffer> {
  return pdfmake.createPdf(definicionPdf(ficha, op)).getBuffer();
}
