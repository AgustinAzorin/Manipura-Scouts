import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearEntorno, escenarioBase, fichaValida, usuarioCon, type Entorno, type Escenario } from './ayudas';

let e: Entorno;
let esc: Escenario;
beforeEach(async () => {
  e = await crearEntorno();
  esc = await escenarioBase(e);
});
afterEach(async () => {
  await e.cerrar();
});

const crear = async (extra: Record<string, unknown> = {}, rama = esc.caminantes) => {
  const r = await esc.admin.post(`/ramas/${rama}/fichas`, fichaValida(extra));
  if (r.statusCode !== 201) throw new Error(r.body);
  return r.json();
};

const PDF = Buffer.from('%PDF-1.4\n%prueba\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4170000000049454e44ae426082', 'hex');

describe('RF-022 crear ficha', () => {
  it('con los obligatorios queda activa en la rama; DNI y teléfono se normalizan', async () => {
    const f = await crear();
    expect(f).toMatchObject({ estado: 'activa', ramaId: esc.caminantes, dni: '50890337', telEmergencia1: '1159254075' });
  });

  it('sin fecha de nacimiento indica el faltante y no la guarda', async () => {
    const r = await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ fechaNacimiento: null }));
    expect(r.statusCode).toBe(400);
    expect(r.json().mensaje).toContain('Fecha de nacimiento');
    expect(await e.db.selectFrom('fichas').select('id').execute()).toHaveLength(0);
  });

  it('acepta el teléfono de emergencia 2 en lugar del 1', async () => {
    const f = await crear({ telEmergencia1: null, telEmergencia2: '1144445555' });
    expect(f.estado).toBe('activa');
  });
});

describe('RF-023 DNI duplicado', () => {
  it('rechaza el mismo DNI en el grupo, aun con otro formato, e indica qué ficha lo tiene', async () => {
    await crear();
    const r = await esc.admin.post(`/ramas/${esc.unidad}/fichas`, fichaValida({ dni: '50890337', apellido: 'Gómez' }));
    expect(r.statusCode).toBe(409);
    expect(r.json().mensaje).toContain('Pérez, Ana');
    expect(r.json().mensaje).toContain('Caminantes');
  });

  it('también contra fichas archivadas y en la edición', async () => {
    const f = await crear();
    await esc.admin.post(`/fichas/${f.id}/archivar`);
    expect((await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida())).statusCode).toBe(409);
    const otra = await crear({ dni: '40000000' });
    expect((await esc.admin.patch(`/fichas/${otra.id}`, { version: otra.version, datos: { dni: '50.890.337' } })).statusCode).toBe(409);
  });

  it('el mismo DNI en otro grupo se acepta', async () => {
    await crear();
    const g2 = (await esc.plataforma.post('/plataforma/grupos', { nombre: 'Otro grupo' })).json().id;
    await esc.plataforma.post(`/plataforma/grupos/${g2}/admins`, { nombre: 'Mauro', email: 'mauro@scout.test' });
    const rama = (await esc.admin.post(`/grupos/${g2}/ramas`, { nombre: 'Caminantes' })).json().id;
    expect((await esc.admin.post(`/ramas/${rama}/fichas`, fichaValida())).statusCode).toBe(201);
  });
});

describe('RF-025 edición simultánea', () => {
  it('el segundo en guardar ve el aviso con el teléfono modificado y elige guardar su versión', async () => {
    const f = await crear();
    const otro = await usuarioCon(e, esc, 'otro@ejemplo.com', 'Jefe de rama', { alcance: 'rama', ramaId: esc.caminantes });
    const abierta = f.version;
    const primero = await otro.patch(`/fichas/${f.id}`, { version: abierta, datos: { telEmergencia1: '1199998888' } });
    expect(primero.statusCode).toBe(200);
    const segundo = await esc.admin.patch(`/fichas/${f.id}`, { version: abierta, datos: { equipoId: esc.equipos['Frida Kahlo'] } });
    expect(segundo.statusCode).toBe(409);
    expect(segundo.json().codigo).toBe('CONFLICTO_EDICION');
    expect(segundo.json().cambios).toEqual([
      expect.objectContaining({ campo: 'telEmergencia1', valorAnterior: '1159254075', valorNuevo: '1199998888', usuarioNombre: 'otro' }),
    ]);
    const forzado = await esc.admin.patch(`/fichas/${f.id}`, { version: abierta, forzar: true, datos: { equipoId: esc.equipos['Frida Kahlo'] } });
    expect(forzado.statusCode).toBe(200);
    expect(forzado.json()).toMatchObject({ telEmergencia1: '1199998888', equipoId: esc.equipos['Frida Kahlo'] });
  });
});

describe('RF-026 historial', () => {
  it('registra quién, cuándo y los dos valores, con nombres legibles', async () => {
    const f = await crear({ etapaId: esc.catalogo['Ini'] });
    await esc.admin.patch(`/fichas/${f.id}`, { version: f.version, datos: { etapaId: esc.catalogo['Descubrimiento'] } });
    const h = (await esc.admin.get(`/fichas/${f.id}/historial`)).json();
    expect(h[0]).toMatchObject({ campo: 'etapaId', etiqueta: 'Etapa', valorAnterior: 'Ini', valorNuevo: 'Descubrimiento', usuarioNombre: 'Mauro' });
    expect(h.at(-1).campo).toBe('_alta');
  });

  it('oculta los valores sensibles a quien no tiene el permiso', async () => {
    const f = await crear();
    await esc.admin.patch(`/fichas/${f.id}`, { version: f.version, datos: { telEmergencia1: '1100001111', mistica: 'Fuego' } });
    const lector = await usuarioCon(e, esc, 'l@ejemplo.com', 'Solo lectura', { alcance: 'rama', ramaId: esc.caminantes });
    const h = (await lector.get(`/fichas/${f.id}/historial`)).json();
    const tel = h.find((x: { campo: string }) => x.campo === 'telEmergencia1');
    expect(tel).toMatchObject({ oculto: true, valorAnterior: null, valorNuevo: null });
    expect(h.find((x: { campo: string }) => x.campo === 'mistica')).toMatchObject({ oculto: false, valorNuevo: 'Fuego' });
  });

  it('los cambios de un usuario desactivado siguen con su nombre', async () => {
    const f = await crear();
    const u = await usuarioCon(e, esc, 'edu@ejemplo.com', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    await u.patch(`/fichas/${f.id}`, { version: f.version, datos: { mistica: 'Agua' } });
    const id = (await u.get('/yo')).json().usuario.id;
    await esc.admin.post(`/grupos/${esc.grupoId}/usuarios/${id}/desactivar`);
    const h = (await esc.admin.get(`/fichas/${f.id}/historial`)).json();
    expect(h[0].usuarioNombre).toBe('edu');
  });

  it('un usuario sin permiso de sensibles no puede editar campos sensibles', async () => {
    const f = await crear();
    await esc.admin.patch(`/grupos/${esc.grupoId}/roles/${esc.roles['Educador']}`, { verSensibles: false });
    const u = await usuarioCon(e, esc, 'edu@ejemplo.com', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    expect((await u.patch(`/fichas/${f.id}`, { version: f.version, datos: { dni: '11111111' } })).statusCode).toBe(403);
    expect((await u.patch(`/fichas/${f.id}`, { version: f.version, datos: { mistica: 'x' } })).statusCode).toBe(200);
  });
});

describe('RF-027 archivar / RF-028 pase de rama', () => {
  it('archivada deja la nómina, figura en ex integrantes y se reactiva con sus datos', async () => {
    const f = await crear({ equipoId: esc.equipos['Baden Powell'], cordi: 'coordinador' });
    await esc.admin.post(`/fichas/${f.id}/archivar`);
    expect((await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json().fichas).toHaveLength(0);
    const ex = (await esc.admin.get(`/ramas/${esc.caminantes}/archivadas`)).json();
    expect(ex.map((x: { id: string }) => x.id)).toEqual([f.id]);
    expect((await esc.admin.patch(`/fichas/${f.id}`, { version: 2, datos: { mistica: 'x' } })).statusCode).toBe(400);
    const re = (await esc.admin.post(`/fichas/${f.id}/reactivar`)).json();
    expect(re).toMatchObject({ estado: 'activa', dni: '50890337', equipoId: esc.equipos['Baden Powell'], cordi: null });
  });

  it('el pase conserva el historial, lo registra y busca los catálogos por nombre', async () => {
    const f = await crear({ etapaId: esc.catalogo['Ini'], equipoId: esc.equipos['Tupac Amaru'] });
    const ini = (await esc.admin.post(`/ramas/${esc.unidad}/catalogos`, { catalogo: 'etapa', nombre: 'Ini' })).json().id;
    const r = await esc.admin.post(`/fichas/${f.id}/pase`, { ramaId: esc.unidad });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ramaId: esc.unidad, etapaId: ini, equipoId: null });
    expect((await esc.admin.get(`/ramas/${esc.unidad}/snapshot`)).json().fichas).toHaveLength(1);
    const h = (await esc.admin.get(`/fichas/${f.id}/historial`)).json();
    expect(h[0]).toMatchObject({ campo: '_pase', valorAnterior: 'Caminantes', valorNuevo: 'Unidad' });
    expect(h.at(-1).campo).toBe('_alta');
  });
});

describe('RF-036 / RF-037 TADA', () => {
  it('no se puede marcar "Tiene TADA" antes de los 16; desde los 16 sí', async () => {
    // El reloj de prueba está en 24/10/2026.
    const chico = await crear({ fechaNacimiento: '2010-12-01' });
    const r = await esc.admin.patch(`/fichas/${chico.id}`, { version: chico.version, datos: { tieneTada: true } });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.tieneTada).toBeDefined();
    const grande = await crear({ dni: '44555666', fechaNacimiento: '2009-05-30' });
    expect((await esc.admin.patch(`/fichas/${grande.id}`, { version: grande.version, datos: { tieneTada: true } })).json().tieneTada).toBe(true);
  });
});

describe('RF-038 cordi / RN-11', () => {
  it('pide confirmar el reemplazo del coordinador y libera al anterior', async () => {
    const bp = esc.equipos['Baden Powell']!;
    const a = await crear({ equipoId: bp, cordi: 'coordinador' });
    const b = await crear({ dni: '41000000', equipoId: bp });
    const sin = await esc.admin.patch(`/fichas/${b.id}`, { version: b.version, datos: { cordi: 'coordinador' } });
    expect(sin.statusCode).toBe(409);
    expect(sin.json().codigo).toBe('CONFIRMAR_REEMPLAZO');
    expect(sin.json().mensaje).toContain('Pérez, Ana');
    const con = await esc.admin.patch(`/fichas/${b.id}`, { version: b.version, datos: { cordi: 'coordinador' }, reemplazarCordi: true });
    expect(con.json().cordi).toBe('coordinador');
    expect((await esc.admin.get(`/fichas/${a.id}`)).json().cordi).toBeNull();
    // El subcoordinador es independiente.
    const c = await crear({ dni: '41000001', equipoId: bp, cordi: 'subcoordinador' });
    expect(c.cordi).toBe('subcoordinador');
  });

  it('sin equipo no puede ser cordi', async () => {
    const r = await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ cordi: 'coordinador' }));
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.cordi).toBeDefined();
  });
});

describe('RF-039 guardián / RF-044 a RF-046 catálogos', () => {
  it('solo acepta valores del catálogo de la rama', async () => {
    const f = await crear({ guardianId: esc.catalogo['guardian:Leyenda'] });
    expect(f.guardianId).toBe(esc.catalogo['guardian:Leyenda']);
    // Un valor de otro catálogo (Elemento "Fuego") no sirve como guardián.
    const r = await esc.admin.patch(`/fichas/${f.id}`, { version: f.version, datos: { guardianId: esc.catalogo['Fuego'] } });
    expect(r.statusCode).toBe(400);
  });

  it('un valor agregado en Caminantes no existe en Unidad', async () => {
    const desafio = (await esc.admin.post(`/ramas/${esc.caminantes}/catalogos`, { catalogo: 'etapa', nombre: 'Desafío' })).json().id;
    const cam = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json();
    expect(cam.rama.catalogos.some((v: { id: string }) => v.id === desafio)).toBe(true);
    const uni = (await esc.admin.get(`/ramas/${esc.unidad}/snapshot`)).json();
    expect(uni.rama.catalogos.some((v: { nombre: string }) => v.nombre === 'Desafío')).toBe(false);
    const r = await esc.admin.post(`/ramas/${esc.unidad}/fichas`, fichaValida({ etapaId: desafio }));
    expect(r.statusCode).toBe(400);
  });

  it('renombrar se ve en todas las fichas; desactivar conserva el valor pero no se puede elegir', async () => {
    const f = await crear({ raidId: esc.catalogo['3°R'] });
    await esc.admin.patch(`/catalogo-valores/${esc.catalogo['3°R']}`, { nombre: '3er Raid' });
    let snap = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json();
    expect(snap.rama.catalogos.find((v: { id: string }) => v.id === snap.fichas[0].raidId).nombre).toBe('3er Raid');
    await esc.admin.patch(`/catalogo-valores/${esc.catalogo['3°R']}`, { activo: false });
    snap = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json();
    expect(snap.fichas[0].raidId).toBe(esc.catalogo['3°R']);
    const otra = await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ dni: '43000000', raidId: esc.catalogo['3°R'] }));
    expect(otra.statusCode).toBe(400);
    // La ficha que ya lo tenía se puede seguir editando.
    expect((await esc.admin.patch(`/fichas/${f.id}`, { version: f.version, datos: { mistica: 'x' } })).statusCode).toBe(200);
  });
});

describe('RF-047 logos', () => {
  it('asigna un logo PNG al valor "Fuego" y rechaza otros catálogos o archivos que no son imagen', async () => {
    const r = await esc.admin.subir(`/catalogo-valores/${esc.catalogo['Fuego']}/logo`, 'fuego.png', PNG, 'image/png');
    expect(r.statusCode).toBe(200);
    const snap = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json();
    const fuego = snap.rama.catalogos.find((v: { id: string }) => v.id === esc.catalogo['Fuego']);
    expect(fuego.logo).toBe(r.json().logo);
    const img = await esc.admin.get(`/logos/${fuego.logo}`);
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect((await esc.admin.subir(`/catalogo-valores/${esc.catalogo['Ini']}/logo`, 'x.png', PNG)).statusCode).toBe(400);
    expect((await esc.admin.subir(`/catalogo-valores/${esc.catalogo['Agua']}/logo`, 'x.png', PDF)).statusCode).toBe(400);
  });
});

describe('RF-048 ocultar campos', () => {
  it('guarda los campos ocultos de la rama y rechaza ocultar obligatorios', async () => {
    expect((await esc.admin.put(`/ramas/${esc.unidad}/campos-ocultos`, { campos: ['tieneTada'] })).statusCode).toBe(200);
    expect((await esc.admin.get(`/ramas/${esc.unidad}/snapshot`)).json().rama.camposOcultos).toEqual(['tieneTada']);
    expect((await esc.admin.put(`/ramas/${esc.unidad}/campos-ocultos`, { campos: ['dni'] })).statusCode).toBe(400);
  });
});

describe('RF-119 / RF-120 campos propios', () => {
  it('"Seisena" en Manada aparece solo en esa rama, valida sus valores y no repite nombres', async () => {
    const manada = (await esc.admin.post(`/grupos/${esc.grupoId}/ramas`, { nombre: 'Manada' })).json().id;
    const c = await esc.admin.post(`/ramas/${manada}/campos-propios`, { nombre: 'Seisena', tipo: 'lista', seccion: 'organizacion', sensible: false, opciones: ['Blanca', 'Negra'] });
    expect(c.statusCode).toBe(201);
    expect((await esc.admin.post(`/ramas/${manada}/campos-propios`, { nombre: 'seisena', tipo: 'texto', seccion: 'organizacion', sensible: false })).statusCode).toBe(409);
    expect((await esc.admin.post(`/ramas/${manada}/campos-propios`, { nombre: 'Etapa', tipo: 'texto', seccion: 'organizacion', sensible: false })).statusCode).toBe(409);
    expect((await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json().rama.camposPropios).toEqual([]);
    const id = c.json().id;
    const mal = await esc.admin.post(`/ramas/${manada}/fichas`, { ...fichaValida(), camposPropios: { [id]: 'Roja' } });
    expect(mal.statusCode).toBe(400);
    const f = await esc.admin.post(`/ramas/${manada}/fichas`, { ...fichaValida(), camposPropios: { [id]: 'Blanca' } });
    expect(f.json().camposPropios).toEqual({ [id]: 'Blanca' });
  });

  it('un campo sensible no lo ve quien no tiene el permiso', async () => {
    const c = (await esc.admin.post(`/ramas/${esc.caminantes}/campos-propios`, { nombre: 'Obra social', tipo: 'texto', seccion: 'datosPersonales', sensible: true })).json().id;
    await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, { ...fichaValida(), camposPropios: { [c]: 'OSDE' } });
    const lector = await usuarioCon(e, esc, 'l@ejemplo.com', 'Solo lectura', { alcance: 'rama', ramaId: esc.caminantes });
    expect((await lector.get(`/ramas/${esc.caminantes}/snapshot`)).json().fichas[0].camposPropios).toEqual({});
    expect((await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json().fichas[0].camposPropios).toEqual({ [c]: 'OSDE' });
  });

  it('desactivar oculta el campo y conserva los valores; reactivarlo los vuelve a mostrar', async () => {
    const c = (await esc.admin.post(`/ramas/${esc.caminantes}/campos-propios`, { nombre: 'Apodo', tipo: 'texto', seccion: 'datosPersonales', sensible: false })).json().id;
    for (let i = 0; i < 20; i++) {
      await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, { ...fichaValida({ dni: String(30000000 + i) }), camposPropios: { [c]: `apodo ${i}` } });
    }
    await esc.admin.patch(`/campos-propios/${c}`, { activo: false });
    let snap = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json();
    expect(snap.fichas.filter((f: { camposPropios: object }) => Object.keys(f.camposPropios).length > 0)).toHaveLength(0);
    await esc.admin.patch(`/campos-propios/${c}`, { activo: true });
    snap = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json();
    expect(snap.fichas.filter((f: { camposPropios: Record<string, string> }) => f.camposPropios[c])).toHaveLength(20);
  });
});

describe('RF-040 a RF-042 documentos', () => {
  it('registra "Presentado: no autoriza" con fecha y pide la fecha si falta', async () => {
    const f = await crear();
    const sinFecha = await esc.admin.put(`/fichas/${f.id}/documentos/usoImagen`, { estado: 'presentadoNoAutoriza' });
    expect(sinFecha.statusCode).toBe(400);
    expect(sinFecha.json().mensaje).toBe('Indicá la fecha de entrega');
    await esc.admin.put(`/fichas/${f.id}/documentos/usoImagen`, { estado: 'presentadoNoAutoriza', fechaEntrega: '2026-03-10' });
    const docs = (await esc.admin.get(`/fichas/${f.id}`)).json().documentos;
    expect(docs.find((d: { tipo: string }) => d.tipo === 'usoImagen')).toEqual({ tipo: 'usoImagen', estado: 'presentadoNoAutoriza', fechaEntrega: '2026-03-10', archivo: null });
  });

  it('adjunta un PDF de 3 MB, rechaza 12 MB y la DDJJ nueva borra la anterior del almacenamiento', async () => {
    const f = await crear();
    const grande = Buffer.concat([PDF, Buffer.alloc(12 * 1024 * 1024)]);
    const r12 = await esc.admin.subir(`/fichas/${f.id}/documentos/ddjjSalud/archivo`, 'ddjj.pdf', grande, 'application/pdf');
    expect(r12.statusCode).toBe(413);
    expect(r12.json().mensaje).toContain('10 MB');
    const tres = Buffer.concat([PDF, Buffer.alloc(3 * 1024 * 1024)]);
    const r1 = await esc.admin.subir(`/fichas/${f.id}/documentos/ddjjSalud/archivo`, 'ddjj-2025.pdf', tres, 'application/pdf');
    expect(r1.statusCode).toBe(201);
    expect(e.almacenamiento.archivos.size).toBe(1);
    const [claveVieja] = [...e.almacenamiento.archivos.keys()];
    await esc.admin.subir(`/fichas/${f.id}/documentos/ddjjSalud/archivo`, 'ddjj-2026.pdf', PDF, 'application/pdf');
    expect(e.almacenamiento.archivos.size).toBe(1);
    expect(e.almacenamiento.archivos.has(claveVieja!)).toBe(false);
    const doc = (await esc.admin.get(`/fichas/${f.id}`)).json().documentos.find((d: { tipo: string }) => d.tipo === 'ddjjSalud');
    expect(doc.archivo.nombre).toBe('ddjj-2026.pdf');
    expect(doc.estado).toBe('noPresentado');
  });

  it('el estado se registra sin archivo; un .exe disfrazado de PDF se rechaza', async () => {
    const f = await crear();
    expect((await esc.admin.put(`/fichas/${f.id}/documentos/pdfAdjunto`, { estado: 'presentado', fechaEntrega: '2026-03-01' })).statusCode).toBe(200);
    expect((await esc.admin.subir(`/fichas/${f.id}/documentos/pdfAdjunto/archivo`, 'virus.pdf', Buffer.from('MZ\x90\x00'))).statusCode).toBe(400);
  });

  it('el enlace temporal vence a los 10 minutos y la DDJJ requiere el permiso de sensibles', async () => {
    const f = await crear();
    await esc.admin.subir(`/fichas/${f.id}/documentos/ddjjSalud/archivo`, 'ddjj.pdf', PDF, 'application/pdf');
    const enlace = (await esc.admin.get(`/fichas/${f.id}/documentos/ddjjSalud/enlace`)).json();
    const ruta = enlace.url.replace('https://scout.test', '');
    const ok = await e.app.inject({ method: 'GET', url: ruta });
    expect(ok.statusCode).toBe(200);
    expect(ok.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await e.app.inject({ method: 'GET', url: ruta.replace(/firma=[^&]+/, 'firma=falsa') })).statusCode).toBe(403);
    e.reloj.ahora = new Date(e.reloj.ahora.getTime() + 10 * 60_000 + 1000);
    expect((await e.app.inject({ method: 'GET', url: ruta })).statusCode).toBe(410);
    await esc.admin.patch(`/grupos/${esc.grupoId}/roles/${esc.roles['Solo lectura']}`, { permisos: { padron: ['ver'], documentos: ['ver'] } });
    const lector = await usuarioCon(e, esc, 'l@ejemplo.com', 'Solo lectura', { alcance: 'rama', ramaId: esc.caminantes });
    expect((await lector.get(`/fichas/${f.id}/documentos/ddjjSalud/enlace`)).statusCode).toBe(403);
    expect((await lector.get(`/fichas/${f.id}/documentos/consentimiento/enlace`)).statusCode).toBe(403);
  });
});

describe('RF-043 cuotas', () => {
  it('registra pagada y exenta sin montos; requiere permiso de Cuotas', async () => {
    const f = await crear();
    const r = await esc.admin.patch(`/fichas/${f.id}`, { version: f.version, cuotas: { mayo: 'pagada', afiliacion: 'exenta' } });
    expect(r.json().cuotas).toEqual({ mayo: 'pagada', afiliacion: 'exenta' });
    expect((await esc.admin.patch(`/fichas/${f.id}`, { version: r.json().version, cuotas: { mayo: 50 } })).statusCode).toBe(400);
    const lector = await usuarioCon(e, esc, 'l@ejemplo.com', 'Solo lectura', { alcance: 'rama', ramaId: esc.caminantes });
    const visto = (await lector.get(`/fichas/${f.id}`)).json();
    expect(visto.cuotas).toBeUndefined();
    expect((await lector.patch(`/fichas/${f.id}`, { version: r.json().version, cuotas: { junio: 'pagada' } })).statusCode).toBe(403);
    const h = (await esc.admin.get(`/fichas/${f.id}/historial`)).json();
    expect(h.find((x: { campo: string }) => x.campo === 'cuota.mayo')).toMatchObject({ etiqueta: 'Cuota Mayo', valorNuevo: 'Pagada' });
  });
});
