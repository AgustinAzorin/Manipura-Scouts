import { describe, expect, it } from 'vitest';
import {
  faltantesAnexo,
  faltantesVersionFinal,
  fechaFicha,
  formatearDuracion,
  interpretarDesarrollo,
  listaDeCompras,
  materialesDeFila,
  ordenarAreas,
  ordenarGrilla,
  textoResponsable,
  type FilaGrilla,
} from '../src/fichaActividad';

const fila = (hora: string, anexo: number | null = null, extra: Partial<FilaGrilla> = {}): FilaGrilla => ({
  hora,
  nombre: `Actividad ${hora}`,
  responsable: { tipo: 'todos' },
  observaciones: '',
  anexo,
  ...extra,
});

const usuarios = [
  { id: 'u1', nombre: 'Brisa Cáceres' },
  { id: 'u2', nombre: 'Marta Cáceres' },
  { id: 'u3', nombre: 'Mauro Azorin' },
  { id: 'u4', nombre: 'Mauro Pérez' },
];

describe('RF-093 grilla ordenada por hora', () => {
  it('ordena las 7 filas por hora y conserva el orden de carga en la misma hora', () => {
    const filas = [fila('18:00'), fila('14:30', 1), fila('14:00'), fila('16:00', 3), fila('15:40', 2), fila('15:00'), fila('17:00')];
    expect(ordenarGrilla(filas).map((f) => f.hora)).toEqual(['14:00', '14:30', '15:00', '15:40', '16:00', '17:00', '18:00']);
    const iguales = [fila('10:00', null, { nombre: 'B' }), fila('09:00'), fila('10:00', null, { nombre: 'A' })];
    expect(ordenarGrilla(iguales).map((f) => f.nombre)).toEqual(['Actividad 09:00', 'B', 'A']);
  });
});

describe('RF-094 responsable', () => {
  it('muestra "Todos", el texto escrito a mano o el nombre de pila de los usuarios', () => {
    expect(textoResponsable({ tipo: 'todos' }, usuarios)).toBe('Todos');
    expect(textoResponsable({ tipo: 'texto', texto: 'Nehuen' }, usuarios)).toBe('Nehuen');
    expect(textoResponsable({ tipo: 'usuarios', ids: ['u1', 'u2'] }, usuarios)).toBe('Brisa\nMarta');
    expect(textoResponsable(null, usuarios)).toBe('-');
  });

  it('usa el nombre completo si otro usuario de la rama tiene el mismo nombre de pila', () => {
    expect(textoResponsable({ tipo: 'usuarios', ids: ['u3'] }, usuarios)).toBe('Mauro Azorin');
  });
});

describe('RF-096 campos obligatorios del anexo', () => {
  it('indica los que faltan', () => {
    expect(faltantesAnexo({ titulo: ' ', categoriaId: null, desarrollo: '' })).toEqual(['titulo', 'categoriaId', 'desarrollo']);
    expect(faltantesAnexo({ titulo: 'La telaraña del reencuentro', categoriaId: 'c1', desarrollo: 'Se invita…' })).toEqual([]);
  });
});

describe('RF-101 / RN-09 versión final', () => {
  it('con los anexos 1, 2 y 3 en la grilla y el 3 incompleto, indica el 3', () => {
    const grilla = [fila('14:00'), fila('14:30', 1), fila('15:40', 2), fila('16:00', 3)];
    const anexos = [
      { numero: 1, completo: true },
      { numero: 2, completo: true },
      { numero: 3, completo: false },
    ];
    expect(faltantesVersionFinal({ grilla, areas: [], anexos })).toEqual(['Falta completar el anexo 3']);
    expect(faltantesVersionFinal({ grilla, areas: [], anexos: anexos.map((a) => ({ ...a, completo: true })) })).toEqual([]);
  });

  it('un anexo que no está en la grilla no bloquea; un área sin descripción sí (RF-092)', () => {
    const r = faltantesVersionFinal({
      grilla: [fila('14:00')],
      areas: [{ area: 'caracter', descripcion: '' }],
      anexos: [{ numero: 1, completo: false }],
    });
    expect(r).toEqual(['Falta la descripción del área Carácter']);
  });
});

describe('RF-092 áreas en el orden de la lista fija', () => {
  it('ordena las elegidas', () => {
    const areas = ordenarAreas([
      { area: 'sociabilidad' as const, descripcion: 'c' },
      { area: 'corporalidad' as const, descripcion: 'a' },
      { area: 'caracter' as const, descripcion: 'b' },
    ]);
    expect(areas.map((a) => a.area)).toEqual(['corporalidad', 'caracter', 'sociabilidad']);
  });
});

describe('RF-098 materiales en la grilla', () => {
  const anexos = [
    { numero: 1, materiales: [{ cantidad: 1, descripcion: 'pelota o ovillo de lana', porEquipo: false }] },
    { numero: 3, materiales: [{ cantidad: 6, descripcion: 'palos de 1,5 m', porEquipo: true }] },
  ];
  it('la fila del anexo 1 muestra su material; una fila sin anexo muestra "-"', () => {
    expect(materialesDeFila(1, anexos)).toBe('1 pelota o ovillo de lana');
    expect(materialesDeFila(3, anexos)).toBe('6 palos de 1,5 m (por equipo)');
    expect(materialesDeFila(null, anexos)).toBe('-');
    expect(materialesDeFila(2, anexos)).toBe('-');
  });
});

describe('RF-099 / RN-10 lista de compras', () => {
  it('6 palos por equipo con 5 equipos son 30 palos', () => {
    const lista = listaDeCompras([{ numero: 3, equipos: null, materiales: [{ cantidad: 6, descripcion: 'palos de 1,5 m', porEquipo: true }] }], 5);
    expect(lista).toEqual([{ cantidad: 30, descripcion: 'palos de 1,5 m', anexos: [3] }]);
  });

  it('agrupa descripciones idénticas, suma cantidades y respeta los equipos propios del anexo', () => {
    const lista = listaDeCompras(
      [
        { numero: 2, equipos: null, materiales: [{ cantidad: 2, descripcion: 'Sogas largas', porEquipo: false }] },
        {
          numero: 3,
          equipos: 4,
          materiales: [
            { cantidad: 1, descripcion: 'sogas  largas', porEquipo: true },
            { cantidad: 1.5, descripcion: 'kg de harina', porEquipo: false },
            { cantidad: null, descripcion: 'espacio de lanzamiento', porEquipo: false },
          ],
        },
      ],
      5,
    );
    expect(lista).toEqual([
      { cantidad: 6, descripcion: 'Sogas largas', anexos: [2, 3] },
      { cantidad: 1.5, descripcion: 'kg de harina', anexos: [3] },
      { cantidad: null, descripcion: 'espacio de lanzamiento', anexos: [3] },
    ]);
  });
});

describe('textos del PDF', () => {
  it('fecha larga como en el ejemplo', () => {
    expect(fechaFicha('2026-03-14T17:00:00Z', '2026-03-14T21:00:00Z')).toBe('14 de marzo del 2026');
    expect(fechaFicha('2026-11-14T12:00:00Z', '2026-11-16T19:00:00Z')).toBe('14 al 16 de noviembre del 2026');
    expect(fechaFicha('2026-10-30T12:00:00Z', '2026-11-01T19:00:00Z')).toBe('30 de octubre al 1 de noviembre del 2026');
  });

  it('duración', () => {
    expect(formatearDuracion(30)).toBe('30 minutos');
    expect(formatearDuracion(60)).toBe('1 hora');
    expect(formatearDuracion(150)).toBe('2 horas 30 minutos');
  });
});

describe('desarrollo con negrita y listas (RD-005)', () => {
  it('separa párrafos, listas y negritas', () => {
    const texto = 'Se divide al grupo en **cinco equipos**.\nCada uno recibe materiales.\n\nPuntos:\n- 5 si **entra**\n- 3 si cae cerca\n\nGana el que más suma.';
    expect(interpretarDesarrollo(texto)).toEqual([
      {
        tipo: 'parrafo',
        segmentos: [
          { texto: 'Se divide al grupo en ', negrita: false },
          { texto: 'cinco equipos', negrita: true },
          { texto: '.\nCada uno recibe materiales.', negrita: false },
        ],
      },
      { tipo: 'parrafo', segmentos: [{ texto: 'Puntos:', negrita: false }] },
      {
        tipo: 'lista',
        items: [
          [
            { texto: '5 si ', negrita: false },
            { texto: 'entra', negrita: true },
          ],
          [{ texto: '3 si cae cerca', negrita: false }],
        ],
      },
      { tipo: 'parrafo', segmentos: [{ texto: 'Gana el que más suma.', negrita: false }] },
    ]);
  });

  it('un "**" sin cerrar queda como texto', () => {
    expect(interpretarDesarrollo('a **b')).toEqual([{ tipo: 'parrafo', segmentos: [{ texto: 'a **b', negrita: false }] }]);
  });
});
