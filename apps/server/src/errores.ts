import { CODIGOS_ERROR } from '@scouttracker/shared';

/** Error con código y estado HTTP que el manejador convierte en `ErrorApi`. */
export class ErrorHttp extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(mensaje);
  }
}

export const noAutenticado = (mensaje = 'Tenés que iniciar sesión') => new ErrorHttp(401, CODIGOS_ERROR.noAutenticado, mensaje);
export const sinPermiso = (mensaje = 'No tenés permiso para hacer esto') => new ErrorHttp(403, CODIGOS_ERROR.sinPermiso, mensaje);
export const noEncontrado = (mensaje = 'No se encontró') => new ErrorHttp(404, CODIGOS_ERROR.noEncontrado, mensaje);
export const validacion = (mensaje: string, campos?: Record<string, string>) =>
  new ErrorHttp(400, CODIGOS_ERROR.validacion, mensaje, campos ? { campos } : {});
export const conflicto = (codigo: string, mensaje: string, extra: Record<string, unknown> = {}) =>
  new ErrorHttp(409, codigo, mensaje, extra);
