import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activar, Cliente, crearEntorno, escenarioBase, fichaValida, type Entorno, type Escenario } from './ayudas';

/**
 * RNF-011 / RD-001: un usuario no puede leer ni modificar datos de un grupo en el que no tiene
 * asignación. Se recorren todas las rutas que reciben ids de otro grupo.
 */
let e: Entorno;
let esc: Escenario;
let intruso: Cliente;
let ids: Record<string, string>;

beforeAll(async () => {
  e = await crearEntorno();
  esc = await escenarioBase(e);
  // Grupo B con su propio admin, que es el "intruso" respecto del grupo A.
  const grupoB = (await esc.plataforma.post('/plataforma/grupos', { nombre: 'Grupo B' })).json().id;
  await esc.plataforma.post(`/plataforma/grupos/${grupoB}/admins`, { nombre: 'Intruso', email: 'intruso@b.test' });
  intruso = await activar(e, 'intruso@b.test');
  await intruso.post(`/grupos/${grupoB}/ramas`, { nombre: 'Rama B' });

  const f = (await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida())).json();
  await esc.admin.subir(`/fichas/${f.id}/documentos/pdfAdjunto/archivo`, 'a.pdf', Buffer.from('%PDF-1.4\n%%EOF'), 'application/pdf');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4170000000049454e44ae426082', 'hex');
  const logo = (await esc.admin.subir(`/equipos/${esc.equipos['Baden Powell']}/logo`, 'l.png', png)).json().logo;
  const campo = (await esc.admin.post(`/ramas/${esc.caminantes}/campos-propios`, { nombre: 'X', tipo: 'texto', seccion: 'organizacion', sensible: false })).json().id;
  const usuarios = (await esc.admin.get(`/grupos/${esc.grupoId}/usuarios`)).json();
  const tipos = (await esc.admin.get(`/grupos/${esc.grupoId}/tipos-actividad`)).json();
  const campamento = tipos.find((t: { nombre: string }) => t.nombre === 'Campamento').id;
  const actividad = (
    await esc.admin.post('/actividades', { grupoId: esc.grupoId, tipoId: campamento, nombre: 'Campamento', inicio: '2026-11-14T12:00:00Z', fin: '2026-11-16T19:00:00Z', alcance: 'rama', ramaId: esc.caminantes })
  ).json().id;
  await esc.admin.subir(`/actividades/${actividad}/inscripciones/${f.id}/autorizacion/archivo`, 'a.pdf', Buffer.from('%PDF-1.4\n%%EOF'), 'application/pdf');
  const feriado = (await esc.admin.post(`/grupos/${esc.grupoId}/feriados`, { fecha: '2026-11-20', nombre: 'Feriado del grupo' })).json().id;
  const recordatorio = (await esc.admin.post('/recordatorios', { grupoId: esc.grupoId, fecha: '2026-11-02', titulo: 'Privado' })).json().id;
  ids = {
    feriado,
    recordatorio,
    grupo: esc.grupoId,
    rama: esc.caminantes,
    ficha: f.id,
    equipo: esc.equipos['Baden Powell']!,
    valor: esc.catalogo['Ini']!,
    rol: esc.roles['Educador']!,
    usuario: usuarios[0].id,
    asignacion: usuarios[0].asignaciones[0].id,
    logo,
    campo,
    tipo: campamento,
    actividad,
  };
});
afterAll(async () => {
  await e.cerrar();
});

const rutas = (): [string, string, unknown?][] => [
  ['GET', `/ramas/${ids.rama}/snapshot`],
  ['GET', `/ramas/${ids.rama}/config`],
  ['GET', `/ramas/${ids.rama}/archivadas`],
  ['POST', `/ramas/${ids.rama}/fichas`, fichaValida({ dni: '99999999' })],
  ['GET', `/fichas/${ids.ficha}`],
  ['PATCH', `/fichas/${ids.ficha}`, { version: 1, datos: { nombre: 'Hackeado' } }],
  ['GET', `/fichas/${ids.ficha}/historial`],
  ['POST', `/fichas/${ids.ficha}/archivar`],
  ['POST', `/fichas/${ids.ficha}/pase`, { ramaId: ids.rama }],
  ['DELETE', `/fichas/${ids.ficha}`, { confirmar: true }],
  ['PUT', `/fichas/${ids.ficha}/documentos/pdfAdjunto`, { estado: 'presentado', fechaEntrega: '2026-01-01' }],
  ['GET', `/fichas/${ids.ficha}/documentos/pdfAdjunto/enlace`],
  ['DELETE', `/fichas/${ids.ficha}/documentos/pdfAdjunto/archivo`],
  ['GET', `/logos/${ids.logo}`],
  ['POST', `/ramas/${ids.rama}/equipos`, { nombre: 'Nuevo' }],
  ['PATCH', `/equipos/${ids.equipo}`, { nombre: 'Otro' }],
  ['POST', `/equipos/${ids.equipo}/desactivar`],
  ['POST', `/ramas/${ids.rama}/catalogos`, { catalogo: 'etapa', nombre: 'Z' }],
  ['PATCH', `/catalogo-valores/${ids.valor}`, { nombre: 'Z' }],
  ['PUT', `/ramas/${ids.rama}/campos-ocultos`, { campos: ['mistica'] }],
  ['POST', `/ramas/${ids.rama}/campos-propios`, { nombre: 'Y', tipo: 'texto', seccion: 'organizacion', sensible: false }],
  ['PATCH', `/campos-propios/${ids.campo}`, { activo: false }],
  ['GET', `/grupos/${ids.grupo}/ramas`],
  ['POST', `/grupos/${ids.grupo}/ramas`, { nombre: 'Intrusa' }],
  ['GET', `/grupos/${ids.grupo}/estructura`],
  ['GET', `/grupos/${ids.grupo}/usuarios`],
  ['POST', `/grupos/${ids.grupo}/usuarios`, { nombre: 'x', email: 'x@x.test', rolId: ids.rol, alcance: 'grupo' }],
  ['POST', `/grupos/${ids.grupo}/usuarios/${ids.usuario}/desactivar`],
  ['POST', `/grupos/${ids.grupo}/usuarios/${ids.usuario}/asignaciones`, { rolId: ids.rol, alcance: 'grupo' }],
  ['DELETE', `/grupos/${ids.grupo}/asignaciones/${ids.asignacion}`],
  ['GET', `/grupos/${ids.grupo}/roles`],
  ['POST', `/grupos/${ids.grupo}/roles`, { nombre: 'R', permisos: {} }],
  ['PATCH', `/grupos/${ids.grupo}/roles/${ids.rol}`, { verSensibles: true }],
  ['DELETE', `/grupos/${ids.grupo}/roles/${ids.rol}`],
  ['GET', `/grupos/${ids.grupo}/tipos-actividad`],
  ['POST', `/grupos/${ids.grupo}/tipos-actividad`, { nombre: 'T', color: '#1F4D2B', requiereAutorizacion: false }],
  ['PATCH', `/tipos-actividad/${ids.tipo}`, { nombre: 'T' }],
  ['GET', `/ramas/${ids.rama}/actividades?anio=2026`],
  ['POST', '/actividades', { grupoId: ids.grupo, tipoId: ids.tipo, nombre: 'X', inicio: '2026-11-14T12:00:00Z', fin: '2026-11-16T19:00:00Z', alcance: 'grupo' }],
  ['GET', `/actividades/${ids.actividad}`],
  ['PATCH', `/actividades/${ids.actividad}`, { nombre: 'Hackeada' }],
  ['POST', `/actividades/${ids.actividad}/cancelar`],
  ['PUT', `/actividades/${ids.actividad}/inscripciones`, { quitar: [ids.ficha] }],
  ['GET', `/actividades/${ids.actividad}/inscripciones/${ids.ficha}/autorizacion/enlace`],
  ['DELETE', `/actividades/${ids.actividad}/inscripciones/${ids.ficha}/autorizacion/archivo`],
  ['GET', `/grupos/${ids.grupo}/feriados?anio=2026`],
  ['POST', `/grupos/${ids.grupo}/feriados`, { fecha: '2026-12-01', nombre: 'Intruso' }],
  ['DELETE', `/feriados/${ids.feriado}`],
  ['GET', `/recordatorios?grupoId=${ids.grupo}&desde=2026-01-01&hasta=2026-12-31`],
  ['POST', '/recordatorios', { grupoId: ids.grupo, fecha: '2026-11-03', titulo: 'Intruso' }],
  ['DELETE', `/recordatorios/${ids.recordatorio}`],
  ['POST', `/grupos/${ids.grupo}/avisos`, { titulo: 'X', texto: 'X', destino: { tipo: 'grupo' }, canales: ['push'] }],
  ['GET', `/grupos/${ids.grupo}/avisos`],
];

describe('RNF-011 aislamiento entre grupos', () => {
  it('ninguna ruta del grupo A responde con datos ni acepta cambios del admin del grupo B', async () => {
    const accesos: string[] = [];
    for (const [metodo, url, body] of rutas()) {
      const r = await intruso.pedir(metodo as 'GET', url, body);
      if (r.statusCode < 400) accesos.push(`${metodo} ${url} → ${r.statusCode}`);
      expect(r.body).not.toContain('50890337');
      expect(r.body).not.toContain('Pérez');
    }
    expect(accesos).toEqual([]);
    // Nada cambió en el grupo A.
    const f = (await esc.admin.get(`/fichas/${ids.ficha}`)).json();
    expect(f).toMatchObject({ nombre: 'Ana', estado: 'activa', version: 1 });
    expect((await esc.admin.get(`/grupos/${esc.grupoId}/usuarios`)).json().every((u: { activo: boolean }) => u.activo)).toBe(true);
  });

  it('los registros de asistencia sobre una actividad de otro grupo se rechazan', async () => {
    const r = await intruso.post('/sincronizar', {
      registros: [{ id: 'r1', actividadId: ids.actividad, fichaId: ids.ficha, campo: 'presente', valor: true, anterior: false, en: '2026-10-24T15:00:00Z' }],
    });
    expect(r.json().resultados).toEqual([expect.objectContaining({ estado: 'rechazado' })]);
    const a = (await esc.admin.get(`/actividades/${ids.actividad}`)).json();
    expect(a).toMatchObject({ nombre: 'Campamento', canceladaEn: null });
    expect(a.inscripciones).toEqual([expect.objectContaining({ fichaId: ids.ficha, presente: false })]);
  });

  it('la importación a una rama de otro grupo se rechaza', async () => {
    const r = await intruso.subir(`/ramas/${ids.rama}/importar`, 'p.csv', Buffer.from('Apellido;Nombre\nA;B\n'));
    expect(r.statusCode).toBe(403);
  });

  it('sin sesión ninguna ruta responde', async () => {
    const anon = new Cliente(e.app);
    for (const [metodo, url, body] of rutas()) {
      const r = await anon.pedir(metodo as 'GET', url, body);
      expect([401, 400]).toContain(r.statusCode);
    }
  });
});
