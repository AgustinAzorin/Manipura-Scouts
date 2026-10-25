import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { formatearFecha, hoyAR, interpretarFecha, NOMBRE_AUTORIZACION_ACTIVIDAD, tienePermiso } from '@scouttracker/shared';
import { api, mensajeDeError } from '../../../lib/api';
import { nombreInscripto, useActividad } from '../../../lib/actividades';
import { useDatos } from '../../../lib/datos';
import { useSesion } from '../../../lib/sesion';
import { elegirArchivo, sacarFoto, subir, type ArchivoElegido } from '../../../lib/subidas';
import { Aviso, Boton, Campo, Cargando, confirmar, Dato, Pantalla, Tarjeta } from '../../../ui/componentes';

/**
 * RF-059: estado, fecha y archivo de la autorización de un inscripto. El estado y la fecha se
 * registran sin conexión; el archivo se adjunta y se abre solo con conexión.
 */
export default function AutorizacionActividad() {
  const { id, ficha } = useLocalSearchParams<{ id: string; ficha: string }>();
  const { contexto } = useSesion();
  const { sinConexion, registrar, recargar } = useDatos();
  const { actividad } = useActividad(id);
  const [fecha, setFecha] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const i = actividad?.inscripciones.find((x) => x.fichaId === ficha);
  if (!actividad || !i?.autorizacion || !contexto) return <Cargando />;
  const a = i.autorizacion;
  const puedeEditar = tienePermiso(contexto.permisos, 'actividades', 'editar') && !actividad.canceladaEn;
  const fechaTexto = fecha ?? (a.fecha ? formatearFecha(a.fecha) : formatearFecha(hoyAR()));

  const hacer = async (nombre: string, fn: () => Promise<string | void>) => {
    setMensaje(null);
    setOcupado(nombre);
    try {
      const texto = await fn();
      if (texto) setMensaje({ tipo: 'exito', texto });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error && !('estado' in e) ? e.message : mensajeDeError(e) });
    } finally {
      setOcupado(null);
    }
  };

  const guardar = (estado: 'presentada' | 'noPresentada') =>
    hacer('estado', async () => {
      const f = estado === 'presentada' ? interpretarFecha(fechaTexto, hoyAR()) : null;
      if (estado === 'presentada' && !f) throw new Error('Indicá la fecha de entrega (dd/mm/aaaa)');
      registrar({ actividadId: actividad.id, fichaId: i.fichaId, campo: 'autorizacion', valor: estado, anterior: a.estado, fecha: f });
      setFecha(null);
      return sinConexion ? 'Guardado en el celular: se envía cuando vuelva la señal' : 'Guardado';
    });

  const adjuntar = (origen: 'archivo' | 'camara') =>
    hacer(origen, async () => {
      const archivo: ArchivoElegido | null = origen === 'archivo' ? await elegirArchivo() : await sacarFoto();
      if (!archivo) return;
      if (a.archivo && !(await confirmar('Reemplazar archivo', `El archivo "${a.archivo.nombre}" se borra y se reemplaza por el nuevo.`, 'Reemplazar'))) return;
      await subir(`/actividades/${actividad.id}/inscripciones/${i.fichaId}/autorizacion/archivo`, archivo);
      await recargar();
      return 'Archivo adjuntado';
    });

  return (
    <Pantalla>
      <Stack.Screen options={{ title: `Autorización: ${nombreInscripto(i)}` }} />
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Tarjeta>
        <Dato etiqueta="Estado" valor={`${NOMBRE_AUTORIZACION_ACTIVIDAD[a.estado]}${a.fecha ? ` · ${formatearFecha(a.fecha)}` : ''}`} />
        {puedeEditar ? (
          <>
            <Campo etiqueta="Fecha de entrega" placeholder="dd/mm/aaaa" value={fechaTexto} onChangeText={setFecha} keyboardType="numbers-and-punctuation" />
            <Boton titulo="Marcar presentada" onPress={() => void guardar('presentada')} cargando={ocupado === 'estado'} />
            {a.estado === 'presentada' ? <Boton titulo="Marcar no presentada" variante="secundario" onPress={() => void guardar('noPresentada')} /> : null}
          </>
        ) : null}
      </Tarjeta>
      <Tarjeta>
        {sinConexion ? <Aviso tipo="aviso">Sin conexión: el archivo se adjunta y se abre solo con conexión.</Aviso> : null}
        <Dato etiqueta="Archivo" valor={a.archivo ? `${a.archivo.nombre} (${Math.ceil(a.archivo.tamano / 1024)} KB)` : 'Sin archivo (es opcional)'} />
        {a.archivo ? (
          <Boton
            titulo="Ver archivo"
            variante="secundario"
            deshabilitado={sinConexion}
            cargando={ocupado === 'ver'}
            onPress={() =>
              hacer('ver', async () => {
                // RNF-022: enlace temporal de 10 minutos.
                const { url } = await api.get<{ url: string }>(`/actividades/${actividad.id}/inscripciones/${i.fichaId}/autorizacion/enlace`);
                await WebBrowser.openBrowserAsync(url);
              })
            }
          />
        ) : null}
        {puedeEditar ? (
          <>
            <Boton titulo="Adjuntar PDF o imagen" onPress={() => void adjuntar('archivo')} cargando={ocupado === 'archivo'} deshabilitado={sinConexion} />
            <Boton titulo="Sacar foto de la autorización" variante="secundario" onPress={() => void adjuntar('camara')} cargando={ocupado === 'camara'} deshabilitado={sinConexion} />
            {a.archivo ? (
              <Boton
                titulo="Quitar archivo"
                variante="texto"
                deshabilitado={sinConexion}
                onPress={async () => {
                  if (await confirmar('Quitar archivo', 'El archivo se borra del almacenamiento.', 'Quitar')) {
                    await hacer('quitar', async () => {
                      await api.delete(`/actividades/${actividad.id}/inscripciones/${i.fichaId}/autorizacion/archivo`);
                      await recargar();
                      return 'Archivo quitado';
                    });
                  }
                }}
              />
            ) : null}
          </>
        ) : null}
      </Tarjeta>
    </Pantalla>
  );
}
