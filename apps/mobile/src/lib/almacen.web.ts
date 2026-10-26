/**
 * Versión web. El navegador no tiene llavero seguro, así que cada espacio vive lo que tiene sentido
 * en una compu que puede ser compartida:
 * - "datos" (la sesión y la nómina) va en sessionStorage: se borra al cerrar la pestaña o el
 *   navegador, y no quedan datos de los protagonistas en la compu (RNF-019, RF-013).
 * - "preferencias" (servidor elegido, columnas y filtros de la nómina) va en localStorage y se conserva.
 * Se cifra igual que en el celular, pero la clave queda junto a los datos: evita que estén en texto
 * plano, no protege contra quien use el navegador abierto (para eso está el bloqueo, bloqueo.web.tsx).
 */
import { getRandomBytes } from 'expo-crypto';
import { aBytes, aHex, aTexto, cifrar, deHex, descifrar } from './cifrado';
import type { Almacen } from './almacen';

export type { Almacen } from './almacen';

const NOMBRE_CLAVE = 'scouttracker.clave-datos';

// Las versiones anteriores guardaban los datos en localStorage: se borran para que no queden en la compu.
try {
  for (const k of Object.keys(localStorage)) if (k.startsWith('scouttracker.datos.')) localStorage.removeItem(k);
} catch {
  // Sin acceso al almacenamiento (por ejemplo, durante el armado estático) no hay nada que borrar.
}

function obtenerClave(lugar: Storage): Uint8Array {
  const guardada = lugar.getItem(NOMBRE_CLAVE);
  if (guardada) return deHex(guardada);
  const nueva = getRandomBytes(32);
  lugar.setItem(NOMBRE_CLAVE, aHex(nueva));
  return nueva;
}

export function crearAlmacen(espacio: 'datos' | 'preferencias'): Almacen {
  const prefijo = `scouttracker.${espacio}.`;
  const lugar = () => (espacio === 'datos' ? sessionStorage : localStorage);
  return {
    async guardar(k, valor) {
      const l = lugar();
      l.setItem(prefijo + k, aHex(cifrar(obtenerClave(l), aBytes(JSON.stringify(valor)), getRandomBytes)));
    },
    async leer<T>(k: string) {
      const l = lugar();
      const v = l.getItem(prefijo + k);
      if (!v) return null;
      try {
        return JSON.parse(aTexto(descifrar(obtenerClave(l), deHex(v)))) as T;
      } catch {
        l.removeItem(prefijo + k);
        return null;
      }
    },
    async borrar(k) {
      lugar().removeItem(prefijo + k);
    },
    async borrarTodo() {
      const l = lugar();
      for (const k of Object.keys(l)) if (k.startsWith(prefijo)) l.removeItem(k);
    },
  };
}
