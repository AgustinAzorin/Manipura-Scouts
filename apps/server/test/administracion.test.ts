import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearAdminPlataforma, crearEntorno, escenarioBase, fichaValida, login, PASSWORD, usuarioCon, type Entorno } from './ayudas';
import { ejecutarTareas } from '../src/servicios/tareas';

let e: Entorno;
beforeEach(async () => {
  e = await crearEntorno();
});
afterEach(async () => {
  await e.cerrar();
});

describe('RF-001 / RF-002 / RF-003 grupos', () => {
  it('el admin de plataforma crea un grupo activo sin usuarios ni fichas', async () => {
    const p = await crearAdminPlataforma(e);
    const r = await p.post('/plataforma/grupos', { nombre: 'Grupo Scout General Paz' });
    expect(r.statusCode).toBe(201);
    const grupos = (await p.get('/plataforma/grupos')).json();
    expect(grupos).toEqual([{ id: r.json().id, nombre: 'Grupo Scout General Paz', activo: true, cantidadAdmins: 0 }]);
    expect(await e.db.selectFrom('fichas').select('id').execute()).toHaveLength(0);
    expect(await e.db.selectFrom('miembros').select('usuario_id').execute()).toHaveLength(0);
  });

  it('un usuario que no es admin de plataforma no puede crear grupos', async () => {
    const esc = await escenarioBase(e);
    expect((await esc.admin.post('/plataforma/grupos', { nombre: 'Otro' })).statusCode).toBe(403);
    expect((await esc.admin.get('/plataforma/grupos')).statusCode).toBe(403);
  });

  it('desactivar el grupo corta el acceso a las fichas y reactivarlo lo devuelve sin pérdidas', async () => {
    const esc = await escenarioBase(e);
    const creada = await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida());
    expect(creada.statusCode).toBe(201);
    await esc.plataforma.post(`/plataforma/grupos/${esc.grupoId}/desactivar`);
    const snap = await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`);
    expect(snap.statusCode).toBe(403);
    expect(snap.json().codigo).toBe('GRUPO_DESACTIVADO');
    expect((await esc.admin.get(`/fichas/${creada.json().id}`)).statusCode).toBe(403);
    expect((await esc.admin.patch(`/fichas/${creada.json().id}`, { version: 1, datos: { nombre: 'X' } })).statusCode).toBe(403);
    expect((await esc.admin.get('/yo')).json().contextos).toEqual([]);
    await esc.plataforma.post(`/plataforma/grupos/${esc.grupoId}/reactivar`);
    const otra = await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`);
    expect(otra.json().fichas).toHaveLength(1);
    expect(otra.json().fichas[0].dni).toBe('50890337');
  });

  it('el admin designado administra solo su grupo', async () => {
    const esc = await escenarioBase(e);
    const otroGrupo = (await esc.plataforma.post('/plataforma/grupos', { nombre: 'Otro grupo' })).json().id;
    expect((await esc.admin.get(`/grupos/${esc.grupoId}/usuarios`)).statusCode).toBe(200);
    expect((await esc.admin.get(`/grupos/${otroGrupo}/usuarios`)).statusCode).toBe(403);
    expect((await esc.admin.post(`/grupos/${otroGrupo}/ramas`, { nombre: 'Manada' })).statusCode).toBe(403);
  });
});

describe('RF-004 / RN-18 admin de plataforma sin rol en el grupo', () => {
  it('no ve la nómina; con un rol de educador sí, según ese rol', async () => {
    const esc = await escenarioBase(e);
    await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida());
    expect((await esc.plataforma.get(`/ramas/${esc.caminantes}/snapshot`)).statusCode).toBe(403);
    const yo = (await esc.plataforma.get('/yo')).json();
    // Se le da rol de Educador en Caminantes.
    const r = await esc.admin.post(`/grupos/${esc.grupoId}/usuarios`, {
      nombre: 'Agustin',
      email: 'agustin@scout.test',
      rolId: esc.roles['Solo lectura'],
      alcance: 'rama',
      ramaId: esc.caminantes,
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().usuarioId).toBe(yo.usuario.id);
    const snap = await esc.plataforma.get(`/ramas/${esc.caminantes}/snapshot`);
    expect(snap.statusCode).toBe(200);
    expect(snap.json().fichas).toHaveLength(1);
    // "Solo lectura" no tiene datos sensibles.
    expect(snap.json().fichas[0].dni).toBeUndefined();
    expect((await esc.plataforma.get(`/ramas/${esc.unidad}/snapshot`)).statusCode).toBe(403);
  });
});

describe('RF-005 ramas y RF-021 contexto', () => {
  it('la rama nueva aparece en el selector de contexto de quienes tienen alcance sobre ella', async () => {
    const esc = await escenarioBase(e);
    const yo = (await esc.admin.get('/yo')).json();
    expect(yo.contextos.map((c: { ramaNombre: string; comunidad: string | null }) => [c.ramaNombre, c.comunidad])).toEqual([
      ['Caminantes', 'Posta Antártida Argentina'],
      ['Unidad', null],
    ]);
    const edu = await usuarioCon(e, esc, 'edu@ejemplo.com', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    expect((await edu.get('/yo')).json().contextos).toHaveLength(1);
    const manada = (await esc.admin.post(`/grupos/${esc.grupoId}/ramas`, { nombre: 'Manada' })).json().id;
    expect((await esc.admin.get('/yo')).json().contextos.map((c: { ramaId: string }) => c.ramaId)).toContain(manada);
    expect((await edu.get('/yo')).json().contextos).toHaveLength(1);
  });

  it('nombres de rama repetidos se rechazan', async () => {
    const esc = await escenarioBase(e);
    expect((await esc.admin.post(`/grupos/${esc.grupoId}/ramas`, { nombre: 'Caminantes' })).statusCode).toBe(409);
  });
});

describe('RF-006 / RF-007 / RF-008 equipos', () => {
  it('crear un quinto equipo lo deja disponible; renombrarlo se ve en las fichas', async () => {
    const esc = await escenarioBase(e);
    const nuevo = (await esc.admin.post(`/ramas/${esc.caminantes}/equipos`, { nombre: 'Arturo Penny' })).json().id;
    let snap = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json();
    expect(snap.rama.equipos.filter((x: { activo: boolean }) => x.activo)).toHaveLength(5);
    await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ equipoId: nuevo }));
    await esc.admin.patch(`/equipos/${nuevo}`, { nombre: 'Arturo Penny II' });
    snap = (await esc.admin.get(`/ramas/${esc.caminantes}/snapshot`)).json();
    const equipo = snap.rama.equipos.find((x: { id: string }) => x.id === snap.fichas[0].equipoId);
    expect(equipo.nombre).toBe('Arturo Penny II');
  });

  it('desactivado: no se asigna a fichas nuevas; los integrantes lo conservan 90 días y luego quedan sin equipo', async () => {
    const esc = await escenarioBase(e);
    const bp = esc.equipos['Baden Powell']!;
    const f = (await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ equipoId: bp, cordi: 'coordinador' }))).json();
    await esc.admin.post(`/equipos/${bp}/desactivar`);
    const otra = await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ dni: '40111222', equipoId: bp }));
    expect(otra.statusCode).toBe(400);
    expect(otra.json().campos.equipoId).toMatch(/desactivado/);
    // Sigue asignado y la ficha se puede editar en otros campos.
    const ed = await esc.admin.patch(`/fichas/${f.id}`, { version: f.version, datos: { mistica: 'Luz' } });
    expect(ed.statusCode).toBe(200);
    expect(ed.json().equipoId).toBe(bp);
    e.reloj.ahora = new Date(e.reloj.ahora.getTime() + 89 * 24 * 3600 * 1000);
    await ejecutarTareas(e.deps);
    // La sesión dura 30 días: se vuelve a entrar.
    let admin = await login(e.app, 'mauro@scout.test');
    expect((await admin.get(`/fichas/${f.id}`)).json().equipoId).toBe(bp);
    e.reloj.ahora = new Date(e.reloj.ahora.getTime() + 1 * 24 * 3600 * 1000);
    expect((await ejecutarTareas(e.deps)).equipos).toBe(1);
    admin = await login(e.app, 'mauro@scout.test');
    const despues = (await admin.get(`/fichas/${f.id}`)).json();
    expect(despues.equipoId).toBeNull();
    expect(despues.cordi).toBeNull();
    const hist = (await admin.get(`/fichas/${f.id}/historial`)).json();
    expect(hist[0]).toMatchObject({ campo: 'equipoId', valorAnterior: 'Baden Powell', valorNuevo: null });
  });
});

describe('RF-009 / RF-016 usuarios', () => {
  it('invitar envía el mail de activación; invitar de nuevo al mismo mail ofrece agregar asignación', async () => {
    const esc = await escenarioBase(e);
    const r = await esc.admin.post(`/grupos/${esc.grupoId}/usuarios`, {
      nombre: 'Edu',
      email: 'educador@ejemplo.com',
      rolId: esc.roles['Educador'],
      alcance: 'rama',
      ramaId: esc.caminantes,
    });
    expect(r.statusCode).toBe(201);
    expect(e.mails.enviados.at(-1)).toMatchObject({ para: 'educador@ejemplo.com', tipo: 'invitacion' });
    expect(e.mails.enviados.at(-1)!.texto).toContain('https://scout.test/activar?token=');
    const otra = await esc.admin.post(`/grupos/${esc.grupoId}/usuarios`, {
      nombre: 'Edu',
      email: 'Educador@Ejemplo.com',
      rolId: esc.roles['Solo lectura'],
      alcance: 'rama',
      ramaId: esc.unidad,
    });
    expect(otra.statusCode).toBe(409);
    expect(otra.json().codigo).toBe('USUARIO_EXISTENTE');
    const agregar = await esc.admin.post(`/grupos/${esc.grupoId}/usuarios/${otra.json().usuarioId}/asignaciones`, {
      rolId: esc.roles['Solo lectura'],
      alcance: 'rama',
      ramaId: esc.unidad,
    });
    expect(agregar.statusCode).toBe(201);
  });

  it('lista los usuarios con su estado y sus roles', async () => {
    const esc = await escenarioBase(e);
    const edu = await usuarioCon(e, esc, 'edu@ejemplo.com', 'Educador', { alcance: 'equipo', equipoId: esc.equipos['Baden Powell'] });
    const id = (await edu.get('/yo')).json().usuario.id;
    await esc.admin.post(`/grupos/${esc.grupoId}/usuarios/${id}/desactivar`);
    await esc.admin.post(`/grupos/${esc.grupoId}/usuarios`, { nombre: 'Pendiente', email: 'p@ejemplo.com', rolId: esc.roles['Educador'], alcance: 'grupo' });
    const lista = (await esc.admin.get(`/grupos/${esc.grupoId}/usuarios`)).json();
    expect(lista).toHaveLength(3);
    const eduFila = lista.find((u: { email: string }) => u.email === 'edu@ejemplo.com');
    expect(eduFila.activo).toBe(false);
    expect(eduFila.asignaciones[0].alcanceNombre).toBe('Equipo Baden Powell (Caminantes)');
    expect(lista.find((u: { email: string }) => u.email === 'p@ejemplo.com').pendienteActivacion).toBe(true);
  });

  it('un usuario de otro grupo se suma sin crear otra cuenta', async () => {
    const esc = await escenarioBase(e);
    const otro = (await esc.plataforma.post('/plataforma/grupos', { nombre: 'Otro grupo' })).json().id;
    const r = await esc.plataforma.post(`/plataforma/grupos/${otro}/admins`, { nombre: 'Mauro', email: 'mauro@scout.test' });
    expect(r.json().nuevo).toBe(false);
    const yo = (await (await login(e.app, 'mauro@scout.test')).get('/yo')).json();
    expect(yo.gruposAdministrables).toHaveLength(2);
  });
});

describe('RF-017 a RF-020 roles', () => {
  it('rol con Padrón ver/editar y Calendario solo ver; los cambios aplican a todos desde su siguiente acción', async () => {
    const esc = await escenarioBase(e);
    const crear = await esc.admin.post(`/grupos/${esc.grupoId}/roles`, {
      nombre: 'Coordinador de equipo',
      permisos: { padron: ['ver', 'editar'], calendario: ['ver'], inventado: ['ver'] },
    });
    expect(crear.statusCode).toBe(201);
    const rolId = crear.json().id;
    const roles = (await esc.admin.get(`/grupos/${esc.grupoId}/roles`)).json();
    const rol = roles.find((r: { id: string }) => r.id === rolId);
    expect(rol.permisos).toEqual({ padron: ['ver', 'editar'], calendario: ['ver'] });
    // RF-020: un rol nuevo no tiene datos sensibles.
    expect(rol.verSensibles).toBe(false);

    const f = (await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida())).json();
    const usuarios = [];
    for (const n of ['a', 'b', 'c']) {
      await esc.admin.post(`/grupos/${esc.grupoId}/usuarios`, { nombre: n, email: `${n}@ejemplo.com`, rolId, alcance: 'rama', ramaId: esc.caminantes });
      usuarios.push(await (await import('./ayudas')).activar(e, `${n}@ejemplo.com`));
    }
    const ctx = (await usuarios[0]!.get('/yo')).json().contextos[0];
    expect(ctx.permisos).toEqual({ padron: ['ver', 'editar'], calendario: ['ver'] });
    expect((await usuarios[0]!.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ dni: '1234567' }))).statusCode).toBe(403);
    let version = f.version;
    const ed = await usuarios[0]!.patch(`/fichas/${f.id}`, { version, datos: { mistica: 'Algo' } });
    expect(ed.statusCode).toBe(200);
    version = ed.json().version;
    // RF-018: se quita editar en Padrón.
    await esc.admin.patch(`/grupos/${esc.grupoId}/roles/${rolId}`, { permisos: { padron: ['ver'], calendario: ['ver'] } });
    for (const u of usuarios) {
      expect((await u.patch(`/fichas/${f.id}`, { version, datos: { mistica: 'Otra' } })).statusCode).toBe(403);
    }
    expect((await usuarios[1]!.get(`/fichas/${f.id}`)).statusCode).toBe(200);
  });

  it('sin el permiso de datos sensibles la ficha no muestra DNI, teléfonos, religión, DDJJ ni consentimiento', async () => {
    const esc = await escenarioBase(e);
    const f = (await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ religionId: esc.catalogo['Católica'], telPropio: '1144445555' }))).json();
    expect(f.dni).toBe('50890337');
    const lector = await usuarioCon(e, esc, 'l@ejemplo.com', 'Solo lectura', { alcance: 'rama', ramaId: esc.caminantes });
    await esc.admin.patch(`/grupos/${esc.grupoId}/roles/${esc.roles['Solo lectura']}`, { permisos: { padron: ['ver'], documentos: ['ver'] } });
    const visto = (await lector.get(`/fichas/${f.id}`)).json();
    for (const c of ['dni', 'telEmergencia1', 'telEmergencia2', 'telPropio', 'religionId']) expect(visto).not.toHaveProperty(c);
    expect(visto.apellido).toBe('Pérez');
    expect(visto.documentos.map((d: { tipo: string }) => d.tipo)).toEqual(['pdfAdjunto']);
  });

  it('el rol de admin no se puede borrar ni recortar; un rol en uso no se borra', async () => {
    const esc = await escenarioBase(e);
    expect((await esc.admin.delete(`/grupos/${esc.grupoId}/roles/${esc.roles['Admin de grupo']}`)).statusCode).toBe(400);
    expect((await esc.admin.patch(`/grupos/${esc.grupoId}/roles/${esc.roles['Admin de grupo']}`, { permisos: {} })).statusCode).toBe(400);
    await usuarioCon(e, esc, 'x@ejemplo.com', 'Educador', { alcance: 'grupo' });
    expect((await esc.admin.delete(`/grupos/${esc.grupoId}/roles/${esc.roles['Educador']}`)).statusCode).toBe(409);
    expect((await esc.admin.delete(`/grupos/${esc.grupoId}/roles/${esc.roles['Jefe de rama']}`)).statusCode).toBe(200);
  });
});

describe('RF-019 alcance', () => {
  it('Jefe de rama en Caminantes y Solo lectura en Unidad: en Unidad no edita', async () => {
    const esc = await escenarioBase(e);
    const fu = (await esc.admin.post(`/ramas/${esc.unidad}/fichas`, fichaValida({ dni: '45000111' }))).json();
    const fc = (await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida())).json();
    const u = await usuarioCon(e, esc, 'jefe@ejemplo.com', 'Jefe de rama', { alcance: 'rama', ramaId: esc.caminantes });
    const id = (await u.get('/yo')).json().usuario.id;
    await esc.admin.post(`/grupos/${esc.grupoId}/usuarios/${id}/asignaciones`, { rolId: esc.roles['Solo lectura'], alcance: 'rama', ramaId: esc.unidad });
    expect((await u.patch(`/fichas/${fu.id}`, { version: 1, datos: { mistica: 'x' } })).statusCode).toBe(403);
    expect((await u.patch(`/fichas/${fc.id}`, { version: 1, datos: { mistica: 'x' } })).statusCode).toBe(200);
  });

  it('con alcance de equipo solo ve y edita las fichas de su equipo', async () => {
    const esc = await escenarioBase(e);
    const tupac = esc.equipos['Tupac Amaru']!;
    const lola = esc.equipos['Lola Mora']!;
    const ft = (await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ equipoId: tupac }))).json();
    const fl = (await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ dni: '41222333', equipoId: lola }))).json();
    await esc.admin.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ dni: '41222334' }));
    const u = await usuarioCon(e, esc, 'eq@ejemplo.com', 'Educador', { alcance: 'equipo', equipoId: tupac });
    const yo = (await u.get('/yo')).json();
    expect(yo.contextos[0].soloEquipos).toEqual([tupac]);
    const snap = (await u.get(`/ramas/${esc.caminantes}/snapshot`)).json();
    expect(snap.fichas.map((f: { id: string }) => f.id)).toEqual([ft.id]);
    expect((await u.get(`/fichas/${fl.id}`)).statusCode).toBe(403);
    // RF-024: no puede editar una ficha de Lola Mora.
    expect((await u.patch(`/fichas/${fl.id}`, { version: 1, datos: { mistica: 'x' } })).statusCode).toBe(403);
    // Puede crear fichas en su equipo pero no sin equipo ni en otro.
    expect((await u.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ dni: '42000000', equipoId: tupac }))).statusCode).toBe(201);
    expect((await u.post(`/ramas/${esc.caminantes}/fichas`, fichaValida({ dni: '42000001' }))).statusCode).toBe(403);
    expect((await u.patch(`/fichas/${ft.id}`, { version: 1, datos: { equipoId: lola } })).statusCode).toBe(403);
  });
});

describe('RNF-012 contraseñas', () => {
  it('se guardan con hash y sal', async () => {
    await escenarioBase(e);
    const filas = await e.db.selectFrom('usuarios').select('password_hash').execute();
    for (const f of filas) {
      expect(f.password_hash).toMatch(/^scrypt\$/);
      expect(f.password_hash).not.toContain(PASSWORD);
    }
    expect(new Set(filas.map((f) => f.password_hash)).size).toBe(filas.length);
  });
});
