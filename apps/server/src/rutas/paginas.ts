const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Colores con contraste AA (RNF-029) y controles de 48 px de alto (RNF-028).
function pagina(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapar(titulo)} — ScoutTracker</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f4f5f2; color: #1b1f1a; margin: 0; padding: 24px 16px; font-size: 1.125rem; line-height: 1.5; }
  main { max-width: 440px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  h1 { font-size: 1.5rem; margin: 0 0 16px; color: #1f4d2b; }
  label { display: block; font-weight: 600; margin: 16px 0 6px; }
  input { width: 100%; box-sizing: border-box; min-height: 48px; font-size: 1.125rem; padding: 8px 12px; border: 2px solid #5b6358; border-radius: 8px; }
  button { margin-top: 24px; width: 100%; min-height: 48px; font-size: 1.125rem; font-weight: 600; background: #1f4d2b; color: #fff; border: 0; border-radius: 8px; }
  .error { background: #fde8e8; color: #8a1c1c; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
  .ayuda { color: #4a5247; font-size: 1rem; }
</style>
</head>
<body><main><h1>${escapar(titulo)}</h1>${cuerpo}</main></body>
</html>`;
}

export function paginaMensaje(titulo: string, mensaje: string): string {
  return pagina(titulo, `<p>${escapar(mensaje)}</p>`);
}

export function paginaFormularioPassword(titulo: string, accion: string, token: string, error: string | null): string {
  return pagina(
    titulo,
    `${error ? `<p class="error" role="alert">${escapar(error)}</p>` : ''}
<form method="post" action="${escapar(accion)}">
  <input type="hidden" name="token" value="${escapar(token)}">
  <label for="password">Contraseña</label>
  <input id="password" name="password" type="password" autocomplete="new-password" minlength="10" required>
  <p class="ayuda">Al menos 10 caracteres.</p>
  <label for="repetir">Repetí la contraseña</label>
  <input id="repetir" name="repetir" type="password" autocomplete="new-password" minlength="10" required>
  <button type="submit">Guardar contraseña</button>
</form>`,
  );
}
