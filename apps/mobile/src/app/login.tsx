import { useRouter } from 'expo-router';
import { useState } from 'react';
import { mensajeDeError } from '../lib/api';
import { useSesion } from '../lib/sesion';
import { Aviso, Boton, Campo, Pantalla, Parrafo, Titulo } from '../ui/componentes';

/** RF-011 */
export default function Login() {
  const { iniciarSesion, estado } = useSesion();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const entrar = async () => {
    setError(null);
    if (!email.trim() || !password) return setError('Completá el mail y la contraseña');
    setEnviando(true);
    try {
      await iniciarSesion(email.trim(), password);
      router.replace('/');
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Pantalla>
      <Titulo>ScoutTracker</Titulo>
      <Parrafo suave>Padrón y actividades de la rama</Parrafo>
      {estado.tipo === 'sinSesion' && estado.motivo ? <Aviso tipo="aviso">{estado.motivo}</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <Campo etiqueta="Mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" />
      <Campo etiqueta="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={entrar} />
      <Boton titulo="Entrar" onPress={entrar} cargando={enviando} />
      <Boton titulo="Olvidé mi contraseña" variante="texto" onPress={() => router.push('/recuperar')} />
    </Pantalla>
  );
}
