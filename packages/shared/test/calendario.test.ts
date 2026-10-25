import { describe, expect, it } from 'vitest';
import type { ActividadDTO } from '../src/actividades';
import {
  cumpleaniosEnAnio,
  diaSemana,
  eventosPorDia,
  momentoAviso,
  preferenciasCompletas,
  recibeAviso,
  semanasDelMes,
  textoAvisoActividad,
  validarAntelaciones,
} from '../src/calendario';

const actividad = (extra: Partial<ActividadDTO> = {}): ActividadDTO => ({
  id: 'a1',
  grupoId: 'g1',
  tipoId: 't1',
  nombre: 'Campamento',
  inicio: '2027-03-14T12:00:00.000Z',
  fin: '2027-03-16T19:00:00.000Z',
  lugar: 'Tandil',
  alcance: 'rama',
  ramaId: 'r1',
  equipoId: null,
  canceladaEn: null,
  avisos: [],
  destinoAvisos: { tipo: 'alcance' },
  inscripciones: [],
  ...extra,
});

describe('RN-16 avisos de una actividad', () => {
  it('sábado 14:00 con avisos de 1 día y 1 hora: viernes 14:00 y sábado 13:00', () => {
    const inicio = '2026-11-07T17:00:00.000Z'; // sábado 14:00 en Argentina
    expect(momentoAviso(inicio, '1d').toISOString()).toBe('2026-11-06T17:00:00.000Z');
    expect(momentoAviso(inicio, '1h').toISOString()).toBe('2026-11-07T16:00:00.000Z');
    expect(momentoAviso(inicio, '0m').toISOString()).toBe(inicio);
  });

  it('admite hasta 2 avisos, sin repetidos', () => {
    expect(validarAntelaciones(['1d', '1h'])).toBeNull();
    expect(validarAntelaciones(['1d', '1h', '1w'])).toMatch(/hasta 2/);
    expect(validarAntelaciones(['1d', '1d'])).toMatch(/repetidos/);
    expect(validarAntelaciones(['2d'])).toMatch(/inválida/);
  });

  it('arma el texto con la fecha y el lugar', () => {
    expect(textoAvisoActividad(actividad(), '1d')).toEqual({ titulo: 'Campamento', cuerpo: 'Empieza en 1 día: 14/03/2027 09:00 al 16/03/2027 16:00 · Tandil' });
  });
});

describe('RF-084 preferencias de avisos', () => {
  it('todo activo salvo lo desactivado; lo importante llega igual', () => {
    const p = preferenciasCompletas([{ tipo: 'cumpleanios', canal: 'mail', activo: false }, { tipo: 'manuales', canal: 'push', activo: false }]);
    expect(recibeAviso(p, 'cumpleanios', 'mail')).toBe(false);
    expect(recibeAviso(p, 'cumpleanios', 'push')).toBe(true);
    expect(recibeAviso(p, 'manuales', 'push')).toBe(false);
    expect(recibeAviso(p, 'manuales', 'push', true)).toBe(true);
  });
});

describe('RF-072 a RF-077 calendario', () => {
  it('el 29/02 se festeja el 28/02 en años no bisiestos', () => {
    expect(cumpleaniosEnAnio('2012-02-29', 2027)).toBe('2027-02-28');
    expect(cumpleaniosEnAnio('2012-02-29', 2028)).toBe('2028-02-29');
    expect(cumpleaniosEnAnio('2011-02-22', 2027)).toBe('2027-02-22');
  });

  it('semanas de lunes a domingo que cubren el mes', () => {
    const s = semanasDelMes(2026, 11);
    expect(diaSemana('2026-11-01')).toBe(6); // domingo
    expect(s[0]![0]).toBe('2026-10-26');
    expect(s.at(-1)!.at(-1)).toBe('2026-12-06'); // el 30/11 es lunes
    expect(s).toHaveLength(6);
  });

  it('junta actividades, cumpleaños, feriados y recordatorios por día', () => {
    const eventos = eventosPorDia('2027-02-01', '2027-03-31', {
      actividades: [actividad()],
      colorDeTipo: () => '#0B4F8A',
      fichas: [
        { id: 'f1', apellido: 'Paz', nombre: 'Ana', fechaNacimiento: '2011-02-22', estado: 'activa' },
        { id: 'f2', apellido: 'Sosa', nombre: 'Luz', fechaNacimiento: '2011-02-22', estado: 'archivada' },
      ],
      feriados: [{ id: null, fecha: '2027-03-24', nombre: 'Día de la Memoria', origen: 'nacional' }],
      recordatorios: [{ id: 'r1', fecha: '2027-03-14', hora: '08:00', titulo: 'Comprar pan' }],
    });
    expect(eventos.get('2027-02-22')!.map((e) => e.titulo)).toEqual(['Cumpleaños de Paz, Ana']);
    expect(eventos.get('2027-03-14')!.map((e) => [e.titulo, e.hora])).toEqual([
      ['Comprar pan', '08:00'],
      ['Campamento', '09:00'],
    ]);
    expect(eventos.get('2027-03-16')!.map((e) => [e.titulo, e.hora])).toEqual([['Campamento', null]]);
    expect(eventos.get('2027-03-24')![0]!.tipo).toBe('feriado');
    expect(eventos.has('2027-03-17')).toBe(false);
  });
});
