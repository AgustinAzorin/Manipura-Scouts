/** Versión web: guarda un archivo en la carpeta de descargas del navegador. */
export function descargarEnNavegador(datos: Blob, nombre: string): void {
  const url = URL.createObjectURL(datos);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre.replace(/[\/:*?"<>|]/g, ' ');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
