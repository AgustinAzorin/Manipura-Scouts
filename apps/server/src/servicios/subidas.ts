import type { FastifyRequest } from 'fastify';
import { TAMANO_MAXIMO_ARCHIVO } from '@scouttracker/shared';
import { ErrorHttp, validacion } from '../errores';
import { detectarTipoArchivo } from './almacenamiento';

export interface ArchivoSubido {
  nombre: string;
  datos: Buffer;
  mime: 'application/pdf' | 'image/jpeg' | 'image/png';
}

/** Lee el único archivo de una petición multipart y verifica tipo real y tamaño (RD-004). */
export async function leerArchivoSubido(
  req: FastifyRequest,
  opciones: { tiposPermitidos: readonly string[]; tamanoMaximo?: number },
): Promise<ArchivoSubido> {
  const maximo = opciones.tamanoMaximo ?? TAMANO_MAXIMO_ARCHIVO;
  if (!req.isMultipart()) throw validacion('Falta el archivo');
  const parte = await req.file({ limits: { fileSize: maximo } });
  if (!parte) throw validacion('Falta el archivo');
  const datos = await parte.toBuffer();
  if (parte.file.truncated || datos.length > maximo) {
    throw new ErrorHttp(413, 'ARCHIVO_GRANDE', `El archivo supera el límite de ${Math.round(maximo / 1024 / 1024)} MB`);
  }
  const mime = detectarTipoArchivo(datos);
  if (!mime || !opciones.tiposPermitidos.includes(mime)) {
    throw validacion(
      opciones.tiposPermitidos.includes('application/pdf') ? 'El archivo tiene que ser PDF, JPG o PNG' : 'La imagen tiene que ser PNG o JPG',
    );
  }
  const nombre = (parte.filename || 'archivo').replace(/[\\/\r\n]/g, '_').slice(0, 200);
  return { nombre, datos, mime };
}
