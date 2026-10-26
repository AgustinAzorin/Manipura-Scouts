import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { BloqueoProvider } from '../lib/bloqueo';
import { DatosProvider } from '../lib/datos';
import { useAvisos } from '../lib/notificaciones';
import { SesionProvider, useSesion } from '../lib/sesion';
import { BarraLateral } from '../ui/barra-lateral';
import { useEscritorio } from '../ui/escritorio';
import { colores } from '../ui/tema';

const RUTAS_PUBLICAS = ['/login', '/recuperar'];

function Raiz() {
  const { estado } = useSesion();
  const ruta = usePathname();
  const router = useRouter();
  // En la web con pantalla ancha, el menú queda fijo a la izquierda.
  const conBarra = useEscritorio() && estado.tipo === 'conSesion' && !RUTAS_PUBLICAS.includes(ruta);
  useAvisos(estado.tipo === 'conSesion' ? estado.token : null);

  useEffect(() => {
    if (estado.tipo === 'sinSesion' && !RUTAS_PUBLICAS.includes(ruta)) router.replace('/login');
  }, [estado.tipo, ruta, router]);

  return (
    <BloqueoProvider key={estado.tipo === 'conSesion' ? estado.token : 'sin-sesion'} activo={estado.tipo === 'conSesion'}>
      <DatosProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {conBarra ? <BarraLateral /> : null}
          <View style={{ flex: 1 }}>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colores.primario },
                headerTintColor: colores.primarioTexto,
                headerTitleStyle: { fontWeight: '700' },
                headerBackTitle: 'Volver',
                contentStyle: { backgroundColor: colores.fondo },
              }}
            >
              <Stack.Screen name="index" options={{ title: 'ScoutTracker' }} />
              <Stack.Screen name="login" options={{ title: 'Iniciar sesión', headerBackVisible: false }} />
              <Stack.Screen name="recuperar" options={{ title: 'Recuperar contraseña' }} />
              <Stack.Screen name="contexto" options={{ title: 'Elegí dónde trabajar' }} />
              <Stack.Screen name="inicio" options={{ title: 'Inicio', headerBackVisible: false }} />
              <Stack.Screen name="nomina" options={{ title: 'Nómina' }} />
              <Stack.Screen name="graficos" options={{ title: 'Gráficos' }} />
              <Stack.Screen name="pendientes" options={{ title: 'Pendientes' }} />
              <Stack.Screen name="menu" options={{ title: 'Menú' }} />
              <Stack.Screen name="incompletas" options={{ title: 'Fichas a completar' }} />
              <Stack.Screen name="ex-integrantes" options={{ title: 'Ex integrantes' }} />
              <Stack.Screen name="ficha/nueva" options={{ title: 'Nueva ficha' }} />
              <Stack.Screen name="ficha/[id]/index" options={{ title: 'Ficha' }} />
              <Stack.Screen name="ficha/[id]/editar" options={{ title: 'Editar ficha' }} />
              <Stack.Screen name="ficha/[id]/historial" options={{ title: 'Historial de cambios' }} />
              <Stack.Screen name="ficha/[id]/documento" options={{ title: 'Documento' }} />
              <Stack.Screen name="actividades" options={{ title: 'Actividades' }} />
              <Stack.Screen name="actividades-anteriores" options={{ title: 'Actividades anteriores' }} />
              <Stack.Screen name="actividad/nueva" options={{ title: 'Nueva actividad' }} />
              <Stack.Screen name="actividad/[id]/index" options={{ title: 'Actividad' }} />
              <Stack.Screen name="actividad/[id]/editar" options={{ title: 'Editar actividad' }} />
              <Stack.Screen name="actividad/[id]/inscriptos" options={{ title: 'Inscriptos' }} />
              <Stack.Screen name="actividad/[id]/reporte" options={{ title: 'Reporte de asistencia' }} />
              <Stack.Screen name="actividad/[id]/autorizacion" options={{ title: 'Autorización' }} />
              <Stack.Screen name="actividad/[id]/ficha" options={{ title: 'Ficha de Actividad' }} />
              <Stack.Screen name="ficha-actividad/[id]/index" options={{ title: 'Ficha de Actividad' }} />
              <Stack.Screen name="ficha-actividad/[id]/textos" options={{ title: 'Diagnóstico y objetivos' }} />
              <Stack.Screen name="ficha-actividad/[id]/grilla" options={{ title: 'Programación de actividades' }} />
              <Stack.Screen name="ficha-actividad/[id]/anexo/[anexoId]" options={{ title: 'Anexo' }} />
              <Stack.Screen name="ficha-actividad/[id]/reutilizar" options={{ title: 'Copiar un anexo' }} />
              <Stack.Screen name="anexos-pendientes" options={{ title: 'Mis anexos pendientes' }} />
              <Stack.Screen name="calendario" options={{ title: 'Calendario' }} />
              <Stack.Screen name="avisos" options={{ title: 'Avisos' }} />
              <Stack.Screen name="admin/index" options={{ title: 'Administración' }} />
              <Stack.Screen name="admin/plataforma" options={{ title: 'Grupos' }} />
              <Stack.Screen name="admin/grupo/[grupoId]/usuarios" options={{ title: 'Usuarios' }} />
              <Stack.Screen name="admin/grupo/[grupoId]/usuario/[usuarioId]" options={{ title: 'Usuario' }} />
              <Stack.Screen name="admin/grupo/[grupoId]/roles" options={{ title: 'Roles y permisos' }} />
              <Stack.Screen name="admin/grupo/[grupoId]/rol/[rolId]" options={{ title: 'Rol' }} />
              <Stack.Screen name="admin/grupo/[grupoId]/ramas" options={{ title: 'Ramas' }} />
              <Stack.Screen name="admin/grupo/[grupoId]/tipos-actividad" options={{ title: 'Tipos de actividad' }} />
              <Stack.Screen name="admin/grupo/[grupoId]/feriados" options={{ title: 'Feriados' }} />
              <Stack.Screen name="admin/grupo/[grupoId]/avisos" options={{ title: 'Avisos al grupo' }} />
              <Stack.Screen name="admin/rama/[ramaId]/index" options={{ title: 'Rama' }} />
              <Stack.Screen name="admin/rama/[ramaId]/equipos" options={{ title: 'Equipos' }} />
              <Stack.Screen name="admin/rama/[ramaId]/catalogos" options={{ title: 'Catálogos' }} />
              <Stack.Screen name="admin/rama/[ramaId]/campos" options={{ title: 'Campos de la ficha' }} />
              <Stack.Screen name="admin/rama/[ramaId]/importar" options={{ title: 'Importar planilla' }} />
              <Stack.Screen name="admin/rama/[ramaId]/cabecera" options={{ title: 'Cabecera de la Ficha de Actividad' }} />
            </Stack>
          </View>
        </View>
      </DatosProvider>
    </BloqueoProvider>
  );
}

export default function Layout() {
  return (
    <SesionProvider>
      <Raiz />
    </SesionProvider>
  );
}
