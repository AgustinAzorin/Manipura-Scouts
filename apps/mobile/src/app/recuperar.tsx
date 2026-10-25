import { useState } from 'react';
import { api, mensajeDeError } from '../lib/api';
import { Aviso, Boton, Campo, Pantalla, Parrafo } from '../ui/componentes';

/** RF-012 */
export default function Recuperar() {
  const [email, setEmail] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    setError(null);
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>('/auth/recuperar', { email: email.trim() });
      setMensaje(r.mensaje);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Pantalla>
      <Parrafo>Escribí tu mail y te enviamos un enlace para definir una contraseña nueva. El enlace vence en 1 hora.</Parrafo>
      {mensaje ? <Aviso tipo="exito">{mensaje}</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <Campo etiqueta="Mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Boton titulo="Enviar enlace" onPress={enviar} cargando={enviando} deshabilitado={!email.trim()} />
    </Pantalla>
  );
}
