import { useState } from 'react';
import { Platform } from 'react-native';
import { CANALES_AVISO, NOMBRE_CANAL, NOMBRE_TIPO_AVISO, TIPOS_AVISO, type CanalAviso, type PreferenciasAvisos, type TipoAviso } from '@scouttracker/shared';
import { api, mensajeDeError } from '../lib/api';
import { useCarga } from '../lib/carga';
import { registrarDispositivo, type EstadoNotificaciones } from '../lib/notificaciones';
import { Aviso, Boton, Cargando, Interruptor, Pantalla, Parrafo, Subtitulo, Tarjeta } from '../ui/componentes';

const AYUDA: Record<TipoAviso, string> = {
  actividades: 'Recordatorios programados de actividades y avisos de cambios o cancelaciones',
  cumpleanios: 'El día del cumpleaños de cada protagonista de tu rama, a las 9:00',
  manuales: 'Avisos que manda el admin del grupo. Los marcados "importante" llegan igual.',
};

const ESTADO: Record<EstadoNotificaciones, string> = {
  activas: 'Las notificaciones están activas en este celular.',
  sinPermiso: 'El celular no tiene permiso para mostrar notificaciones de ScoutTracker. Habilitalo en los ajustes del celular.',
  noDisponible: 'Esta versión de la app no puede recibir notificaciones (versión web o compilada sin el proyecto de EAS).',
};

/** RF-084: el usuario elige qué avisos recibe por notificación y por mail. */
export default function PreferenciasDeAvisos() {
  const { datos, error, recargar } = useCarga<PreferenciasAvisos>('/yo/avisos');
  const [estado, setEstado] = useState<EstadoNotificaciones | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  if (error && !datos) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!datos) return <Cargando />;

  const cambiar = async (tipo: TipoAviso, canal: CanalAviso, activo: boolean) => {
    setMensaje(null);
    setOcupado(`${tipo}:${canal}`);
    try {
      await api.put('/yo/avisos', { tipo, canal, activo });
      await recargar();
    } catch (e) {
      setMensaje(mensajeDeError(e));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Pantalla>
      {mensaje ? <Aviso tipo="error">{mensaje}</Aviso> : null}
      <Tarjeta>
        <Subtitulo>Notificaciones en este celular</Subtitulo>
        {estado ? <Aviso tipo={estado === 'activas' ? 'exito' : 'aviso'}>{ESTADO[estado]}</Aviso> : null}
        <Boton
          titulo={Platform.OS === 'web' ? 'No disponible en la versión web' : 'Activar o revisar notificaciones'}
          variante="secundario"
          deshabilitado={Platform.OS === 'web'}
          cargando={ocupado === 'registro'}
          onPress={async () => {
            setOcupado('registro');
            try {
              setEstado(await registrarDispositivo(true));
            } catch (e) {
              setMensaje(mensajeDeError(e));
            } finally {
              setOcupado(null);
            }
          }}
        />
      </Tarjeta>
      {TIPOS_AVISO.map((t) => (
        <Tarjeta key={t}>
          <Subtitulo>{NOMBRE_TIPO_AVISO[t]}</Subtitulo>
          <Parrafo suave>{AYUDA[t]}</Parrafo>
          {CANALES_AVISO.map((c) => (
            <Interruptor key={c} etiqueta={NOMBRE_CANAL[c]} valor={datos[t][c]} alCambiar={(v) => void cambiar(t, c, v)} deshabilitado={ocupado === `${t}:${c}`} />
          ))}
        </Tarjeta>
      ))}
    </Pantalla>
  );
}
