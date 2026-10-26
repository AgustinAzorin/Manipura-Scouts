import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import {
  DEF_DOCUMENTO,
  formatearFecha,
  hoyAR,
  interpretarFecha,
  NOMBRE_ESTADO_DOCUMENTO,
  tienePermiso,
  type TipoDocumento,
} from '@scouttracker/shared';
import { api, mensajeDeError } from '../../../lib/api';
import { useFicha } from '../../../lib/fichas';
import { useSesion } from '../../../lib/sesion';
import { elegirArchivo, sacarFoto, subir, type ArchivoElegido } from '../../../lib/subidas';
import { Aviso, Boton, Campo, Cargando, confirmar, Dato, Pantalla, Selector, Tarjeta } from '../../../ui/componentes';
import { useEscritorio } from '../../../ui/escritorio';

/** RF-040 a RF-042: estado, fecha de entrega y archivo de un documento. */
export default function Documento() {
  const { id, tipo } = useLocalSearchParams<{ id: string; tipo: TipoDocumento }>();
  const { contexto } = useSesion();
  const { ficha, recargar, sinConexion } = useFicha(id);
  const doc = ficha?.documentos?.find((d) => d.tipo === tipo);
  const [estado, setEstado] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // En la compu "sacar foto" solo abre el selector de archivos: alcanza con el botón de adjuntar.
  const conCamara = !useEscritorio();
  if (!ficha || !doc || !contexto) return <Cargando />;
  const def = DEF_DOCUMENTO[doc.tipo];
  const puedeEditar = tienePermiso(contexto.permisos, 'documentos', 'editar') && !sinConexion && (ficha.estado === 'activa' || ficha.estado === 'incompleta');
  const estadoElegido = estado ?? doc.estado;
  const fechaTexto = fecha ?? (doc.fechaEntrega ? formatearFecha(doc.fechaEntrega) : '');

  const hacer = async (nombre: string, fn: () => Promise<string | void>) => {
    setMensaje(null);
    setOcupado(nombre);
    try {
      const texto = await fn();
      if (texto) setMensaje({ tipo: 'exito', texto });
      await recargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error && !('estado' in e) ? e.message : mensajeDeError(e) });
    } finally {
      setOcupado(null);
    }
  };

  const guardarEstado = () =>
    hacer('estado', async () => {
      const f = estadoElegido === 'noPresentado' ? null : interpretarFecha(fechaTexto, hoyAR());
      if (estadoElegido !== 'noPresentado' && !f) throw new Error('Indicá la fecha de entrega (dd/mm/aaaa)');
      await api.put(`/fichas/${ficha.id}/documentos/${doc.tipo}`, { estado: estadoElegido, fechaEntrega: f });
      setEstado(null);
      setFecha(null);
      return 'Estado guardado';
    });

  const adjuntar = (origen: 'archivo' | 'camara') =>
    hacer(origen, async () => {
      const a: ArchivoElegido | null = origen === 'archivo' ? await elegirArchivo() : await sacarFoto();
      if (!a) return;
      if (doc.archivo && !(await confirmar('Reemplazar archivo', `El archivo "${doc.archivo.nombre}" se borra y se reemplaza por el nuevo.`, 'Reemplazar'))) return;
      await subir(`/fichas/${ficha.id}/documentos/${doc.tipo}/archivo`, a);
      return 'Archivo adjuntado';
    });

  return (
    <Pantalla>
      <Stack.Screen options={{ title: def.nombre }} />
      {sinConexion ? <Aviso tipo="aviso">Sin conexión: los documentos se modifican y abren solo con conexión.</Aviso> : null}
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Tarjeta>
        <Dato etiqueta="Estado actual" valor={`${NOMBRE_ESTADO_DOCUMENTO[doc.estado]}${doc.fechaEntrega ? ` · entregado el ${formatearFecha(doc.fechaEntrega)}` : ''}`} />
        {puedeEditar ? (
          <>
            <Selector
              etiqueta="Nuevo estado"
              valor={estadoElegido}
              permitirVacio={false}
              alCambiar={(v) => setEstado(v as string)}
              opciones={def.estados.map((e) => ({ valor: e, etiqueta: NOMBRE_ESTADO_DOCUMENTO[e] }))}
            />
            {estadoElegido !== 'noPresentado' ? (
              <Campo etiqueta="Fecha de entrega" placeholder="dd/mm/aaaa" value={fechaTexto} onChangeText={setFecha} obligatorio keyboardType="numbers-and-punctuation" />
            ) : null}
            <Boton titulo="Guardar estado" onPress={guardarEstado} cargando={ocupado === 'estado'} />
          </>
        ) : null}
      </Tarjeta>
      <Tarjeta>
        <Dato etiqueta="Archivo" valor={doc.archivo ? `${doc.archivo.nombre} (${Math.ceil(doc.archivo.tamano / 1024)} KB)` : 'Sin archivo (es opcional)'} />
        {doc.archivo ? (
          <Boton
            titulo="Ver archivo"
            variante="secundario"
            deshabilitado={sinConexion}
            cargando={ocupado === 'ver'}
            onPress={() =>
              hacer('ver', async () => {
                // RNF-022: enlace temporal de 10 minutos.
                const { url } = await api.get<{ url: string }>(`/fichas/${ficha.id}/documentos/${doc.tipo}/enlace`);
                await WebBrowser.openBrowserAsync(url);
              })
            }
          />
        ) : null}
        {puedeEditar ? (
          <>
            <Boton titulo="Adjuntar PDF o imagen" onPress={() => adjuntar('archivo')} cargando={ocupado === 'archivo'} />
            {conCamara ? <Boton titulo="Sacar foto del documento" variante="secundario" onPress={() => adjuntar('camara')} cargando={ocupado === 'camara'} /> : null}
            {doc.archivo ? (
              <Boton
                titulo="Quitar archivo"
                variante="texto"
                onPress={async () => {
                  if (await confirmar('Quitar archivo', 'El archivo se borra del almacenamiento.', 'Quitar')) {
                    await hacer('quitar', async () => {
                      await api.delete(`/fichas/${ficha.id}/documentos/${doc.tipo}/archivo`);
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
