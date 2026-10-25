/** RN-03 / RD-009: el DNI se guarda sin puntos, espacios ni otros separadores. */
export function normalizarDni(valor: string | number | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const digitos = String(valor).replace(/\D/g, '');
  return digitos.length > 0 ? digitos : null;
}

/** Un DNI argentino tiene entre 7 y 8 dígitos (se aceptan 6 a 9 para documentos antiguos o extranjeros). */
export function esDniValido(dni: string | null | undefined): boolean {
  return !!dni && /^\d{6,9}$/.test(dni);
}

/** RD-009: los teléfonos se guardan solo con dígitos. */
export function normalizarTelefono(valor: string | number | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const digitos = String(valor).replace(/\D/g, '');
  return digitos.length > 0 ? digitos : null;
}

export function esTelefonoValido(tel: string | null | undefined): boolean {
  return !!tel && /^\d{6,15}$/.test(tel);
}

/** Texto para comparar sin mayúsculas ni tildes (RF-032). */
export function normalizarTexto(valor: string | null | undefined): string {
  if (!valor) return '';
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nombre "Apellido, Nombre" como en la planilla. */
export function nombreCompleto(f: { apellido?: string | null; nombre?: string | null }): string {
  const ap = (f.apellido ?? '').trim();
  const no = (f.nombre ?? '').trim();
  if (ap && no) return `${ap}, ${no}`;
  return ap || no;
}

/**
 * RF-032: coincide si la búsqueda está contenida en apellido, nombre o "apellido nombre",
 * ignorando mayúsculas y tildes; o, si tiene dígitos, en el DNI ignorando puntos.
 * El DNI solo participa si se pasa (es decir, si el usuario tiene permiso de datos sensibles).
 */
export function coincideBusqueda(
  busqueda: string,
  f: { apellido?: string | null; nombre?: string | null; dni?: string | null },
): boolean {
  const q = normalizarTexto(busqueda);
  if (!q) return true;
  const texto = normalizarTexto(`${f.apellido ?? ''} ${f.nombre ?? ''} ${f.nombre ?? ''} ${f.apellido ?? ''}`);
  if (texto.includes(q.replace(/,/g, '').replace(/\s+/g, ' '))) return true;
  const digitos = busqueda.replace(/[.\s-]/g, '');
  if (/^\d+$/.test(digitos) && f.dni) return f.dni.includes(digitos);
  return false;
}

const COLLATOR = new Intl.Collator('es', { sensitivity: 'base' });

/** Orden alfabético en español por apellido y nombre, sin depender de la base de datos. */
export function compararNombres(
  a: { apellido?: string | null; nombre?: string | null },
  b: { apellido?: string | null; nombre?: string | null },
): number {
  return COLLATOR.compare(a.apellido ?? '', b.apellido ?? '') || COLLATOR.compare(a.nombre ?? '', b.nombre ?? '');
}
