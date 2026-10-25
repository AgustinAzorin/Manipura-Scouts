/**
 * Versión web, solo para desarrollo y pruebas en el navegador: usa localStorage con el mismo
 * cifrado, pero la clave también queda en localStorage (la web no tiene llavero seguro).
 */
import { getRandomBytes } from 'expo-crypto';
import { aBytes, aHex, aTexto, cifrar, deHex, descifrar } from './cifrado';
import type { Almacen } from './almacen';

export type { Almacen } from './almacen';

const NOMBRE_CLAVE = 'scouttracker.clave-datos';
function obtenerClave(): Uint8Array {
  const guardada = localStorage.getItem(NOMBRE_CLAVE);
  if (guardada) return deHex(guardada);
  const nueva = getRandomBytes(32);
  localStorage.setItem(NOMBRE_CLAVE, aHex(nueva));
  return nueva;
}

export function crearAlmacen(espacio: 'datos' | 'preferencias'): Almacen {
  const prefijo = `scouttracker.${espacio}.`;
  return {
    async guardar(k, valor) {
      localStorage.setItem(prefijo + k, aHex(cifrar(obtenerClave(), aBytes(JSON.stringify(valor)), getRandomBytes)));
    },
    async leer<T>(k: string) {
      const v = localStorage.getItem(prefijo + k);
      if (!v) return null;
      try {
        return JSON.parse(aTexto(descifrar(obtenerClave(), deHex(v)))) as T;
      } catch {
        localStorage.removeItem(prefijo + k);
        return null;
      }
    },
    async borrar(k) {
      localStorage.removeItem(prefijo + k);
    },
    async borrarTodo() {
      for (const k of Object.keys(localStorage)) if (k.startsWith(prefijo)) localStorage.removeItem(k);
    },
  };
}
