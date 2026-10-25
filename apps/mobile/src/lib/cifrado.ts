import { gcm } from '@noble/ciphers/aes.js';

const LARGO_NONCE = 12;

/** AES-256-GCM con nonce aleatorio antepuesto al texto cifrado (RNF-017). */
export function cifrar(clave: Uint8Array, datos: Uint8Array, aleatorio: (n: number) => Uint8Array): Uint8Array {
  const nonce = aleatorio(LARGO_NONCE);
  const cifrado = gcm(clave, nonce).encrypt(datos);
  const salida = new Uint8Array(nonce.length + cifrado.length);
  salida.set(nonce, 0);
  salida.set(cifrado, nonce.length);
  return salida;
}

export function descifrar(clave: Uint8Array, datos: Uint8Array): Uint8Array {
  return gcm(clave, datos.subarray(0, LARGO_NONCE)).decrypt(datos.subarray(LARGO_NONCE));
}

const codificador = new TextEncoder();
const decodificador = new TextDecoder();
export const aBytes = (texto: string) => codificador.encode(texto);
export const aTexto = (bytes: Uint8Array) => decodificador.decode(bytes);

const ALFABETO = '0123456789abcdef';
export function aHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += ALFABETO[b >> 4]! + ALFABETO[b & 15]!;
  return s;
}
export function deHex(hex: string): Uint8Array {
  const r = new Uint8Array(hex.length / 2);
  for (let i = 0; i < r.length; i++) r[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return r;
}
