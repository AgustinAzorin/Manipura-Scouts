import * as Network from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import {
  aplicarPendientes,
  encolarRegistro,
  indexarRama,
  type ActividadDTO,
  type FichaDTO,
  type IndiceRama,
  type RegistroActividad,
  type ResultadoRegistro,
  type SnapshotRama,
} from '@scouttracker/shared';
import { api, ErrorDelServidor, esGrupoDesactivado, esSinPermiso, mensajeDeError, SinConexion } from './api';
import { almacenDatos, useSesion } from './sesion';

/** RNF-019: sin sincronizar durante 7 días, los datos guardados se borran. */
export const DIAS_MAXIMOS_SIN_SINCRONIZAR = 7;
/** Con registros pendientes, se reintenta el envío cada 30 segundos (RF-057). */
const REINTENTO_MS = 30_000;

/** Registro nuevo: la cola le pone id y hora del dispositivo. */
export type NuevoRegistro = RegistroActividad extends infer R ? (R extends RegistroActividad ? Omit<R, 'id' | 'en'> : never) : never;

interface ValorDatos {
  snapshot: SnapshotRama | null;
  indice: IndiceRama | null;
  /** Actividades guardadas con los registros pendientes ya aplicados (RF-071). */
  actividades: ActividadDTO[];
  cargando: boolean;
  /** La última sincronización falló por falta de conexión: se muestran los datos guardados. */
  sinConexion: boolean;
  error: string | null;
  recargar(): Promise<void>;
  /** Actualiza una ficha en memoria y en el almacenamiento tras guardarla en el servidor. */
  actualizarFicha(f: FichaDTO): void;
  quitarFicha(id: string): void;
  /** RF-057: registros hechos en el celular que todavía no llegaron al servidor. */
  pendientes: RegistroActividad[];
  /**
   * RF-058 / RF-059: registra asistencia o autorización. Se ve enseguida, queda guardado en el
   * celular y se envía solo cuando hay conexión, aunque la app se cierre antes.
   */
  registrar(r: NuevoRegistro): void;
  /** RF-065: la confirmación requiere conexión (RF-055); se envía en el momento. */
  registrarEnLinea(r: NuevoRegistro): Promise<ResultadoRegistro>;
  /** Registros que el servidor no aceptó en el último envío. */
  rechazados: ResultadoRegistro[];
  descartarRechazados(): void;
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
const CLAVE_PENDIENTES = 'pendientes';

export function vencido(snapshot: SnapshotRama, ahora = Date.now()): boolean {
  return ahora - new Date(snapshot.generadoEn).getTime() > DIAS_MAXIMOS_SIN_SINCRONIZAR * 24 * 60 * 60 * 1000;
}

/** Los datos guardados por una versión anterior de la app no traen actividades, calendario ni avisos. */
const completar = (s: SnapshotRama | null): SnapshotRama | null =>
  s
    ? {
        ...s,
        tiposActividad: s.tiposActividad ?? [],
        actividades: (s.actividades ?? []).map((a) => ({ ...a, avisos: a.avisos ?? [], destinoAvisos: a.destinoAvisos ?? { tipo: 'alcance' } })),
        asistenciaAnio: s.asistenciaAnio ?? {},
        feriados: s.feriados ?? [],
        recordatorios: s.recordatorios ?? [],
        roles: s.roles ?? [],
      }
    : null;

let secuencia = 0;
const idRegistro = () => `${Date.now().toString(36)}-${(++secuencia).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
    const guardado = completar(await almacenDatos.leer<SnapshotRama>(clave(ramaId)));
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

/** RF-054 a RF-057: nómina y actividades de la rama elegida, con copia cifrada para usar sin conexión. */
export function DatosProvider({ children }: { children: ReactNode }) {
  const { contexto, refrescarYo } = useSesion();
  const ramaId = contexto?.ramaId ?? null;
  const [estado, setEstado] = useState<EstadoRama | null>(null);
  const [cargando, setCargando] = useState(false);
  const actual = estado && estado.ramaId === ramaId ? estado : null;

  // ---- Cola de registros pendientes (RF-057). Se guarda cifrada y sobrevive al cierre de la app.
  const [pendientes, setPendientes] = useState<RegistroActividad[]>([]);
  const [colaLista, setColaLista] = useState(false);
  const [rechazados, setRechazados] = useState<ResultadoRegistro[]>([]);
  const colaRef = useRef<RegistroActividad[]>([]);
  const enviando = useRef<Promise<void> | null>(null);

  const guardarCola = useCallback((cola: RegistroActividad[]) => {
    colaRef.current = cola;
    setPendientes(cola);
    void almacenDatos.guardar(CLAVE_PENDIENTES, cola);
  }, []);

  useEffect(() => {
    void almacenDatos.leer<RegistroActividad[]>(CLAVE_PENDIENTES).then((cola) => {
      colaRef.current = cola ?? [];
      setPendientes(colaRef.current);
      setColaLista(true);
    });
  }, []);

  const guardarLocal = useCallback((cambiar: (s: SnapshotRama) => SnapshotRama) => {
    setEstado((e) => {
      if (!e?.snapshot) return e;
      const nuevo = cambiar(e.snapshot);
      void almacenDatos.guardar(clave(e.ramaId), nuevo);
      return { ...e, snapshot: nuevo };
    });
  }, []);

  /**
   * Envía la cola. Lo aplicado pasa a los datos guardados. 'recargar' indica que algo se descartó
   * por un conflicto (RN-08) o se rechazó: hay que volver a descargar la rama para ver el valor del
   * servidor.
   */
  const enviarPendientes = useCallback((): Promise<'nada' | 'enviado' | 'recargar' | 'sinConexion'> => {
    const ejecutar = async (): Promise<'nada' | 'enviado' | 'recargar' | 'sinConexion'> => {
      const lote = colaRef.current;
      if (lote.length === 0) return 'nada';
      let resultados: ResultadoRegistro[];
      try {
        resultados = (await api.post<{ resultados: ResultadoRegistro[] }>('/sincronizar', { registros: lote })).resultados;
      } catch (e) {
        if (e instanceof SinConexion || (e instanceof ErrorDelServidor && (e.estado === 401 || e.estado >= 500))) return 'sinConexion';
        // Un lote que el servidor no acepta nunca se reintentaría: se descarta y se avisa.
        resultados = lote.map((r) => ({ id: r.id, estado: 'rechazado', motivo: mensajeDeError(e) }));
      }
      const porId = new Map(resultados.map((r) => [r.id, r]));
      // Se quitan solo los enviados tal cual: un cambio hecho mientras tanto sigue pendiente.
      const enviados = new Set(lote);
      guardarCola(colaRef.current.filter((r) => !(enviados.has(r) && porId.has(r.id))));
      const aplicados = lote.filter((r) => porId.get(r.id)?.estado === 'aplicado');
      if (aplicados.length) guardarLocal((s) => ({ ...s, actividades: s.actividades.map((a) => aplicarPendientes(a, aplicados)) }));
      const fallidos = resultados.filter((r) => r.estado === 'rechazado');
      if (fallidos.length) setRechazados((x) => [...x, ...fallidos]);
      return resultados.some((r) => r.estado !== 'aplicado') ? 'recargar' : 'enviado';
    };
    // Un solo envío a la vez: si ya hay uno en curso, este sale cuando termine.
    const previo = enviando.current;
    const cadena = previo ? previo.then(ejecutar, ejecutar) : ejecutar();
    const marca = cadena.then(
      () => {},
      () => {},
    );
    enviando.current = marca;
    void marca.then(() => {
      if (enviando.current === marca) enviando.current = null;
    });
    return cadena;
  }, [guardarCola, guardarLocal]);

  const estadoRef = useRef(actual);
  useEffect(() => {
    estadoRef.current = actual;
  }, [actual]);

  useEffect(() => {
    if (!ramaId || !colaLista) return;
    let vigente = true;
    void (async () => {
      // Primero lo guardado, para mostrar algo enseguida aun sin señal.
      const guardado = completar(await almacenDatos.leer<SnapshotRama>(clave(ramaId)));
      if (guardado && vencido(guardado)) await almacenDatos.borrar(clave(ramaId));
      else if (guardado && vigente) setEstado({ ramaId, snapshot: guardado, sinConexion: false, error: null });
      await enviarPendientes();
      const r = await sincronizar(ramaId, refrescarYo);
      if (vigente) setEstado({ ramaId, ...r });
    })();
    return () => {
      vigente = false;
    };
  }, [ramaId, colaLista, refrescarYo, enviarPendientes]);

  const actualizar = useCallback(
    async (mostrarCarga: boolean) => {
      if (!ramaId) return;
      if (mostrarCarga) setCargando(true);
      try {
        await enviarPendientes();
        const r = await sincronizar(ramaId, refrescarYo);
        setEstado((e) => (!e || e.ramaId === ramaId ? { ramaId, ...r } : e));
      } finally {
        if (mostrarCarga) setCargando(false);
      }
    },
    [ramaId, refrescarYo, enviarPendientes],
  );
  const recargar = useCallback(() => actualizar(true), [actualizar]);

  // Envía lo pendiente al volver la señal, al volver a la app y cada 30 s mientras quede algo; si
  // los datos eran de antes de perder la señal, además descarga la rama de nuevo.
  const enviarYRecargar = useCallback(async () => {
    const r = await enviarPendientes();
    // Sin señal: se muestra que los datos son los guardados y la confirmación queda bloqueada (RF-055).
    if (r === 'sinConexion') return setEstado((e) => (e && !e.sinConexion ? { ...e, sinConexion: true } : e));
    if (r === 'recargar' || estadoRef.current?.sinConexion) await actualizar(false);
  }, [enviarPendientes, actualizar]);

  useEffect(() => {
    if (!colaLista) return;
    const red = Network.addNetworkStateListener((s) => {
      if (s.isConnected && s.isInternetReachable !== false) void enviarYRecargar();
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') void enviarYRecargar();
    });
    return () => {
      red.remove();
      app.remove();
    };
  }, [colaLista, enviarYRecargar]);

  const hayPendientes = pendientes.length > 0;
  useEffect(() => {
    if (!hayPendientes) return;
    const t = setInterval(() => void enviarYRecargar(), REINTENTO_MS);
    return () => clearInterval(t);
  }, [hayPendientes, enviarYRecargar]);

  const registrar = useCallback(
    (nuevo: NuevoRegistro) => {
      const r = { ...nuevo, id: idRegistro(), en: new Date().toISOString() } as RegistroActividad;
      guardarCola(encolarRegistro(colaRef.current, r));
      void enviarYRecargar();
    },
    [guardarCola, enviarYRecargar],
  );

  const registrarEnLinea = useCallback(
    async (nuevo: NuevoRegistro) => {
      const r = { ...nuevo, id: idRegistro(), en: new Date().toISOString() } as RegistroActividad;
      const { resultados } = await api.post<{ resultados: ResultadoRegistro[] }>('/sincronizar', { registros: [r] });
      const resultado = resultados[0]!;
      if (resultado.estado === 'aplicado') guardarLocal((s) => ({ ...s, actividades: s.actividades.map((a) => aplicarPendientes(a, [r])) }));
      else await recargar();
      return resultado;
    },
    [guardarLocal, recargar],
  );

  const descartarRechazados = useCallback(() => setRechazados([]), []);

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
  const actividades = useMemo(() => (snapshot ? snapshot.actividades.map((a) => aplicarPendientes(a, pendientes)) : []), [snapshot, pendientes]);
  const indice = useMemo(() => (snapshot ? indexarRama(snapshot.rama, actividades) : null), [snapshot, actividades]);
  const sinConexion = actual?.sinConexion ?? false;
  const error = actual?.error ?? null;
  const valor = useMemo<ValorDatos>(
    () => ({
      snapshot,
      indice,
      actividades,
      cargando,
      sinConexion,
      error,
      recargar,
      actualizarFicha,
      quitarFicha,
      pendientes,
      registrar,
      registrarEnLinea,
      rechazados,
      descartarRechazados,
    }),
    [snapshot, indice, actividades, cargando, sinConexion, error, recargar, actualizarFicha, quitarFicha, pendientes, registrar, registrarEnLinea, rechazados, descartarRechazados],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useDatos(): ValorDatos {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDatos fuera de DatosProvider');
  return v;
}
