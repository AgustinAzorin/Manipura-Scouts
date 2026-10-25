import { describe, expect, it } from 'vitest';
import type { ActividadDTO, InscripcionDTO, TipoActividadDTO } from '../src/actividades';
import type { DocumentoDTO, FichaDTO } from '../src/api';
import { autorizacionesPendientes, cuotasPendientes, cumpleaniosDelMes, documentosPendientes, proximasActividades } from '../src/inicio';

let n = 0;
const ficha = (extra: Partial<FichaDTO>): FichaDTO => ({
  id: `f${++n}`,
  grupoId: 'g1',
  ramaId: 'r1',
  estado: 'activa',
  version: 1,
  incompletaMotivos: [],
  camposPropios: {},
  archivadaEn: null,
  creadoEn: '',
  actualizadoEn: '',
  apellido: 'Apellido',
  nombre: 'Nombre',
  fechaNacimiento: '2010-01-01',
  ...extra,
});

describe('RF-113 cumpleaños del mes', () => {
  it('lista los del mes en curso por día, con los años que cumple', () => {
    const fichas = [
      ficha({ apellido: 'C', fechaNacimiento: '2010-10-30' }),
      ficha({ apellido: 'A', fechaNacimiento: '2011-10-02' }),
      ficha({ apellido: 'B', fechaNacimiento: '2009-11-02' }),
      ficha({ apellido: 'D', fechaNacimiento: '2008-10-24' }),
      ficha({ apellido: 'E', fechaNacimiento: null }),
    ];
    const r = cumpleaniosDelMes(fichas, '2026-10-24');
    expect(r.map((c) => [c.apellido, c.fecha, c.cumple])).toEqual([
      ['A', '2026-10-02', 15],
      ['D', '2026-10-24', 18],
      ['C', '2026-10-30', 16],
    ]);
  });
  it('el 29/02 se festeja el 28/02 en años no bisiestos', () => {
    expect(cumpleaniosDelMes([ficha({ fechaNacimiento: '2012-02-29' })], '2027-02-10').map((c) => c.fecha)).toEqual(['2027-02-28']);
  });
});

const doc = (tipo: DocumentoDTO['tipo'], estado: DocumentoDTO['estado']): DocumentoDTO => ({ tipo, estado, fechaEntrega: null, archivo: null });

describe('RF-114 pendientes', () => {
  it('documentos no presentados, sin reclamar el PDF adjunto general', () => {
    const fichas = [
      ficha({
        apellido: 'B',
        documentos: [doc('retiroSolo', 'presentadoNoAutoriza'), doc('ddjjSalud', 'noPresentado'), doc('usoImagen', 'noPresentado'), doc('pdfAdjunto', 'noPresentado'), doc('consentimiento', 'presentado')],
      }),
      ficha({ apellido: 'A', documentos: [doc('ddjjSalud', 'noPresentado'), doc('pdfAdjunto', 'noPresentado')] }),
      ficha({ apellido: 'C', documentos: [doc('ddjjSalud', 'presentado')] }),
    ];
    const r = documentosPendientes(fichas)!;
    expect(r.cantidad).toBe(3);
    expect(r.fichas.map((f) => [f.apellido, f.detalle])).toEqual([
      ['A', ['DDJJ de salud']],
      ['B', ['DDJJ de salud', 'Autorización de uso de imagen']],
    ]);
  });
  it('sin permiso de ver Documentos no hay contador', () => {
    expect(documentosPendientes([ficha({})])).toBeNull();
  });
  it('cuotas: solo cuentan las adeudadas; la exenta no figura', () => {
    const fichas = [
      ficha({ apellido: 'A', cuotas: { mayo: 'adeudada', junio: 'pagada', afiliacion: 'exenta' } }),
      ficha({ apellido: 'B', cuotas: { abril: 'adeudada', distrito: 'adeudada', julio: null } }),
      ficha({ apellido: 'C', cuotas: {} }),
    ];
    const r = cuotasPendientes(fichas)!;
    expect(r.cantidad).toBe(3);
    expect(r.fichas.map((f) => [f.apellido, f.detalle])).toEqual([
      ['A', ['Mayo']],
      ['B', ['Abril', 'Distrito']],
    ]);
    expect(cuotasPendientes([ficha({})])).toBeNull();
  });
});

const tipos: TipoActividadDTO[] = [
  { id: 'reunion', nombre: 'Reunión de sábado', color: '#1F4D2B', requiereAutorizacion: false, activo: true },
  { id: 'campa', nombre: 'Campamento', color: '#0B4F8A', requiereAutorizacion: true, activo: true },
];
const insc = (fichaId: string, extra: Partial<InscripcionDTO> = {}): InscripcionDTO => ({
  fichaId,
  apellido: null,
  nombre: null,
  equipoId: null,
  confirmacion: 'va',
  presente: false,
  autorizacion: { estado: 'noPresentada', fecha: null, archivo: null },
  ...extra,
});
const actividad = (id: string, tipoId: string, inicio: string, extra: Partial<ActividadDTO> = {}): ActividadDTO => ({
  id,
  grupoId: 'g1',
  tipoId,
  nombre: id,
  inicio,
  fin: new Date(new Date(inicio).getTime() + 3 * 3600_000).toISOString(),
  lugar: null,
  alcance: 'rama',
  ramaId: 'r1',
  equipoId: null,
  canceladaEn: null,
  avisos: [],
  destinoAvisos: { tipo: 'alcance' },
  inscripciones: [],
  ...extra,
});

describe('RF-113 / RF-114 actividades', () => {
  const ahora = new Date('2026-10-24T12:00:00Z');
  it('próximas: las que no terminaron, sin las canceladas, la más cercana primero', () => {
    const lista = [
      actividad('pasada', 'reunion', '2026-10-17T17:00:00Z'),
      actividad('sabado', 'reunion', '2026-10-31T17:00:00Z'),
      actividad('hoy', 'reunion', '2026-10-24T11:00:00Z'),
      actividad('cancelada', 'reunion', '2026-10-25T17:00:00Z', { canceladaEn: '2026-10-20T00:00:00Z' }),
    ];
    expect(proximasActividades(lista, ahora).map((a) => a.id)).toEqual(['hoy', 'sabado']);
  });
  it('autorizaciones faltantes de la próxima actividad que las pide', () => {
    const lista = [
      actividad('reunion', 'reunion', '2026-10-31T17:00:00Z', { inscripciones: [insc('a')] }),
      actividad('campa', 'campa', '2026-11-14T12:00:00Z', {
        inscripciones: [
          insc('a'),
          insc('b', { autorizacion: { estado: 'presentada', fecha: '2026-10-20', archivo: null } }),
          insc('c', { confirmacion: 'noVa' }),
          insc('d', { confirmacion: 'sinRespuesta' }),
          insc('e'),
        ],
      }),
    ];
    const r = autorizacionesPendientes(lista, tipos, ahora)!;
    expect(r.actividad.id).toBe('campa');
    expect(r.cantidad).toBe(2);
  });
  it('sin permiso de datos sensibles no se sabe y no hay contador', () => {
    const lista = [actividad('campa', 'campa', '2026-11-14T12:00:00Z', { inscripciones: [insc('a', { autorizacion: undefined })] })];
    expect(autorizacionesPendientes(lista, tipos, ahora)).toBeNull();
    expect(autorizacionesPendientes([], tipos, ahora)).toBeNull();
  });
});
