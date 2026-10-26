import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { tienePermiso } from '@scouttracker/shared';
import { useDatos } from '../lib/datos';
import { useAnexosPendientes } from '../lib/fichaActividad';
import { useSesion } from '../lib/sesion';
import { confirmar } from './componentes';

export interface ItemNavegacion {
  titulo: string;
  detalle?: string;
  ruta: Href & string;
  /** Pantallas que se abren desde esta y la dejan marcada en la barra lateral. */
  tambien?: string[];
  /** Inicio y nómina: el menú vuelve a ellas en vez de apilarlas. */
  principal?: boolean;
  /** Cantidad que se destaca en la barra lateral (fichas incompletas, anexos pendientes). */
  contador?: number;
}

export interface SeccionNavegacion {
  titulo: string;
  items: ItemNavegacion[];
}

/** Secciones del menú según los permisos del contexto: las usan el menú del celular y la barra lateral de la web. */
export function useSeccionesNavegacion(): SeccionNavegacion[] {
  const { yo, contexto } = useSesion();
  const { snapshot } = useDatos();
  const { anexos } = useAnexosPendientes();
  if (!yo) return [];
  const p = contexto?.permisos;
  const incompletas = snapshot?.fichas.filter((f) => f.estado === 'incompleta').length ?? 0;
  const administra = yo.usuario.esAdminPlataforma || yo.gruposAdministrables.length > 0 || yo.ramasAdministrables.length > 0;
  const secciones: SeccionNavegacion[] = [];

  const padron: ItemNavegacion[] = [
    { titulo: 'Inicio', detalle: 'Resumen de la rama y pendientes', ruta: '/inicio', tambien: ['/pendientes'], principal: true },
    { titulo: 'Nómina', ruta: '/nomina', tambien: ['/ficha'], principal: true },
  ];
  if (p && tienePermiso(p, 'graficos', 'ver')) {
    padron.push({ titulo: 'Gráficos', detalle: 'Edades, promesas, TADA, equipos y más (funciona sin conexión)', ruta: '/graficos' });
  }
  padron.push(
    { titulo: 'Fichas a completar', detalle: incompletas ? `${incompletas} incompletas` : 'Ninguna', ruta: '/incompletas', contador: incompletas },
    { titulo: 'Ex integrantes', detalle: 'Fichas archivadas (requiere conexión)', ruta: '/ex-integrantes' },
  );
  if (yo.contextos.length > 1) padron.push({ titulo: 'Cambiar de rama o grupo', ruta: '/contexto' });
  secciones.push({ titulo: 'Padrón', items: padron });

  if (p && (tienePermiso(p, 'actividades', 'ver') || tienePermiso(p, 'calendario', 'ver'))) {
    const actividades: ItemNavegacion[] = [];
    if (tienePermiso(p, 'actividades', 'ver')) {
      actividades.push({
        titulo: 'Actividades',
        detalle: 'Confirmaciones, asistencia y autorizaciones (funciona sin conexión)',
        ruta: '/actividades',
        tambien: ['/actividad', '/actividades-anteriores', '/ficha-actividad'],
      });
    }
    if (tienePermiso(p, 'calendario', 'ver')) {
      actividades.push({ titulo: 'Calendario', detalle: 'Actividades, cumpleaños, feriados y tus recordatorios', ruta: '/calendario' });
    }
    actividades.push({
      titulo: 'Mis anexos pendientes',
      detalle: anexos.length ? `${anexos.length} para completar (requiere conexión)` : 'Ninguno (requiere conexión)',
      ruta: '/anexos-pendientes',
      contador: anexos.length,
    });
    secciones.push({ titulo: 'Actividades', items: actividades });
  }

  secciones.push({ titulo: 'Cuenta', items: [{ titulo: 'Avisos', detalle: 'Qué avisos recibís por notificación y por mail', ruta: '/avisos' }] });
  if (administra) {
    secciones.push({
      titulo: 'Administración',
      items: [{ titulo: 'Administración', detalle: 'Grupos, usuarios, roles, ramas, equipos, catálogos e importación', ruta: '/admin' }],
    });
  }
  return secciones;
}

/** La ruta actual corresponde a ese ítem (o a una pantalla que se abre desde él). */
export function itemActivo(item: ItemNavegacion, ruta: string): boolean {
  return [item.ruta, ...(item.tambien ?? [])].some((r) => ruta === r || ruta.startsWith(`${r}/`));
}

/** Cierra la sesión después de confirmar, avisando si quedan registros sin enviar. */
export function useCerrarSesion(): () => Promise<void> {
  const { cerrarSesion } = useSesion();
  const { pendientes } = useDatos();
  const router = useRouter();
  return useCallback(async () => {
    const sinEnviar = pendientes.length
      ? ` Hay ${pendientes.length === 1 ? '1 registro' : `${pendientes.length} registros`} de asistencia o autorización sin enviar: se pierden.`
      : '';
    if (await confirmar('Cerrar sesión', `Se borran de este dispositivo los datos guardados para usar sin conexión.${sinEnviar}`, 'Cerrar sesión')) {
      await cerrarSesion();
      router.replace('/login');
    }
  }, [pendientes.length, cerrarSesion, router]);
}
