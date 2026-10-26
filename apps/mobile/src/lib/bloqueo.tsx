import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, View } from 'react-native';
import { Aviso, Boton, Parrafo, Titulo } from '../ui/componentes';
import { colores, espacio } from '../ui/tema';
import { consumirLoginReciente } from './loginReciente';

/** RNF-016: se pide el desbloqueo del dispositivo al abrir y tras 5 minutos sin uso. */
export const MINUTOS_SIN_USO = 5;
const LIMITE_MS = MINUTOS_SIN_USO * 60 * 1000;

type ResultadoDesbloqueo = 'ok' | 'sinBloqueo' | 'cancelado' | 'error';

async function pedirDesbloqueo(): Promise<ResultadoDesbloqueo> {
  // Sin huella, rostro ni PIN configurados no hay con qué desbloquear: se avisa y se deja pasar.
  if ((await LocalAuthentication.getEnrolledLevelAsync()) === LocalAuthentication.SecurityLevel.NONE) return 'sinBloqueo';
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Desbloqueá ScoutTracker', cancelLabel: 'Cancelar' });
  if (r.success) return 'ok';
  return r.error === 'user_cancel' || r.error === 'system_cancel' ? 'cancelado' : 'error';
}

const Ctx = createContext<{ registrarUso(): void }>({ registrarUso() {} });
export const useBloqueo = () => useContext(Ctx);

/**
 * Debe montarse con una `key` que cambie con la sesión: al abrir la app con una sesión guardada
 * arranca bloqueado; después de un inicio de sesión, no.
 */
export function BloqueoProvider({ activo, children }: { activo: boolean; children: ReactNode }) {
  // La versión web de desarrollo no tiene biometría.
  const usar = activo && Platform.OS !== 'web';
  const [bloqueado, setBloqueado] = useState(() => !consumirLoginReciente());
  const [sinBloqueoDelEquipo, setSinBloqueoDelEquipo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ultimoUso = useRef(0);

  const registrarUso = useCallback(() => {
    ultimoUso.current = Date.now();
  }, []);

  useEffect(() => {
    if (!usar) return;
    ultimoUso.current = Date.now();
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active' && Date.now() - ultimoUso.current > LIMITE_MS) setBloqueado(true);
    });
    const intervalo = setInterval(() => {
      if (Date.now() - ultimoUso.current > LIMITE_MS) setBloqueado(true);
    }, 15_000);
    return () => {
      sub.remove();
      clearInterval(intervalo);
    };
  }, [usar]);

  const aplicar = useCallback((r: ResultadoDesbloqueo) => {
    if (r === 'sinBloqueo') {
      setSinBloqueoDelEquipo(true);
    } else if (r === 'error') {
      setError('No se pudo verificar tu identidad. Probá de nuevo.');
      return;
    } else if (r === 'cancelado') return;
    ultimoUso.current = Date.now();
    setError(null);
    setBloqueado(false);
  }, []);
  const desbloquear = useCallback(() => void pedirDesbloqueo().then(aplicar), [aplicar]);

  const mostrarBloqueo = usar && bloqueado;
  useEffect(() => {
    if (!mostrarBloqueo) return;
    let vigente = true;
    void pedirDesbloqueo().then((r) => vigente && aplicar(r));
    return () => {
      vigente = false;
    };
  }, [mostrarBloqueo, aplicar]);

  if (mostrarBloqueo) {
    return (
      <View style={{ flex: 1, backgroundColor: colores.fondo, justifyContent: 'center', padding: espacio.xl, gap: espacio.l }}>
        <Titulo>ScoutTracker está bloqueado</Titulo>
        <Parrafo>Para ver los datos de los protagonistas usá la huella, el rostro o el PIN del celular.</Parrafo>
        {error ? <Aviso tipo="error">{error}</Aviso> : null}
        <Boton titulo="Desbloquear" onPress={desbloquear} />
      </View>
    );
  }
  return (
    <Ctx.Provider value={{ registrarUso }}>
      <View style={{ flex: 1 }} onTouchStart={registrarUso}>
        {sinBloqueoDelEquipo ? (
          <View style={{ padding: espacio.s, backgroundColor: colores.avisoSuave }}>
            <Parrafo>Tu celular no tiene bloqueo de pantalla. Configurá un PIN o huella para proteger los datos.</Parrafo>
          </View>
        ) : null}
        {children}
      </View>
    </Ctx.Provider>
  );
}
