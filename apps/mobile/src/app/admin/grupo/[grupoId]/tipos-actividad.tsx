import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { COLORES_TIPO_ACTIVIDAD, type TipoActividadDTO } from '@scouttracker/shared';
import { api } from '../../../../lib/api';
import { useAccion, useCarga } from '../../../../lib/carga';
import { useDatos } from '../../../../lib/datos';
import { EtiquetaTipo } from '../../../../ui/actividades';
import { Aviso, Boton, Campo, Cargando, Interruptor, Pantalla, Selector, Subtitulo, Tarjeta } from '../../../../ui/componentes';

const OPCIONES_COLOR = COLORES_TIPO_ACTIVIDAD.map((c) => ({ valor: c.color, etiqueta: c.nombre }));

/** RF-063: tipos de actividad del grupo, con color y la marca "requiere autorización". */
export default function TiposActividad() {
  const { grupoId } = useLocalSearchParams<{ grupoId: string }>();
  const { datos: tipos, error, recargar } = useCarga<TipoActividadDTO[]>(`/grupos/${grupoId}/tipos-actividad`);
  const { recargar: recargarRama } = useDatos();
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState(COLORES_TIPO_ACTIVIDAD[0]!.color);
  const [requiere, setRequiere] = useState(false);
  if (error) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!tipos) return <Cargando />;

  const cambiar = (t: TipoActividadDTO, cambios: Partial<TipoActividadDTO>, texto: string) =>
    ejecutar(t.id, async () => {
      await api.patch(`/tipos-actividad/${t.id}`, cambios);
      await recargar();
      await recargarRama();
      return texto;
    });

  return (
    <Pantalla>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Tarjeta>
        <Subtitulo>Nuevo tipo</Subtitulo>
        <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder="Fogón" />
        <Selector etiqueta="Color" opciones={OPCIONES_COLOR} valor={color} alCambiar={(v) => setColor(v as string)} permitirVacio={false} />
        <Interruptor etiqueta="Requiere autorización" ayuda="Pide registrar la autorización de cada inscripto" valor={requiere} alCambiar={setRequiere} />
        <Boton
          titulo="Crear tipo"
          deshabilitado={!nombre.trim()}
          cargando={ocupado === 'crear'}
          onPress={() =>
            ejecutar('crear', async () => {
              await api.post(`/grupos/${grupoId}/tipos-actividad`, { nombre: nombre.trim(), color, requiereAutorizacion: requiere });
              setNombre('');
              setRequiere(false);
              await recargar();
              await recargarRama();
              return 'Tipo creado';
            })
          }
        />
      </Tarjeta>
      {tipos.map((t) => (
        <Tarjeta key={t.id}>
          <EtiquetaTipo tipo={t} />
          <Selector etiqueta="Color" opciones={OPCIONES_COLOR} valor={t.color} alCambiar={(v) => void cambiar(t, { color: v as string }, 'Color guardado')} permitirVacio={false} deshabilitado={ocupado === t.id} />
          <Interruptor
            etiqueta="Requiere autorización"
            valor={t.requiereAutorizacion}
            alCambiar={(v) => void cambiar(t, { requiereAutorizacion: v }, v ? 'Ahora pide autorización' : 'Ya no pide autorización')}
            deshabilitado={ocupado === t.id}
          />
          <Interruptor
            etiqueta="Activo"
            ayuda="Un tipo inactivo no se puede elegir en actividades nuevas"
            valor={t.activo}
            alCambiar={(v) => void cambiar(t, { activo: v }, v ? 'Tipo activado' : 'Tipo desactivado')}
            deshabilitado={ocupado === t.id}
          />
        </Tarjeta>
      ))}
    </Pantalla>
  );
}
