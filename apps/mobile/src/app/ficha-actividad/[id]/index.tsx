import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import {
  faltantesVersionFinal,
  fechaFicha,
  formatearFechaHora,
  NOMBRE_ESTADO_FICHA_ACTIVIDAD,
  type FichaActividadDTO,
} from '@scouttracker/shared';
import { api, ErrorDelServidor, mensajeDeError } from '../../../lib/api';
import { useAccion } from '../../../lib/carga';
import { useDatos } from '../../../lib/datos';
import { compartirPdf, useFichaActividad, verPdf } from '../../../lib/fichaActividad';
import { Aviso, Boton, Cargando, confirmar, Dato, ItemMenu, Pantalla, Parrafo, Subtitulo, Tarjeta } from '../../../ui/componentes';

/**
 * Ficha de Actividad: resumen, anexos y PDF (RF-088 a RF-104). Todo requiere conexión: la ficha
 * no forma parte de lo que se guarda para usar sin señal (RF-054).
 */
export default function VistaFichaActividad() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ficha, setFicha, error } = useFichaActividad(id);
  const { sinConexion } = useDatos();
  const { ocupado, mensaje, ejecutar, setMensaje } = useAccion();
  const router = useRouter();
  if (error && !ficha) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!ficha) return <Cargando />;

  const editar = ficha.permisos.editar;
  const faltan = faltantesVersionFinal(ficha);
  const nombreArchivo = `Ficha de Actividad - ${ficha.actividad.nombre}.pdf`;

  const generar = (final: boolean) =>
    ejecutar(final ? 'final' : 'borrador', async () => {
      try {
        const r = await api.post<{ ficha: FichaActividadDTO }>(`/fichas-actividad/${ficha.id}/pdf`, { final });
        setFicha(r.ficha);
        return final ? 'Versión final generada. Ya se puede compartir.' : 'Borrador generado.';
      } catch (e) {
        // RF-101: el servidor indica qué falta.
        const faltantes = e instanceof ErrorDelServidor ? (e.datos.faltantes as string[] | undefined) : undefined;
        if (!faltantes?.length) throw e;
        setMensaje({ tipo: 'error', texto: `No se puede generar la versión final:\n• ${faltantes.join('\n• ')}` });
      }
    });

  const agregarAnexo = () =>
    ejecutar('anexo', async () => {
      const r = await api.post<FichaActividadDTO>(`/fichas-actividad/${ficha.id}/anexos`, {});
      setFicha(r);
      const nuevo = r.anexos[r.anexos.length - 1];
      if (nuevo) router.push(`/ficha-actividad/${ficha.id}/anexo/${nuevo.id}`);
    });

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Ficha de Actividad' }} />
      {sinConexion ? <Aviso tipo="aviso">Sin conexión: la Ficha de Actividad se edita y se genera solo con conexión.</Aviso> : null}
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}

      <Tarjeta>
        <Subtitulo>{ficha.actividad.nombre}</Subtitulo>
        <Dato etiqueta="Fecha" valor={fechaFicha(ficha.actividad.inicio, ficha.actividad.fin)} />
        <Dato etiqueta="Lugar" valor={ficha.actividad.lugar ?? ''} />
        <Dato etiqueta="Portada" valor={`${ficha.cabecera.nombreGrupo} · ${ficha.cabecera.nombreComunidad}`} />
        <Dato etiqueta="Estado" valor={NOMBRE_ESTADO_FICHA_ACTIVIDAD[ficha.estado]} />
        <Parrafo suave>La fecha y el lugar salen de la actividad; la portada, de la cabecera de la rama.</Parrafo>
      </Tarjeta>

      <View>
        <ItemMenu
          titulo="Diagnóstico, justificación, objetivos y áreas"
          detalle={ficha.diagnostico.trim() ? `${ficha.objetivosEducativos.length} objetivos educativos · ${ficha.areas.length} áreas` : 'Sin diagnóstico'}
          onPress={() => router.push(`/ficha-actividad/${ficha.id}/textos`)}
        />
        <ItemMenu
          titulo="Programación de actividades"
          detalle={ficha.grilla.length === 1 ? '1 actividad' : `${ficha.grilla.length} actividades`}
          onPress={() => router.push(`/ficha-actividad/${ficha.id}/grilla`)}
        />
      </View>

      <Subtitulo>Anexos</Subtitulo>
      {ficha.anexos.length === 0 ? <Parrafo suave>Todavía no hay anexos. Cada dinámica de la grilla puede tener uno.</Parrafo> : null}
      <View>
        {ficha.anexos.map((a) => (
          <ItemMenu
            key={a.id}
            titulo={`Anexo ${a.numero}${a.titulo.trim() ? ` · ${a.titulo.trim()}` : ''}`}
            detalle={[a.completo ? 'Completo' : 'Pendiente', a.asignadoA ? `lo completa ${a.asignadoA.nombre}` : 'sin asignar'].join(' · ')}
            onPress={() => router.push(`/ficha-actividad/${ficha.id}/anexo/${a.id}`)}
          />
        ))}
      </View>
      {editar ? (
        <>
          <Boton titulo="Agregar anexo" variante="secundario" onPress={() => void agregarAnexo()} cargando={ocupado === 'anexo'} deshabilitado={sinConexion} />
          <Boton titulo="Copiar un anexo de otra ficha" variante="texto" onPress={() => router.push(`/ficha-actividad/${ficha.id}/reutilizar`)} deshabilitado={sinConexion} />
        </>
      ) : null}

      <Subtitulo>PDF</Subtitulo>
      <Tarjeta>
        {ficha.pdf ? (
          <Dato
            etiqueta="PDF guardado en la actividad"
            valor={`${ficha.pdf.final ? 'Versión final' : 'Borrador'} · ${formatearFechaHora(ficha.pdf.generadoEn)} · ${Math.ceil(ficha.pdf.tamano / 1024)} KB`}
          />
        ) : (
          <Parrafo suave>Todavía no se generó el PDF.</Parrafo>
        )}
        {ficha.pdf && ficha.pdfDesactualizado ? <Aviso tipo="aviso">Hubo cambios después de generar este PDF. Volvé a generarlo para incluirlos.</Aviso> : null}
        {ficha.pdf ? (
          <>
            <Boton titulo="Compartir PDF" onPress={() => void ejecutar('compartir', () => compartirPdf(ficha.id, nombreArchivo))} cargando={ocupado === 'compartir'} deshabilitado={sinConexion} />
            <Boton titulo="Ver PDF" variante="secundario" onPress={() => void ejecutar('ver', () => verPdf(ficha.id))} cargando={ocupado === 'ver'} deshabilitado={sinConexion} />
          </>
        ) : null}
        {editar ? (
          <>
            <Parrafo suave>Solo se guarda el último PDF que se genera.</Parrafo>
            <Boton titulo="Generar borrador" variante="secundario" onPress={() => void generar(false)} cargando={ocupado === 'borrador'} deshabilitado={sinConexion} />
            {faltan.length ? <Aviso tipo="info">{`Para la versión final falta:\n• ${faltan.join('\n• ')}`}</Aviso> : null}
            <Boton titulo="Generar versión final" onPress={() => void generar(true)} cargando={ocupado === 'final'} deshabilitado={sinConexion} />
          </>
        ) : null}
      </Tarjeta>

      {ficha.permisos.eliminar ? (
        <Boton
          titulo="Eliminar Ficha de Actividad"
          variante="peligro"
          deshabilitado={sinConexion}
          cargando={ocupado === 'eliminar'}
          onPress={async () => {
            if (!(await confirmar('Eliminar Ficha de Actividad', 'Se borran la ficha, sus anexos y el PDF guardado. La actividad no cambia.', 'Eliminar'))) return;
            try {
              await api.delete(`/fichas-actividad/${ficha.id}`);
              router.back();
            } catch (e) {
              setMensaje({ tipo: 'error', texto: mensajeDeError(e) });
            }
          }}
        />
      ) : null}
    </Pantalla>
  );
}
