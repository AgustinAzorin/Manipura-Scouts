import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { formatearFecha, sumarDias, type RamaConfigDTO } from '@scouttracker/shared';
import { api } from '../../../../lib/api';
import { useAccion, useCarga } from '../../../../lib/carga';
import { useDatos } from '../../../../lib/datos';
import { Logo } from '../../../../lib/logos';
import { elegirImagen, subir } from '../../../../lib/subidas';
import { Aviso, Boton, Campo, Cargando, confirmar, Pantalla, Parrafo, Subtitulo, Tarjeta } from '../../../../ui/componentes';

/** RF-006 a RF-008 */
export default function Equipos() {
  const { ramaId } = useLocalSearchParams<{ ramaId: string }>();
  const { datos: rama, error, recargar } = useCarga<RamaConfigDTO>(`/ramas/${ramaId}/config`);
  const { recargar: recargarNomina } = useDatos();
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [nuevo, setNuevo] = useState('');
  const [nombres, setNombres] = useState<Record<string, string>>({});
  if (error) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!rama) return <Cargando />;
  const listo = async (texto?: string) => {
    await recargar();
    await recargarNomina();
    return texto;
  };
  return (
    <Pantalla>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Tarjeta>
        <Campo etiqueta="Nuevo equipo" value={nuevo} onChangeText={setNuevo} placeholder="Arturo Penny" />
        <Boton titulo="Crear equipo" deshabilitado={!nuevo.trim()} cargando={ocupado === 'crear'} onPress={() => ejecutar('crear', async () => {
          await api.post(`/ramas/${ramaId}/equipos`, { nombre: nuevo.trim() });
          setNuevo('');
          return listo('Equipo creado');
        })} />
      </Tarjeta>
      {rama.equipos.map((e) => (
        <Tarjeta key={e.id}>
          <Subtitulo>
            {e.nombre}
            {e.activo ? '' : ' (inactivo)'}
          </Subtitulo>
          <Logo id={e.logo} tamano={48} />
          {!e.activo && e.desactivadoEn ? (
            <Parrafo suave>Desactivado. Sus integrantes lo conservan hasta el {formatearFecha(sumarDias(e.desactivadoEn.slice(0, 10), 90))}; después quedan sin equipo.</Parrafo>
          ) : null}
          <Campo etiqueta="Nombre" value={nombres[e.id] ?? e.nombre} onChangeText={(t) => setNombres((n) => ({ ...n, [e.id]: t }))} />
          <Boton titulo="Guardar nombre" variante="secundario" cargando={ocupado === `n-${e.id}`} deshabilitado={!(nombres[e.id] ?? '').trim() || nombres[e.id] === e.nombre} onPress={() => ejecutar(`n-${e.id}`, async () => {
            await api.patch(`/equipos/${e.id}`, { nombre: nombres[e.id]!.trim() });
            return listo('Nombre guardado');
          })} />
          <Boton titulo={e.logo ? 'Cambiar logo' : 'Subir logo'} variante="secundario" cargando={ocupado === `l-${e.id}`} onPress={() => ejecutar(`l-${e.id}`, async () => {
            const img = await elegirImagen();
            if (!img) return;
            await subir(`/equipos/${e.id}/logo`, img);
            return listo('Logo guardado');
          })} />
          <Boton
            titulo={e.activo ? 'Desactivar' : 'Reactivar'}
            variante={e.activo ? 'peligro' : 'primario'}
            cargando={ocupado === `a-${e.id}`}
            onPress={async () => {
              if (e.activo && !(await confirmar('Desactivar equipo', 'No se podrá asignar a fichas nuevas. Sus integrantes lo conservan 90 días y luego quedan "Sin equipo".', 'Desactivar'))) return;
              await ejecutar(`a-${e.id}`, async () => {
                await api.post(`/equipos/${e.id}/${e.activo ? 'desactivar' : 'reactivar'}`);
                return listo();
              });
            }}
          />
        </Tarjeta>
      ))}
    </Pantalla>
  );
}
