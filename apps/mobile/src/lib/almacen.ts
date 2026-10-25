/**
 * Almacenamiento local cifrado (RNF-017). La clave AES se genera en el primer uso y se guarda en
 * el llavero del sistema (Keychain / Android Keystore vía SecureStore); los datos se guardan
 * cifrados en archivos de la app.
 */
import { getRandomBytes } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { aBytes, aHex, aTexto, cifrar, deHex, descifrar } from './cifrado';

const NOMBRE_CLAVE = 'scouttracker.clave-datos';
let clave: Uint8Array | null = null;

async function obtenerClave(): Promise<Uint8Array> {
  if (clave) return clave;
  const guardada = await SecureStore.getItemAsync(NOMBRE_CLAVE);
  if (guardada) return (clave = deHex(guardada));
  const nueva = getRandomBytes(32);
  await SecureStore.setItemAsync(NOMBRE_CLAVE, aHex(nueva), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  return (clave = nueva);
}

const nombreArchivo = (k: string) => `${k.replace(/[^a-zA-Z0-9_.-]/g, '_')}.bin`;

export interface Almacen {
  guardar(k: string, valor: unknown): Promise<void>;
  leer<T>(k: string): Promise<T | null>;
  borrar(k: string): Promise<void>;
  borrarTodo(): Promise<void>;
}

export function crearAlmacen(espacio: 'datos' | 'preferencias'): Almacen {
  const dir = () => {
    const d = new Directory(Paths.document, espacio);
    if (!d.exists) d.create({ intermediates: true });
    return d;
  };
  return {
    async guardar(k, valor) {
      const datos = cifrar(await obtenerClave(), aBytes(JSON.stringify(valor)), getRandomBytes);
      const f = new File(dir(), nombreArchivo(k));
      if (!f.exists) f.create();
      await f.write(datos);
    },
    async leer<T>(k: string) {
      const f = new File(dir(), nombreArchivo(k));
      if (!f.exists) return null;
      try {
        return JSON.parse(aTexto(descifrar(await obtenerClave(), await f.bytes()))) as T;
      } catch {
        // Un archivo que no se puede descifrar (clave perdida tras restaurar el equipo) se descarta.
        f.delete();
        return null;
      }
    },
    async borrar(k) {
      const f = new File(dir(), nombreArchivo(k));
      if (f.exists) f.delete();
    },
    async borrarTodo() {
      const d = new Directory(Paths.document, espacio);
      if (d.exists) d.delete();
    },
  };
}
