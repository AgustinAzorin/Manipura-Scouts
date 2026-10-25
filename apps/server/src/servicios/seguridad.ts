import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, sal: Buffer, largo: number, opciones: object) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** RNF-013 */
export const LARGO_MINIMO_PASSWORD = 10;

/** RNF-012: hash scrypt con sal aleatoria. Formato: scrypt$N$r$p$sal$hash (base64). */
export async function hashearPassword(password: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scrypt(password, sal, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export async function verificarPassword(password: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, sal, hash] = partes as [string, string, string, string, string, string];
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await scrypt(password, Buffer.from(sal, 'base64'), esperado.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/** Token aleatorio para sesiones y enlaces; en la base solo se guarda su hash. */
export function generarToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function firmar(secreto: string, datos: string): string {
  return createHmac('sha256', secreto).update(datos).digest('base64url');
}

export function firmaValida(secreto: string, datos: string, firma: string): boolean {
  const esperada = Buffer.from(firmar(secreto, datos));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
