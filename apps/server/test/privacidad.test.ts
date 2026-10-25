import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearEntorno, escenarioBase, fichaValida, login, usuarioCon, type Entorno, type Escenario } from './ayudas';
import { ejecutarTareas } from '../src/servicios/tareas';
import { notificarError } from '../src/servicios/monitoreo';

let e: Entorno;
let esc: Escenario;
beforeEach(async () => {
  e = await crearEntorno();
  esc = await escenarioBase(e);
});
afterEach(async () => {
  await e.cerrar();
});

const PDF = Buffer.from('%PDF-1.4\n%%EOF');

describe('RF-117 / RN-12 anonimización', () => {
  it('a los 2 años de la baja borra los datos personales y archivos y conserva los de RN-12', async () => {
    e.reloj.ahora = new Date('2026-03-01T13:00:00Z');
    const admin = await login(e.app, 'mauro@scout.test');
    const f = (
      await admin.post(`/ramas/${esc.caminantes}/fichas`, {
        ...fichaValida({
          fechaNacimiento: '2009-06-01',
          tieneTada: false,
          equipoId: esc.equipos['Baden Powell'],
          etapaId: esc.catalogo['Ini'],
          elementoId: esc.catalogo['Fuego'],
          religionId: esc.catalogo['Católica'],
          mistica: 'Luz',
        }),
        cuotas: { mayo: 'pagada' },
      })
    ).json();
    await admin.subir(`/fichas/${f.id}/documentos/ddjjSalud/archivo`, 'ddjj.pdf', PDF, 'application/pdf');
    await admin.post(`/fichas/${f.id}/archivar`);
    expect(e.almacenamiento.archivos.size).toBe(1);

    e.reloj.ahora = new Date('2028-02-29T13:00:00Z');
    expect((await ejecutarTareas(e.deps)).anonimizadas).toBe(0);
    e.reloj.ahora = new Date('2028-03-01T13:00:00Z');
    expect((await ejecutarTareas(e.deps)).anonimizadas).toBe(1);

    const fila = await e.db.selectFrom('fichas').selectAll().where('id', '=', f.id).executeTakeFirstOrThrow();
    expect(fila).toMatchObject({
      estado: 'anonimizada',
      apellido: null,
      nombre: null,
      dni: null,
      fecha_nacimiento: null,
      tel_emergencia_1: null,
      religion_id: null,
      mistica: null,
      anio_nacimiento: 2009,
      estado_tada_final: 'puedeHacer',
      rama_id: esc.caminantes,
      equipo_id: esc.equipos['Baden Powell'],
      etapa_id: esc.catalogo['Ini'],
      elemento_id: esc.catalogo['Fuego'],
    });
    expect(fila.cuotas).toEqual({});
    expect(e.almacenamiento.archivos.size).toBe(0);
    expect(await e.db.selectFrom('documentos').select('id').where('ficha_id', '=', f.id).execute()).toHaveLength(0);
    const hist = await e.db.selectFrom('historial').select(['campo', 'valor_anterior', 'valor_nuevo']).where('ficha_id', '=', f.id).execute();
    const textoHistorial = JSON.stringify(hist);
    for (const dato of ['Pérez', 'Ana', '50890337', '1159254075', 'Luz', 'Católica']) expect(textoHistorial).not.toContain(dato);
    // No vuelve a aparecer entre los ex integrantes.
    const admin2 = await login(e.app, 'mauro@scout.test');
    expect((await admin2.get(`/ramas/${esc.caminantes}/archivadas`)).json()).toHaveLength(0);
    // RNF-045: queda registrada sin datos personales.
    const aud = await e.db.selectFrom('auditoria').selectAll().where('accion', '=', 'anonimizacion').execute();
    expect(aud).toHaveLength(1);
    expect(aud[0]!.ficha_id).toBe(f.id);
  });
});

describe('RF-118 supresión', () => {
  it('el admin la ejecuta con confirmación; la ficha y sus archivos dejan de existir y queda el registro', async () => {
    const f = (await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida())).json();
    await esc.admin.subir(`/fichas/${f.id}/documentos/consentimiento/archivo`, 'c.pdf', PDF, 'application/pdf');
    expect((await esc.admin.delete(`/fichas/${f.id}`, {})).statusCode).toBe(400);
    const r = await esc.admin.delete(`/fichas/${f.id}`, { confirmar: true });
    expect(r.statusCode).toBe(200);
    expect(await e.db.selectFrom('fichas').select('id').where('id', '=', f.id).execute()).toHaveLength(0);
    expect(await e.db.selectFrom('historial').select('id').where('ficha_id', '=', f.id).execute()).toHaveLength(0);
    expect(await e.db.selectFrom('archivos').select('id').execute()).toHaveLength(0);
    expect(e.almacenamiento.archivos.size).toBe(0);
    const aud = await e.db.selectFrom('auditoria').selectAll().where('accion', '=', 'supresion').executeTakeFirstOrThrow();
    const yo = (await esc.admin.get('/yo')).json();
    expect(aud).toMatchObject({ ficha_id: f.id, usuario_id: yo.usuario.id, grupo_id: esc.grupoId });
    expect(JSON.stringify(aud)).not.toMatch(/Pérez|50890337/);
  });

  it('quien no es admin de grupo no puede suprimir', async () => {
    const f = (await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida())).json();
    const jefe = await usuarioCon(e, esc, 'jefe@ejemplo.com', 'Jefe de rama', { alcance: 'rama', ramaId: esc.caminantes });
    expect((await jefe.delete(`/fichas/${f.id}`, { confirmar: true })).statusCode).toBe(403);
  });
});

describe('RNF-044 / RNF-046 auditoría de aperturas', () => {
  it('registra cada apertura de DDJJ con usuario e id interno, sin datos personales', async () => {
    const f = (await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida())).json();
    await esc.admin.subir(`/fichas/${f.id}/documentos/ddjjSalud/archivo`, 'Pérez Ana DDJJ.pdf', PDF, 'application/pdf');
    await esc.admin.subir(`/fichas/${f.id}/documentos/pdfAdjunto/archivo`, 'otro.pdf', PDF, 'application/pdf');
    await esc.admin.get(`/fichas/${f.id}/documentos/ddjjSalud/enlace`);
    await esc.admin.get(`/fichas/${f.id}/documentos/ddjjSalud/enlace`);
    await esc.admin.get(`/fichas/${f.id}/documentos/pdfAdjunto/enlace`);
    const aud = await e.db.selectFrom('auditoria').selectAll().where('accion', '=', 'apertura_documento').execute();
    expect(aud).toHaveLength(2);
    expect(aud[0]!.detalle).toEqual({ tipo: 'ddjjSalud' });
    expect(JSON.stringify(aud)).not.toMatch(/Pérez|Ana|50890337/);
  });
});

describe('RNF-034 aviso de errores', () => {
  it('avisa por mail solo la primera vez que aparece cada error', async () => {
    const error = new Error('Falla de prueba');
    await notificarError(e.deps, error, 'GET /x');
    await notificarError(e.deps, error, 'GET /x');
    const avisos = e.mails.enviados.filter((m) => m.tipo === 'error');
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.para).toBe('agustin@scout.test');
  });
});

describe('RN-14 tope de mails', () => {
  it('con el tope diario alcanzado no envía y lo registra', async () => {
    await e.db
      .insertInto('mails')
      .values(Array.from({ length: 100 }, () => ({ tipo: 'aviso', enviado: true, detalle: null, creado_en: e.reloj.ahora })))
      .execute();
    const antes = e.mails.enviados.length;
    await e.app.inject({ method: 'POST', url: '/auth/recuperar', payload: { email: 'mauro@scout.test' } });
    expect(e.mails.enviados.length).toBe(antes);
    const registro = await e.db.selectFrom('mails').selectAll().where('enviado', '=', false).execute();
    expect(registro[0]).toMatchObject({ tipo: 'recuperacion', detalle: 'tope diario alcanzado' });
  });
});
