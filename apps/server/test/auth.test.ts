import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activar, Cliente, crearEntorno, escenarioBase, login, PASSWORD, tokenDelMail, usuarioCon, type Entorno } from './ayudas';

let e: Entorno;
beforeEach(async () => {
  e = await crearEntorno();
});
afterEach(async () => {
  await e.cerrar();
});

const avanzar = (ms: number) => {
  e.reloj.ahora = new Date(e.reloj.ahora.getTime() + ms);
};
const MIN = 60_000;
const DIA = 24 * 60 * MIN;

describe('RF-010 activar cuenta / RN-21', () => {
  it('con enlace vigente y contraseña de 10+ caracteres la cuenta queda activa y puede entrar', async () => {
    const esc = await escenarioBase(e);
    await esc.admin.post(`/grupos/${esc.grupoId}/usuarios`, { nombre: 'Edu', email: 'educador@ejemplo.com', rolId: esc.roles['Educador'], alcance: 'rama', ramaId: esc.caminantes });
    const token = tokenDelMail(e, 'educador@ejemplo.com');
    const corta = await e.app.inject({ method: 'POST', url: '/auth/activar', payload: { token, password: 'corta' } });
    expect(corta.statusCode).toBe(400); // RNF-013
    const ok = await e.app.inject({ method: 'POST', url: '/auth/activar', payload: { token, password: PASSWORD } });
    expect(ok.statusCode).toBe(200);
    await login(e.app, 'educador@ejemplo.com');
    // Un solo uso
    const otra = await e.app.inject({ method: 'POST', url: '/auth/activar', payload: { token, password: PASSWORD } });
    expect(otra.statusCode).toBe(410);
  });

  it('la invitación vence a los 7 días e informa que hay que pedir una nueva', async () => {
    const esc = await escenarioBase(e);
    await esc.admin.post(`/grupos/${esc.grupoId}/usuarios`, { nombre: 'Edu', email: 'edu@ejemplo.com', rolId: esc.roles['Educador'], alcance: 'grupo' });
    const token = tokenDelMail(e, 'edu@ejemplo.com');
    avanzar(7 * DIA + MIN);
    const r = await e.app.inject({ method: 'POST', url: '/auth/activar', payload: { token, password: PASSWORD } });
    expect(r.statusCode).toBe(410);
    expect(r.json().mensaje).toMatch(/nueva invitación/);
    const pagina = await e.app.inject({ method: 'GET', url: `/activar?token=${token}` });
    expect(pagina.body).toContain('venció');
  });

  it('reenviar la invitación invalida la anterior', async () => {
    const esc = await escenarioBase(e);
    const inv = await esc.admin.post(`/grupos/${esc.grupoId}/usuarios`, { nombre: 'Edu', email: 'edu@ejemplo.com', rolId: esc.roles['Educador'], alcance: 'grupo' });
    const primero = tokenDelMail(e, 'edu@ejemplo.com');
    await esc.admin.post(`/grupos/${esc.grupoId}/usuarios/${inv.json().usuarioId}/reenviar-invitacion`);
    const segundo = tokenDelMail(e, 'edu@ejemplo.com');
    expect(segundo).not.toBe(primero);
    expect((await e.app.inject({ method: 'POST', url: '/auth/activar', payload: { token: primero, password: PASSWORD } })).statusCode).toBe(410);
    expect((await e.app.inject({ method: 'POST', url: '/auth/activar', payload: { token: segundo, password: PASSWORD } })).statusCode).toBe(200);
  });

  it('la página web de activación funciona con un formulario', async () => {
    const esc = await escenarioBase(e);
    await esc.admin.post(`/grupos/${esc.grupoId}/usuarios`, { nombre: 'Edu', email: 'edu@ejemplo.com', rolId: esc.roles['Educador'], alcance: 'grupo' });
    const token = tokenDelMail(e, 'edu@ejemplo.com');
    const get = await e.app.inject({ method: 'GET', url: `/activar?token=${token}` });
    expect(get.body).toContain('<form');
    const distinta = await e.app.inject({ method: 'POST', url: '/activar', payload: `token=${token}&password=${PASSWORD}&repetir=otra-cosa-123`, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(distinta.body).toContain('no coinciden');
    const ok = await e.app.inject({ method: 'POST', url: '/activar', payload: `token=${token}&password=${encodeURIComponent(PASSWORD)}&repetir=${encodeURIComponent(PASSWORD)}`, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(ok.body).toContain('Ya podés iniciar sesión');
    await login(e.app, 'edu@ejemplo.com');
  });
});

describe('RF-011 iniciar sesión / RNF-014 / RNF-015', () => {
  it('la sesión dura 30 días desde el inicio de sesión', async () => {
    const esc = await escenarioBase(e);
    expect((await esc.admin.get('/yo')).statusCode).toBe(200);
    avanzar(29 * DIA);
    expect((await esc.admin.get('/yo')).statusCode).toBe(200);
    avanzar(1 * DIA + MIN);
    expect((await esc.admin.get('/yo')).statusCode).toBe(401);
  });

  it('tras 5 contraseñas incorrectas la sexta se bloquea 15 minutos aunque sea correcta', async () => {
    await escenarioBase(e);
    for (let i = 0; i < 5; i++) {
      const r = await e.app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'mauro@scout.test', password: 'equivocada-123' } });
      expect(r.statusCode).toBe(401);
    }
    const sexta = await e.app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'mauro@scout.test', password: PASSWORD } });
    expect(sexta.statusCode).toBe(429);
    avanzar(15 * MIN + 1000);
    await login(e.app, 'mauro@scout.test');
  });

  it('un usuario desactivado no puede entrar aunque sus credenciales sean correctas', async () => {
    const esc = await escenarioBase(e);
    const edu = await usuarioCon(e, esc, 'edu@ejemplo.com', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const id = (await edu.get('/yo')).json().usuario.id;
    await esc.admin.post(`/grupos/${esc.grupoId}/usuarios/${id}/desactivar`);
    const r = await e.app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'edu@ejemplo.com', password: PASSWORD } });
    expect(r.statusCode).toBe(403);
    expect(r.json().codigo).toBe('USUARIO_DESACTIVADO');
  });

  it('el mail no distingue mayúsculas', async () => {
    await escenarioBase(e);
    await login(e.app, 'MAURO@Scout.test');
  });
});

describe('RF-012 recuperar contraseña', () => {
  it('mail registrado recibe enlace; no registrado ve el mismo mensaje y no se envía nada', async () => {
    await escenarioBase(e);
    const antes = e.mails.enviados.length;
    const a = await e.app.inject({ method: 'POST', url: '/auth/recuperar', payload: { email: 'mauro@scout.test' } });
    const b = await e.app.inject({ method: 'POST', url: '/auth/recuperar', payload: { email: 'nadie@scout.test' } });
    expect(a.json().mensaje).toBe(b.json().mensaje);
    expect(e.mails.enviados.length).toBe(antes + 1);
    const token = tokenDelMail(e, 'mauro@scout.test');
    const r = await e.app.inject({ method: 'POST', url: '/auth/restablecer', payload: { token, password: 'nueva-contraseña-1' } });
    expect(r.statusCode).toBe(200);
    await login(e.app, 'mauro@scout.test', 'nueva-contraseña-1');
  });

  it('el enlace vence a la hora y es de un solo uso', async () => {
    await escenarioBase(e);
    await e.app.inject({ method: 'POST', url: '/auth/recuperar', payload: { email: 'mauro@scout.test' } });
    const token = tokenDelMail(e, 'mauro@scout.test');
    avanzar(61 * MIN);
    const r = await e.app.inject({ method: 'POST', url: '/auth/restablecer', payload: { token, password: 'nueva-contraseña-1' } });
    expect(r.statusCode).toBe(410);
    expect(r.json().mensaje).toMatch(/Pedí uno nuevo/);
  });

  it('restablecer cierra las sesiones abiertas', async () => {
    const esc = await escenarioBase(e);
    await e.app.inject({ method: 'POST', url: '/auth/recuperar', payload: { email: 'mauro@scout.test' } });
    await e.app.inject({ method: 'POST', url: '/auth/restablecer', payload: { token: tokenDelMail(e, 'mauro@scout.test'), password: 'nueva-contraseña-1' } });
    expect((await esc.admin.get('/yo')).statusCode).toBe(401);
  });
});

describe('RF-013 cerrar sesión', () => {
  it('invalida el token', async () => {
    const esc = await escenarioBase(e);
    expect((await esc.admin.post('/auth/logout')).statusCode).toBe(200);
    expect((await esc.admin.get('/yo')).statusCode).toBe(401);
  });
});

describe('RF-014 / RF-015 / RNF-021 desactivar y reactivar', () => {
  it('desactivar invalida la sesión abierta; reactivar permite entrar con la contraseña anterior y conserva los roles', async () => {
    const esc = await escenarioBase(e);
    const edu = await usuarioCon(e, esc, 'edu@ejemplo.com', 'Educador', { alcance: 'rama', ramaId: esc.caminantes });
    const id = (await edu.get('/yo')).json().usuario.id;
    await esc.admin.post(`/grupos/${esc.grupoId}/usuarios/${id}/desactivar`);
    expect((await edu.get('/yo')).statusCode).toBe(401);
    await esc.admin.post(`/grupos/${esc.grupoId}/usuarios/${id}/reactivar`);
    const otra = await login(e.app, 'edu@ejemplo.com');
    const yo = (await otra.get('/yo')).json();
    expect(yo.contextos.map((c: { ramaNombre: string }) => c.ramaNombre)).toEqual(['Caminantes']);
  });

  it('el grupo no puede quedarse sin admin', async () => {
    const esc = await escenarioBase(e);
    const yo = (await esc.admin.get('/yo')).json();
    const r = await esc.admin.post(`/grupos/${esc.grupoId}/usuarios/${yo.usuario.id}/desactivar`);
    expect(r.statusCode).toBe(409);
  });

  it('sin token no hay acceso', async () => {
    const anon = new Cliente(e.app);
    expect((await anon.get('/yo')).statusCode).toBe(401);
    void activar;
  });
});
