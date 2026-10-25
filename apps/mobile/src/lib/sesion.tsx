import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Contexto, RespuestaLogin, RespuestaYo } from '@scouttracker/shared';
import { crearAlmacen } from './almacen';
import { api, configurarApi, ErrorDelServidor, SinConexion } from './api';
import { marcarLoginReciente } from './bloqueo';

/** Datos guardados para uso sin conexión: se borran al cerrar sesión (RF-013). */
export const almacenDatos = crearAlmacen('datos');
/** Preferencias de la nómina por usuario: no son datos de protagonistas y se conservan (RF-030, RF-031). */
export const almacenPreferencias = crearAlmacen('preferencias');

interface Guardado {
  token: string;
  yo: RespuestaYo;
  ramaId: string | null;
}

type Estado = { tipo: 'cargando' } | { tipo: 'sinSesion'; motivo?: string } | { tipo: 'conSesion'; token: string; yo: RespuestaYo; ramaId: string | null };

interface ValorSesion {
  estado: Estado;
  yo: RespuestaYo | null;
  /** Contexto elegido (RF-021). Con una sola asignación se elige solo. */
  contexto: Contexto | null;
  iniciarSesion(email: string, password: string): Promise<void>;
  cerrarSesion(): Promise<void>;
  elegirRama(ramaId: string | null): Promise<void>;
  refrescarYo(): Promise<void>;
}

const Ctx = createContext<ValorSesion | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  // refrescarYo lee el estado por referencia para no cambiar de identidad en cada render.
  const estadoRef = useRef(estado);
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  const borrarTodo = useCallback(async (motivo?: string) => {
    configurarApi({ token: null });
    await almacenDatos.borrarTodo();
    setEstado({ tipo: 'sinSesion', motivo });
  }, []);

  useEffect(() => {
    configurarApi({ token: null, alPerderSesion: () => void borrarTodo('Tu sesión terminó. Volvé a iniciar sesión.') });
    (async () => {
      const g = await almacenDatos.leer<Guardado>('sesion');
      if (!g) return setEstado({ tipo: 'sinSesion' });
      configurarApi({ token: g.token });
      setEstado({ tipo: 'conSesion', token: g.token, yo: g.yo, ramaId: g.ramaId });
    })();
  }, [borrarTodo]);

  const guardar = useCallback(async (g: Guardado) => {
    await almacenDatos.guardar('sesion', g);
    setEstado({ tipo: 'conSesion', ...g });
  }, []);

  const refrescarYo = useCallback(async () => {
    const estado = estadoRef.current;
    if (estado.tipo !== 'conSesion') return;
    try {
      const yo = await api.get<RespuestaYo>('/yo');
      const ramaId = yo.contextos.some((c) => c.ramaId === estado.ramaId) ? estado.ramaId : null;
      // Se borran los datos guardados de las ramas a las que ya no tiene acceso (RF-002, RNF-020).
      for (const c of estado.yo.contextos) {
        if (!yo.contextos.some((n) => n.ramaId === c.ramaId)) await almacenDatos.borrar(`snapshot:${c.ramaId}`);
      }
      await guardar({ token: estado.token, yo, ramaId });
    } catch (e) {
      if (!(e instanceof SinConexion) && !(e instanceof ErrorDelServidor && e.estado === 401)) throw e;
    }
  }, [guardar]);

  // Al abrir la app con conexión se actualizan los permisos y contextos.
  const token = estado.tipo === 'conSesion' ? estado.token : null;
  useEffect(() => {
    if (token) void refrescarYo().catch(() => {});
  }, [token, refrescarYo]);

  const valor = useMemo<ValorSesion>(() => {
    const yo = estado.tipo === 'conSesion' ? estado.yo : null;
    let contexto: Contexto | null = null;
    if (yo && estado.tipo === 'conSesion') {
      contexto = yo.contextos.find((c) => c.ramaId === estado.ramaId) ?? (yo.contextos.length === 1 ? yo.contextos[0]! : null);
    }
    return {
      estado,
      yo,
      contexto,
      async iniciarSesion(email, password) {
        const r = await api.post<RespuestaLogin>('/auth/login', { email, password });
        configurarApi({ token: r.token });
        const yo = await api.get<RespuestaYo>('/yo');
        marcarLoginReciente();
        await guardar({ token: r.token, yo, ramaId: yo.contextos.length === 1 ? yo.contextos[0]!.ramaId : null });
      },
      async cerrarSesion() {
        await api.post('/auth/logout').catch(() => {});
        await borrarTodo();
      },
      async elegirRama(ramaId) {
        if (estado.tipo === 'conSesion') await guardar({ token: estado.token, yo: estado.yo, ramaId });
      },
      refrescarYo,
    };
  }, [estado, guardar, borrarTodo, refrescarYo]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSesion(): ValorSesion {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSesion fuera de SesionProvider');
  return v;
}
