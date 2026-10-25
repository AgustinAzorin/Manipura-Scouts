import ExcelJS from 'exceljs';
import {
  CONCEPTOS_CUOTA,
  DEF_DOCUMENTOS,
  NOMBRE_CONCEPTO_CUOTA,
  NOMBRE_ESTADO_CUOTA,
  NOMBRE_ESTADO_DOCUMENTO,
  columnasDisponibles,
  formatearFecha,
  formatearFechaHora,
  valorColumna,
  type FechaISO,
  type FichaDTO,
  type IndiceRama,
} from '@scouttracker/shared';

export interface OpcionesExportacion {
  verSensibles: boolean;
  verCuotas: boolean;
  verDocumentos: boolean;
  /** Filtros en palabras, para la hoja de datos de la exportación (RNF-043). */
  filtros: string[];
  /** Nombre del equipo de la vista por equipo (RF-034), si se exporta esa vista. */
  equipo: string | null;
  usuario: string;
  generadoEn: Date;
  hoy: FechaISO;
}

interface ColumnaXlsx {
  titulo: string;
  ancho: number;
  valor: (f: FichaDTO) => string | number | null;
  formato?: string;
}

/**
 * RF-115 / RF-116 / RI-007: la nómina en XLSX con todas las columnas que el usuario puede ver en la
 * rama (fijas, campos propios activos, cuotas y documentos). Las fichas ya vienen filtradas,
 * ordenadas y sin los campos que el usuario no puede ver; sin el permiso de datos sensibles tampoco
 * se arman sus columnas.
 */
export async function nominaXlsx(fichas: FichaDTO[], ix: IndiceRama, op: OpcionesExportacion): Promise<Buffer> {
  const columnas: ColumnaXlsx[] = columnasDisponibles(ix.rama, op.verSensibles).map((c) => {
    const ancho = Math.max(10, Math.round(c.ancho / 7));
    // La edad va como número para poder ordenar y filtrar en la planilla.
    if (c.id === 'edad') {
      return {
        titulo: c.etiqueta,
        ancho,
        formato: '0.0',
        valor: (f) => {
          const orden = valorColumna(f, 'edad', ix, op.hoy).orden;
          return typeof orden === 'number' && orden >= 0 ? orden : null;
        },
      };
    }
    return {
      titulo: c.etiqueta,
      ancho,
      valor: (f) => {
        const v = valorColumna(f, c.id, ix, op.hoy);
        return v.texto ? `${v.texto}${v.inactivo ? ' (inactivo)' : ''}` : null;
      },
    };
  });
  if (op.verCuotas) {
    for (const concepto of CONCEPTOS_CUOTA) {
      columnas.push({
        titulo: `Cuota ${NOMBRE_CONCEPTO_CUOTA[concepto]}`,
        ancho: 14,
        valor: (f) => {
          const e = f.cuotas?.[concepto];
          return e ? NOMBRE_ESTADO_CUOTA[e] : null;
        },
      });
    }
  }
  if (op.verDocumentos) {
    // RF-116: sin el permiso de datos sensibles solo queda el PDF adjunto general.
    for (const def of DEF_DOCUMENTOS.filter((d) => op.verSensibles || !d.sensible)) {
      columnas.push({
        titulo: def.nombre,
        ancho: 26,
        valor: (f) => {
          const d = f.documentos?.find((x) => x.tipo === def.tipo);
          if (!d) return null;
          return `${NOMBRE_ESTADO_DOCUMENTO[d.estado]}${d.fechaEntrega ? ` (${formatearFecha(d.fechaEntrega)})` : ''}`;
        },
      });
    }
  }

  const libro = new ExcelJS.Workbook();
  libro.creator = 'ScoutTracker';
  libro.created = op.generadoEn;
  const hoja = libro.addWorksheet('Nómina', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  hoja.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho, style: c.formato ? { numFmt: c.formato } : {} }));
  hoja.getRow(1).font = { bold: true };
  for (const f of fichas) hoja.addRow(columnas.map((c) => c.valor(f)));
  if (columnas.length) hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };

  const datos = libro.addWorksheet('Datos de la exportación');
  datos.columns = [{ width: 24 }, { width: 60 }];
  const filas: [string, string | number][] = [
    ['Rama', ix.rama.nombre],
    ...(ix.rama.comunidad ? [['Comunidad', ix.rama.comunidad] as [string, string]] : []),
    ['Vista', op.equipo ? `Equipo ${op.equipo}` : 'Toda la rama'],
    ['Filtros', op.filtros.length ? op.filtros.join(' · ') : 'Ninguno'],
    ['Fichas', fichas.length],
    ['Exportado por', op.usuario],
    ['Fecha y hora', formatearFechaHora(op.generadoEn)],
  ];
  for (const [k, v] of filas) datos.addRow([k, v]).getCell(1).font = { bold: true };

  return Buffer.from(await libro.xlsx.writeBuffer());
}
