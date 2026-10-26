import { useRouter } from 'expo-router';
import { useState } from 'react';
import { mensajeDeError, urlApi } from '../lib/api';
import { guardarServidor, PERMITIR_CAMBIAR_SERVIDOR, probarServidor } from '../lib/servidor';
import { useSesion } from '../lib/sesion';
import { Aviso, Boton, Campo, Pantalla, Parrafo, Tarjeta, Titulo } from '../ui/componentes';

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
    <Pantalla angosta>
      <Titulo>ScoutTracker</Titulo>
      <Parrafo suave>Padrón y actividades de la rama</Parrafo>
      {estado.tipo === 'sinSesion' && estado.motivo ? <Aviso tipo="aviso">{estado.motivo}</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <Campo etiqueta="Mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" />
      <Campo etiqueta="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={entrar} />
      <Boton titulo="Entrar" onPress={entrar} cargando={enviando || estado.tipo === 'cargando'} />
      <Boton titulo="Olvidé mi contraseña" variante="texto" onPress={() => router.push('/recuperar')} />
      {/* Se muestra cuando ya se cargó el servidor guardado. */}
      {PERMITIR_CAMBIAR_SERVIDOR && estado.tipo !== 'cargando' ? <ElegirServidor /> : null}
    </Pantalla>
  );
}

/** Solo en las builds de prueba: a qué servidor se conecta la app. */
function ElegirServidor() {
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState(urlApi());
  const [url, setUrl] = useState(actual);
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  if (!abierto) {
    return (
      <Tarjeta>
        <Parrafo suave>Versión de prueba · Servidor: {actual}</Parrafo>
        <Boton titulo="Cambiar servidor" variante="secundario" onPress={() => setAbierto(true)} />
      </Tarjeta>
    );
  }
  return (
    <Tarjeta>
      <Campo
        etiqueta="Dirección del servidor"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        ayuda="Ej.: https://algo.trycloudflare.com o http://192.168.0.10:3000"
      />
      {resultado ? <Aviso tipo={resultado.ok ? 'exito' : 'error'}>{resultado.texto}</Aviso> : null}
      <Boton
        titulo="Probar y guardar"
        cargando={probando}
        deshabilitado={!url.trim()}
        onPress={async () => {
          setProbando(true);
          setResultado(null);
          const ok = await probarServidor(url);
          if (ok) {
            const guardada = await guardarServidor(url);
            setActual(guardada);
            setUrl(guardada);
            setResultado({ ok: true, texto: 'Conectado. Ya podés iniciar sesión.' });
          } else {
            setResultado({ ok: false, texto: 'No responde un servidor de ScoutTracker en esa dirección. Revisá la URL y que el celular esté en la misma red o que el túnel esté abierto.' });
          }
          setProbando(false);
        }}
      />
      <Boton titulo="Cerrar" variante="texto" onPress={() => setAbierto(false)} />
    </Tarjeta>
  );
}
