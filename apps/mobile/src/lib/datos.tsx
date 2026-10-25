import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { indexarRama, type FichaDTO, type IndiceRama, type SnapshotRama } from '@scouttracker/shared';
import { api, esGrupoDesactivado, esSinPermiso, mensajeDeError, SinConexion } from './api';
import { almacenDatos, useSesion } from './sesion';

/** RNF-019: sin sincronizar durante 7 días, los datos guardados se borran. */
export const DIAS_MAXIMOS_SIN_SINCRONIZAR = 7;

interface ValorDatos {
  snapshot: SnapshotRama | null;
  indice: IndiceRama | null;
  cargando: boolean;
  /** La última sincronización falló por falta de conexión: se muestran los datos guardados. */
  sinConexion: boolean;
  error: string | null;
  recargar(): Promise<void>;
  /** Actualiza una ficha en memoria y en el almacenamiento tras guardarla en el servidor. */
  actualizarFicha(f: FichaDTO): void;
  quitarFicha(id: string): void;
}

/** Estado de una rama: se guarda con su id para descartar lo que llegue de otra rama. */
interface EstadoRama {
  ramaId: string;
  snapshot: SnapshotRama | null;
  sinConexion: boolean;
  error: string | null;
}

const Ctx = createContext<ValorDatos | null>(null);
const clave = (ramaId: string) => `snapshot:${ramaId}`;

export function vencido(snapshot: SnapshotRama, ahora = Date.now()): boolean {
  return ahora - new Date(snapshot.generadoEn).getTime() > DIAS_MAXIMOS_SIN_SINCRONIZAR * 24 * 60 * 60 * 1000;
}

/**
 * Sincroniza la rama con el servidor. Sin conexión devuelve lo guardado (si no venció);
 * si el usuario perdió el acceso, borra lo guardado (RF-002, RF-014).
 */
async function sincronizar(ramaId: string, alPerderAcceso: () => Promise<void>): Promise<Omit<EstadoRama, 'ramaId'>> {
  try {
    const s = await api.get<SnapshotRama>(`/ramas/${ramaId}/snapshot`);
    await almacenDatos.guardar(clave(ramaId), s);
    return { snapshot: s, sinConexion: false, error: null };
  } catch (e) {
    const guardado = await almacenDatos.leer<SnapshotRama>(clave(ramaId));
    if (e instanceof SinConexion) {
      if (guardado && vencido(guardado)) {
        await almacenDatos.borrar(clave(ramaId));
        return {
          snapshot: null,
          sinConexion: true,
          error: `Los datos guardados se borraron porque pasaron más de ${DIAS_MAXIMOS_SIN_SINCRONIZAR} días sin sincronizar. Conectate para volver a descargarlos.`,
        };
      }
      return { snapshot: guardado, sinConexion: true, error: null };
    }
    if (esGrupoDesactivado(e) || esSinPermiso(e)) {
      await almacenDatos.borrar(clave(ramaId));
      await alPerderAcceso().catch(() => {});
      return { snapshot: null, sinConexion: false, error: 'Ya no tenés acceso a esta rama.' };
    }
    return { snapshot: guardado, sinConexion: false, error: mensajeDeError(e) };
  }
}

/** RF-054 a RF-056: nómina de la rama elegida, con copia cifrada para consultar sin conexión. */
export function DatosProvider({ children }: { children: ReactNode }) {
  const { contexto, refrescarYo } = useSesion();
  const ramaId = contexto?.ramaId ?? null;
  const [estado, setEstado] = useState<EstadoRama | null>(null);
  const [cargando, setCargando] = useState(false);
  const actual = estado && estado.ramaId === ramaId ? estado : null;

  useEffect(() => {
    if (!ramaId) return;
    let vigente = true;
    void (async () => {
      // Primero lo guardado, para mostrar algo enseguida aun sin señal.
      const guardado = await almacenDatos.leer<SnapshotRama>(clave(ramaId));
      if (guardado && vencido(guardado)) await almacenDatos.borrar(clave(ramaId));
      else if (guardado && vigente) setEstado({ ramaId, snapshot: guardado, sinConexion: false, error: null });
      const r = await sincronizar(ramaId, refrescarYo);
      if (vigente) setEstado({ ramaId, ...r });
    })();
    return () => {
      vigente = false;
    };
  }, [ramaId, refrescarYo]);

  const recargar = useCallback(async () => {
    if (!ramaId) return;
    setCargando(true);
    try {
      const r = await sincronizar(ramaId, refrescarYo);
      setEstado((e) => (!e || e.ramaId === ramaId ? { ramaId, ...r } : e));
    } finally {
      setCargando(false);
    }
  }, [ramaId, refrescarYo]);

  const guardarLocal = useCallback((cambiar: (s: SnapshotRama) => SnapshotRama) => {
    setEstado((e) => {
      if (!e?.snapshot) return e;
      const nuevo = cambiar(e.snapshot);
      void almacenDatos.guardar(clave(e.ramaId), nuevo);
      return { ...e, snapshot: nuevo };
    });
  }, []);

  // Estables entre renders: las pantallas los usan como dependencias de efectos.
  const actualizarFicha = useCallback(
    (f: FichaDTO) =>
      guardarLocal((s) => {
        if (f.ramaId !== s.rama.id || (f.estado !== 'activa' && f.estado !== 'incompleta')) {
          return { ...s, fichas: s.fichas.filter((x) => x.id !== f.id) };
        }
        const existe = s.fichas.some((x) => x.id === f.id);
        return { ...s, fichas: existe ? s.fichas.map((x) => (x.id === f.id ? f : x)) : [...s.fichas, f] };
      }),
    [guardarLocal],
  );
  const quitarFicha = useCallback((id: string) => guardarLocal((s) => ({ ...s, fichas: s.fichas.filter((x) => x.id !== id) })), [guardarLocal]);

  const snapshot = actual?.snapshot ?? null;
  const indice = useMemo(() => (snapshot ? indexarRama(snapshot.rama) : null), [snapshot]);
  const sinConexion = actual?.sinConexion ?? false;
  const error = actual?.error ?? null;
  const valor = useMemo<ValorDatos>(
    () => ({ snapshot, indice, cargando, sinConexion, error, recargar, actualizarFicha, quitarFicha }),
    [snapshot, indice, cargando, sinConexion, error, recargar, actualizarFicha, quitarFicha],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useDatos(): ValorDatos {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDatos fuera de DatosProvider');
  return v;
}
