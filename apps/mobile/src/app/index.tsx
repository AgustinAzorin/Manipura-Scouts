import { Redirect, useRouter } from 'expo-router';
import { useSesion } from '../lib/sesion';
import { Aviso, Boton, Cargando, Pantalla, Parrafo, Titulo } from '../ui/componentes';

/** Decide adónde entra el usuario (RF-021). */
export default function Inicio() {
  const { estado, yo, contexto, cerrarSesion } = useSesion();
  const router = useRouter();
  if (estado.tipo === 'cargando') return <Cargando />;
  if (estado.tipo === 'sinSesion' || !yo) return <Redirect href="/login" />;
  if (contexto) return <Redirect href="/inicio" />;
  if (yo.contextos.length > 1) return <Redirect href="/contexto" />;
  const administra = yo.usuario.esAdminPlataforma || yo.gruposAdministrables.length > 0;
  return (
    <Pantalla>
      <Titulo>Hola, {yo.usuario.nombre}</Titulo>
      <Aviso tipo="info">
        {administra
          ? 'Todavía no tenés acceso a ninguna rama. Desde Administración podés crear ramas y asignar roles.'
          : 'Todavía no tenés acceso a ninguna rama. Pedile al admin de tu grupo que te asigne un rol.'}
      </Aviso>
      {administra ? <Boton titulo="Administración" onPress={() => router.push('/admin')} /> : null}
      <Parrafo suave>Si te acaban de dar acceso, cerrá sesión y volvé a entrar.</Parrafo>
      <Boton titulo="Cerrar sesión" variante="secundario" onPress={cerrarSesion} />
    </Pantalla>
  );
}
