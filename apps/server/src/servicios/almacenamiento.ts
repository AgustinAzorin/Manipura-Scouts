import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Almacenamiento privado de archivos (RNF-022). Los archivos nunca se exponen por URL
 * directa: el servidor los entrega solo con enlaces firmados de vigencia corta.
 */
export interface Almacenamiento {
  guardar(datos: Buffer): Promise<string>;
  leer(clave: string): Promise<Buffer>;
  borrar(clave: string): Promise<void>;
}

/** Guarda en un directorio del servidor que no se sirve como estático. */
export class AlmacenamientoDisco implements Almacenamiento {
  constructor(private readonly dir: string) {}

  private ruta(clave: string): string {
    if (!/^[0-9a-f-]{36}$/.test(clave)) throw new Error('Clave de archivo inválida');
    return path.join(this.dir, clave.slice(0, 2), clave);
  }

  async guardar(datos: Buffer): Promise<string> {
    const clave = randomUUID();
    const ruta = this.ruta(clave);
    await mkdir(path.dirname(ruta), { recursive: true });
    await writeFile(ruta, datos, { mode: 0o600 });
    return clave;
  }

  leer(clave: string): Promise<Buffer> {
    return readFile(this.ruta(clave));
  }

  async borrar(clave: string): Promise<void> {
    await rm(this.ruta(clave), { force: true });
  }
}

export class AlmacenamientoMemoria implements Almacenamiento {
  readonly archivos = new Map<string, Buffer>();
  async guardar(datos: Buffer): Promise<string> {
    const clave = randomUUID();
    this.archivos.set(clave, datos);
    return clave;
  }
  async leer(clave: string): Promise<Buffer> {
    const d = this.archivos.get(clave);
    if (!d) throw new Error('No existe');
    return d;
  }
  async borrar(clave: string): Promise<void> {
    this.archivos.delete(clave);
  }
}

/** Detecta el tipo real por la firma de los primeros bytes (no se confía en el nombre). */
export function detectarTipoArchivo(datos: Buffer): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  if (datos.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff) return 'image/jpeg';
  if (datos.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}
