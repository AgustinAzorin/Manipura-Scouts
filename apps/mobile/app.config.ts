import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Variantes de la app según APP_VARIANT (lo define cada perfil de eas.json):
 * - development: build de desarrollo (expo-dev-client) que carga el JS desde la compu.
 * - preview: APK de prueba para instalar en celulares.
 * - production: versión para TestFlight y Google Play.
 *
 * Las variantes de prueba tienen otro identificador para convivir con la de producción en el
 * mismo celular, permiten elegir el servidor en la pantalla de inicio de sesión y aceptan
 * HTTP sin cifrar (para un servidor en la red local). La de producción exige HTTPS (RI-013).
 */
const VARIANTE = process.env.APP_VARIANT ?? 'development';
const PRODUCCION = VARIANTE === 'production';
const SUFIJO = PRODUCCION ? '' : `.${VARIANTE === 'preview' ? 'prueba' : 'dev'}`;
const NOMBRE = PRODUCCION ? 'ScoutTracker' : VARIANTE === 'preview' ? 'ScoutTracker Prueba' : 'ScoutTracker Dev';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: NOMBRE,
  slug: config.slug ?? 'scouttracker',
  ios: { ...config.ios, bundleIdentifier: `ar.scouttracker.app${SUFIJO}` },
  android: { ...config.android, package: `ar.scouttracker.app${SUFIJO}` },
  plugins: [...(config.plugins ?? []), ['expo-build-properties', { android: { usesCleartextTraffic: !PRODUCCION } }]],
  extra: {
    ...config.extra,
    variante: VARIANTE,
    permitirCambiarServidor: !PRODUCCION,
  },
});
