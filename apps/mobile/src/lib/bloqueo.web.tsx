import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Aviso, Boton, Campo, Parrafo, Titulo } from '../ui/componentes';
import { ANCHO_ANGOSTO } from '../ui/escritorio';
import { colores, espacio } from '../ui/tema';
import { urlApi } from './api';
import { useSesion } from './sesion';

/**
 * RNF-016 en la versión web: la compu no tiene huella ni PIN para pedir, así que tras 5 minutos sin
 * usar la página se tapa la pantalla y se pide la contraseña de ScoutTracker. La pantalla de abajo
 * queda montada para no perder lo que se estaba escribiendo. Al recargar la pestaña no se bloquea:
 * la sesión solo dura lo que la pestaña (almacen.web.ts).
 */
export const MINUTOS_SIN_USO = 5;
const LIMITE_MS = MINUTOS_SIN_USO * 60 * 1000;
const EVENTOS_DE_USO = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

const Ctx = createContext<{ registrarUso(): void }>({ registrarUso() {} });
export const useBloqueo = () => useContext(Ctx);

/**
 * Comprueba la contraseña con un inicio de sesión aparte, que se cierra enseguida: la sesión abierta
 * no cambia. Va sin el token actual para que un 401 por contraseña incorrecta no cierre la sesión.
 */
async function verificarContrasena(email: string, password: string): Promise<string | null> {
  let r: Response;
  try {
    r = await fetch(`${urlApi()}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  } catch {
    return 'No hay conexión con el servidor. Revisá la red e intentá de nuevo.';
  }
  const datos = (await r.json().catch(() => null)) as { token?: string; mensaje?: string } | null;
  if (!r.ok || !datos?.token) return datos?.mensaje ?? `Error ${r.status}`;
  await fetch(`${urlApi()}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${datos.token}`, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  return null;
}

export function BloqueoProvider({ activo, children }: { activo: boolean; children: ReactNode }) {
  const { yo, cerrarSesion } = useSesion();
  const [bloqueado, setBloqueado] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const ultimoUso = useRef(0);

  const registrarUso = useCallback(() => {
    ultimoUso.current = Date.now();
  }, []);

  useEffect(() => {
    if (!activo) return;
    ultimoUso.current = Date.now();
    const revisar = () => {
      if (Date.now() - ultimoUso.current > LIMITE_MS) setBloqueado(true);
    };
    for (const ev of EVENTOS_DE_USO) window.addEventListener(ev, registrarUso, { passive: true });
    document.addEventListener('visibilitychange', revisar);
    const intervalo = setInterval(revisar, 15_000);
    return () => {
      for (const ev of EVENTOS_DE_USO) window.removeEventListener(ev, registrarUso);
      document.removeEventListener('visibilitychange', revisar);
      clearInterval(intervalo);
    };
  }, [activo, registrarUso]);

  const desbloquear = async () => {
    if (!yo || !password) return setError('Escribí tu contraseña');
    setVerificando(true);
    const fallo = await verificarContrasena(yo.usuario.email, password);
    setVerificando(false);
    if (fallo) return setError(fallo);
    setPassword('');
    setError(null);
    ultimoUso.current = Date.now();
    setBloqueado(false);
  };

  const mostrarBloqueo = activo && bloqueado;
  return (
    <Ctx.Provider value={{ registrarUso }}>
      <View style={{ flex: 1 }} aria-hidden={mostrarBloqueo || undefined}>
        {children}
      </View>
      {mostrarBloqueo ? (
        <View style={e.tapa} role="dialog" aria-modal aria-label="ScoutTracker está bloqueado">
          <View style={e.caja}>
            <Titulo>ScoutTracker está bloqueado</Titulo>
            <Parrafo>
              Pasaron {MINUTOS_SIN_USO} minutos sin uso. Para volver a ver los datos de los protagonistas escribí la contraseña de {yo?.usuario.email ?? 'tu cuenta'}.
            </Parrafo>
            {error ? <Aviso tipo="error">{error}</Aviso> : null}
            <Campo etiqueta="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" autoFocus onSubmitEditing={() => void desbloquear()} />
            <Boton titulo="Desbloquear" onPress={() => void desbloquear()} cargando={verificando} />
            <Boton titulo="Cerrar sesión" variante="texto" onPress={() => void cerrarSesion()} />
          </View>
        </View>
      ) : null}
    </Ctx.Provider>
  );
}

const e = StyleSheet.create({
  tapa: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, backgroundColor: colores.fondo, alignItems: 'center', justifyContent: 'center', padding: espacio.xl },
  caja: { width: '100%', maxWidth: ANCHO_ANGOSTO, gap: espacio.l },
});
