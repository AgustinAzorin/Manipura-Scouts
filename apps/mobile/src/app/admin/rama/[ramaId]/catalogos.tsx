import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { CATALOGOS, CATALOGOS_CON_LOGO, NOMBRE_CATALOGO, type Catalogo, type RamaConfigDTO } from '@scouttracker/shared';
import { api } from '../../../../lib/api';
import { useAccion, useCarga } from '../../../../lib/carga';
import { useDatos } from '../../../../lib/datos';
import { Logo } from '../../../../lib/logos';
import { elegirImagen, subir } from '../../../../lib/subidas';
import { Aviso, Boton, Campo, Cargando, Interruptor, Pantalla, Parrafo, Selector, Subtitulo, Tarjeta } from '../../../../ui/componentes';
import { espacio } from '../../../../ui/tema';

/** RF-044 a RF-047 */
export default function Catalogos() {
  const { ramaId } = useLocalSearchParams<{ ramaId: string }>();
  const { datos: rama, error, recargar } = useCarga<RamaConfigDTO>(`/ramas/${ramaId}/config`);
  const { recargar: recargarNomina } = useDatos();
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [catalogo, setCatalogo] = useState<Catalogo>('etapa');
  const [nuevo, setNuevo] = useState('');
  const [nombres, setNombres] = useState<Record<string, string>>({});
  if (error) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!rama) return <Cargando />;
  const valores = rama.catalogos.filter((v) => v.catalogo === catalogo);
  const listo = async (t?: string) => {
    await recargar();
    await recargarNomina();
    return t;
  };
  return (
    <Pantalla>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Selector etiqueta="Catálogo" valor={catalogo} permitirVacio={false} alCambiar={(v) => setCatalogo(v as Catalogo)} opciones={CATALOGOS.map((c) => ({ valor: c, etiqueta: NOMBRE_CATALOGO[c] }))} />
      <Parrafo suave>Los valores son de esta rama. Desactivar un valor lo saca de las opciones, pero las fichas que ya lo tienen lo conservan.</Parrafo>
      <Tarjeta>
        <Campo etiqueta={`Nuevo valor de ${NOMBRE_CATALOGO[catalogo]}`} value={nuevo} onChangeText={setNuevo} />
        <Boton titulo="Agregar" deshabilitado={!nuevo.trim()} cargando={ocupado === 'crear'} onPress={() => ejecutar('crear', async () => {
          await api.post(`/ramas/${ramaId}/catalogos`, { catalogo, nombre: nuevo.trim() });
          setNuevo('');
          return listo('Valor agregado');
        })} />
      </Tarjeta>
      {valores.map((v) => (
        <Tarjeta key={v.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s }}>
            {CATALOGOS_CON_LOGO.includes(catalogo) ? <Logo id={v.logo} tamano={40} /> : null}
            <Subtitulo>
              {v.nombre}
              {v.activo ? '' : ' (desactivado)'}
            </Subtitulo>
          </View>
          <Campo etiqueta="Nombre" value={nombres[v.id] ?? v.nombre} onChangeText={(t) => setNombres((n) => ({ ...n, [v.id]: t }))} />
          <Boton titulo="Renombrar" variante="secundario" deshabilitado={!(nombres[v.id] ?? '').trim() || nombres[v.id] === v.nombre} cargando={ocupado === `n-${v.id}`} onPress={() => ejecutar(`n-${v.id}`, async () => {
            await api.patch(`/catalogo-valores/${v.id}`, { nombre: nombres[v.id]!.trim() });
            return listo('Las fichas que lo usan muestran el nombre nuevo');
          })} />
          {CATALOGOS_CON_LOGO.includes(catalogo) ? (
            <Boton titulo={v.logo ? 'Cambiar logo' : 'Subir logo'} variante="secundario" cargando={ocupado === `l-${v.id}`} onPress={() => ejecutar(`l-${v.id}`, async () => {
              const img = await elegirImagen();
              if (!img) return;
              await subir(`/catalogo-valores/${v.id}/logo`, img);
              return listo('Logo guardado');
            })} />
          ) : null}
          {catalogo === 'categoriaMiembro' ? (
            <Interruptor etiqueta="Es una categoría de adulto" ayuda="Las filas de adultos no se importan al padrón" valor={v.esAdulto} alCambiar={(x) => void ejecutar(`ad-${v.id}`, async () => {
              await api.patch(`/catalogo-valores/${v.id}`, { esAdulto: x });
              return listo();
            })} />
          ) : null}
          <Interruptor etiqueta="Activo" valor={v.activo} alCambiar={(x) => void ejecutar(`ac-${v.id}`, async () => {
            await api.patch(`/catalogo-valores/${v.id}`, { activo: x });
            return listo();
          })} />
        </Tarjeta>
      ))}
    </Pantalla>
  );
}
