/** Recién se ingresó la contraseña: no hace falta pedir también la huella (bloqueo.tsx). */
let loginReciente = false;

export function marcarLoginReciente() {
  loginReciente = true;
}

export function consumirLoginReciente() {
  const v = loginReciente;
  loginReciente = false;
  return v;
}
