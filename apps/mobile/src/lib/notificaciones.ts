import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { api } from './api';

// Con la app abierta, el aviso también se muestra.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export type EstadoNotificaciones = 'activas' | 'sinPermiso' | 'noDisponible';

/** Id del proyecto de EAS: lo exige el servicio de push de Expo. Se define con EAS_PROJECT_ID al compilar. */
const idProyecto = (): string | undefined =>
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

/**
 * RF-080: pide permiso y registra el celular en el servidor para recibir avisos. El registro queda
 * atado a la sesión: al cerrarla, el celular deja de recibirlos.
 */
export async function registrarDispositivo(pedirPermiso: boolean): Promise<EstadoNotificaciones> {
  const projectId = idProyecto();
  if (Platform.OS === 'web' || !projectId) return 'noDisponible';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('avisos', { name: 'Avisos', importance: AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && pedirPermiso) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'sinPermiso';
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.post('/dispositivos', { token, plataforma: Platform.OS === 'ios' ? 'ios' : 'android' });
  return 'activas';
}

/** Registra el celular al iniciar sesión y abre la pantalla del aviso que se tocó (RF-081). */
export function useAvisos(token: string | null) {
  const router = useRouter();
  const abierta = useRef<string | null>(null);

  useEffect(() => {
    if (token) void registrarDispositivo(true).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || Platform.OS === 'web') return;
    const abrir = (r: Notifications.NotificationResponse | null) => {
      const id = r?.notification.request.identifier;
      const ruta = (r?.notification.request.content.data as { ruta?: unknown } | undefined)?.ruta;
      if (!id || abierta.current === id || typeof ruta !== 'string' || !ruta.startsWith('/')) return;
      abierta.current = id;
      router.push(ruta as never);
    };
    // La app pudo haberse abierto tocando el aviso, antes de que existiera el listener.
    void Notifications.getLastNotificationResponseAsync().then(abrir);
    const sub = Notifications.addNotificationResponseReceivedListener(abrir);
    return () => sub.remove();
  }, [token, router]);
}
