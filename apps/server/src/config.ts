import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Lee las variables de `apps/server/.env` si existe (no se versiona). Las variables ya definidas
 * en el entorno tienen prioridad.
 */
export function cargarArchivoEnv(): void {
  const archivo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (existsSync(archivo)) process.loadEnvFile(archivo);
}

export interface Config {
  puerto: number;
  databaseUrl: string;
  /** URL pública del servidor, usada en los enlaces de los mails. */
  urlPublica: string;
  /** Clave para firmar enlaces temporales de archivos (RNF-022). */
  secretoEnlaces: string;
  dirAlmacenamiento: string;
  resendApiKey: string | null;
  mailRemitente: string;
  /** RNF-034: a quién se avisan los errores nuevos. */
  mailResponsableTecnico: string | null;
  /** Orígenes permitidos por CORS: los de la versión web (en producción, https://DOMINIO_WEB). */
  origenesCors: string[];
}

function requerida(nombre: string): string {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta la variable de entorno ${nombre}`);
  return v;
}

export function leerConfig(): Config {
  const produccion = process.env.NODE_ENV === 'production';
  const secreto = process.env.SECRETO_ENLACES ?? (produccion ? requerida('SECRETO_ENLACES') : 'secreto-de-desarrollo');
  if (produccion && secreto.length < 32) throw new Error('SECRETO_ENLACES debe tener al menos 32 caracteres');
  return {
    puerto: Number(process.env.PORT ?? 3000),
    databaseUrl: requerida('DATABASE_URL'),
    urlPublica: (process.env.URL_PUBLICA ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, ''),
    secretoEnlaces: secreto,
    dirAlmacenamiento: path.resolve(process.env.DIR_ALMACENAMIENTO ?? './almacenamiento'),
    resendApiKey: process.env.RESEND_API_KEY ?? null,
    mailRemitente: process.env.MAIL_REMITENTE ?? 'ScoutTracker <no-responder@scouttracker.local>',
    mailResponsableTecnico: process.env.MAIL_RESPONSABLE_TECNICO ?? null,
    origenesCors: (process.env.ORIGENES_CORS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}
