import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { CODIGOS_ERROR, type RespuestaLogin } from '@scouttracker/shared';
import { sesionDe, type Dependencias } from '../app';
import { ErrorHttp, validacion } from '../errores';
import { respuestaYo } from '../servicios/acceso';
import { crearEnlace, verificarEnlace, type TipoEnlace } from '../servicios/enlaces';
import { generarToken, hashearPassword, hashToken, LARGO_MINIMO_PASSWORD, verificarPassword } from '../servicios/seguridad';
import { paginaFormularioPassword, paginaMensaje } from './paginas';

/** RNF-014 */
export const INTENTOS_ANTES_DE_BLOQUEO = 5;
export const MINUTOS_BLOQUEO = 15;
/** RNF-015 */
export const DIAS_SESION = 30;

const esquemaLogin = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(500) });
const esquemaPassword = z.object({ token: z.string().min(10).max(200), password: z.string().max(500) });

const credencialesInvalidas = () =>
  new ErrorHttp(401, 'CREDENCIALES_INVALIDAS', 'El mail o la contraseña no son correctos');

/** Un usuario está desactivado si no es admin de plataforma y no está activo en ningún grupo. */
async function estaDesactivado(deps: Dependencias, usuarioId: string, esAdminPlataforma: boolean): Promise<boolean> {
  if (esAdminPlataforma) return false;
  const r = await deps.db
    .selectFrom('miembros')
    .select(sql<number>`count(*) filter (where activo)::int`.as('activos'))
    .select(sql<number>`count(*)::int`.as('total'))
    .where('usuario_id', '=', usuarioId)
    .executeTakeFirstOrThrow();
  return r.total > 0 && r.activos === 0;
}

/** Define la contraseña desde un enlace de invitación (RF-010) o de recuperación (RF-012). */
async function definirPassword(deps: Dependencias, tipo: TipoEnlace, token: string, password: string): Promise<void> {
  if (password.length < LARGO_MINIMO_PASSWORD) {
    throw validacion(`La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres`, {
      password: `Mínimo ${LARGO_MINIMO_PASSWORD} caracteres`,
    });
  }
  const ahora = deps.ahora();
  const enlace = await verificarEnlace(deps.db, token, tipo, ahora);
  if (!enlace.valido) {
    throw new ErrorHttp(
      410,
      CODIGOS_ERROR.enlaceVencido,
      tipo === 'invitacion'
        ? 'La invitación venció o ya se usó. Pedile al admin del grupo una nueva invitación.'
        : 'El enlace venció o ya se usó. Pedí uno nuevo desde la app.',
    );
  }
  const hash = await hashearPassword(password);
  await deps.db.transaction().execute(async (trx) => {
    const marcado = await trx
      .updateTable('enlaces')
      .set({ usado_en: ahora })
      .where('id', '=', enlace.enlaceId)
      .where('usado_en', 'is', null)
      .executeTakeFirst();
    if (Number(marcado.numUpdatedRows) !== 1) throw new ErrorHttp(410, CODIGOS_ERROR.enlaceVencido, 'El enlace ya se usó');
    await trx
      .updateTable('usuarios')
      .set({ password_hash: hash, intentos_fallidos: 0, bloqueado_hasta: null })
      .where('id', '=', enlace.usuarioId)
      .execute();
    // Al restablecer la contraseña se cierran las sesiones abiertas.
    if (tipo === 'recuperacion') await trx.deleteFrom('sesiones').where('usuario_id', '=', enlace.usuarioId).execute();
  });
}

export async function rutasAuth(app: FastifyInstance, deps: Dependencias) {
  // RF-011
  app.post('/auth/login', async (req): Promise<RespuestaLogin> => {
    const { email, password } = esquemaLogin.parse(req.body);
    const ahora = deps.ahora();
    const u = await deps.db.selectFrom('usuarios').selectAll().where('email', '=', email).executeTakeFirst();
    if (!u || !u.password_hash) throw credencialesInvalidas();
    if (u.bloqueado_hasta && u.bloqueado_hasta > ahora) {
      const minutos = Math.ceil((u.bloqueado_hasta.getTime() - ahora.getTime()) / 60_000);
      throw new ErrorHttp(429, CODIGOS_ERROR.bloqueado, `Demasiados intentos fallidos. Probá de nuevo en ${minutos} min.`);
    }
    if (!(await verificarPassword(password, u.password_hash))) {
      const intentos = u.intentos_fallidos + 1;
      const bloquear = intentos >= INTENTOS_ANTES_DE_BLOQUEO;
      await deps.db
        .updateTable('usuarios')
        .set({
          intentos_fallidos: bloquear ? 0 : intentos,
          bloqueado_hasta: bloquear ? new Date(ahora.getTime() + MINUTOS_BLOQUEO * 60_000) : null,
        })
        .where('id', '=', u.id)
        .execute();
      throw credencialesInvalidas();
    }
    if (await estaDesactivado(deps, u.id, u.es_admin_plataforma)) {
      throw new ErrorHttp(403, CODIGOS_ERROR.usuarioDesactivado, 'Tu usuario está desactivado. Consultá con el admin del grupo.');
    }
    await deps.db.updateTable('usuarios').set({ intentos_fallidos: 0, bloqueado_hasta: null }).where('id', '=', u.id).execute();
    const token = generarToken();
    const venceEn = new Date(ahora.getTime() + DIAS_SESION * 24 * 60 * 60 * 1000);
    await deps.db.insertInto('sesiones').values({ usuario_id: u.id, token_hash: hashToken(token), vence_en: venceEn }).execute();
    return {
      token,
      venceEn: venceEn.toISOString(),
      usuario: { id: u.id, nombre: u.nombre, email: u.email, esAdminPlataforma: u.es_admin_plataforma },
    };
  });

  // RF-013
  app.post('/auth/logout', async (req) => {
    const s = sesionDe(req);
    await deps.db.deleteFrom('sesiones').where('id', '=', s.sesionId).execute();
    return { ok: true };
  });

  // RF-021: datos del usuario y contextos de trabajo.
  app.get('/yo', async (req) => respuestaYo(deps.db, sesionDe(req)));

  // RF-012: misma respuesta exista o no el mail.
  app.post('/auth/recuperar', async (req) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
    const u = await deps.db
      .selectFrom('usuarios')
      .select(['id', 'nombre', 'email', 'password_hash', 'es_admin_plataforma'])
      .where('email', '=', email)
      .executeTakeFirst();
    if (u?.password_hash && !(await estaDesactivado(deps, u.id, u.es_admin_plataforma))) {
      const token = await crearEnlace(deps.db, u.id, 'recuperacion', deps.ahora());
      await deps.mailer.enviar({
        tipo: 'recuperacion',
        para: u.email,
        asunto: 'ScoutTracker: recuperar contraseña',
        texto:
          `Hola ${u.nombre}:\n\nPara definir una contraseña nueva entrá a este enlace. Vence en 1 hora y sirve una sola vez.\n\n` +
          `${deps.config.urlPublica}/restablecer?token=${token}\n\nSi no lo pediste, ignorá este mail.`,
      });
    }
    return { mensaje: 'Si el mail está registrado, te enviamos un enlace para definir una contraseña nueva.' };
  });

  app.post('/auth/activar', async (req) => {
    const { token, password } = esquemaPassword.parse(req.body);
    await definirPassword(deps, 'invitacion', token, password);
    return { ok: true };
  });

  app.post('/auth/restablecer', async (req) => {
    const { token, password } = esquemaPassword.parse(req.body);
    await definirPassword(deps, 'recuperacion', token, password);
    return { ok: true };
  });

  // Páginas web a las que llevan los enlaces de los mails: funcionan en cualquier celular
  // sin depender de que el cliente de mail abra la app.
  for (const [ruta, tipo] of [
    ['/activar', 'invitacion'],
    ['/restablecer', 'recuperacion'],
  ] as const) {
    const titulo = tipo === 'invitacion' ? 'Activá tu cuenta' : 'Definí una contraseña nueva';
    app.get(ruta, async (req, reply) => {
      const token = String((req.query as Record<string, unknown>).token ?? '');
      reply.type('text/html; charset=utf-8');
      const estado = token ? await verificarEnlace(deps.db, token, tipo, deps.ahora()) : { valido: false as const };
      if (!estado.valido) {
        return paginaMensaje(
          'Enlace vencido',
          tipo === 'invitacion'
            ? 'La invitación venció o ya se usó. Pedile al admin del grupo que te envíe una nueva.'
            : 'El enlace venció o ya se usó. Pedí uno nuevo desde la app con "Olvidé mi contraseña".',
        );
      }
      return paginaFormularioPassword(titulo, ruta, token, null);
    });
    app.post(ruta, async (req, reply) => {
      const cuerpo = req.body as Record<string, unknown>;
      const token = String(cuerpo.token ?? '');
      const password = String(cuerpo.password ?? '');
      const repetida = String(cuerpo.repetir ?? '');
      reply.type('text/html; charset=utf-8');
      if (password !== repetida) return paginaFormularioPassword(titulo, ruta, token, 'Las contraseñas no coinciden.');
      try {
        await definirPassword(deps, tipo, token, password);
      } catch (e) {
        if (e instanceof ErrorHttp && e.codigo === CODIGOS_ERROR.validacion) {
          return paginaFormularioPassword(titulo, ruta, token, e.message);
        }
        if (e instanceof ErrorHttp) return paginaMensaje('Enlace vencido', e.message);
        throw e;
      }
      return paginaMensaje('Listo', 'Ya podés iniciar sesión en la app ScoutTracker con tu mail y tu contraseña nueva.');
    });
  }
}
