import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import type { CabeceraDTO, EducadorCabecera } from '@scouttracker/shared';
import { api } from '../../../../lib/api';
import { useAccion, useCarga } from '../../../../lib/carga';
import { Logo } from '../../../../lib/logos';
import { elegirImagen, subir } from '../../../../lib/subidas';
import { Aviso, Boton, Campo, Cargando, confirmar, Pantalla, Parrafo, Subtitulo, Tarjeta } from '../../../../ui/componentes';

/** RF-088: portada y equipo de educadores de la Ficha de Actividad de la rama. */
export default function CabeceraFicha() {
  const { ramaId } = useLocalSearchParams<{ ramaId: string }>();
  const { datos, error, recargar } = useCarga<CabeceraDTO>(`/ramas/${ramaId}/cabecera-ficha`);
  if (error) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!datos) return <Cargando />;
  // Los textos se toman una vez; al cambiar el logo solo se actualiza el logo.
  return <Formulario cabecera={datos} alCambiarLogo={recargar} />;
}

function Formulario({ cabecera, alCambiarLogo }: { cabecera: CabeceraDTO; alCambiarLogo: () => Promise<void> }) {
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [nombreGrupo, setNombreGrupo] = useState(cabecera.nombreGrupo);
  const [nombreComunidad, setNombreComunidad] = useState(cabecera.nombreComunidad);
  const [educadores, setEducadores] = useState<EducadorCabecera[]>(cabecera.educadores);
  const cambiar = (i: number, c: Partial<EducadorCabecera>) => setEducadores((l) => l.map((e, j) => (j === i ? { ...e, ...c } : e)));
  const ruta = `/ramas/${cabecera.ramaId}/cabecera-ficha`;

  return (
    <Pantalla>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Parrafo suave>Cada Ficha de Actividad nueva de la rama toma esta portada y este equipo de educadores.</Parrafo>
      <Tarjeta>
        <Campo etiqueta="Nombre del grupo" value={nombreGrupo} onChangeText={setNombreGrupo} placeholder="Grupo Scout General Paz" />
        <Campo etiqueta="Nombre de la comunidad" value={nombreComunidad} onChangeText={setNombreComunidad} placeholder="Comunidad Caminantes Posta Antártida Argentina" />
      </Tarjeta>

      <Subtitulo>Logo de portada</Subtitulo>
      <Tarjeta>
        {cabecera.logo ? <Logo id={cabecera.logo} tamano={120} /> : <Parrafo suave>Sin logo.</Parrafo>}
        <Boton
          titulo={cabecera.logo ? 'Cambiar logo' : 'Subir logo'}
          variante="secundario"
          cargando={ocupado === 'logo'}
          onPress={() =>
            void ejecutar('logo', async () => {
              const img = await elegirImagen();
              if (!img) return;
              await subir(`${ruta}/logo`, img);
              await alCambiarLogo();
            })
          }
        />
        {cabecera.logo ? (
          <Boton
            titulo="Quitar logo"
            variante="texto"
            onPress={async () => {
              if (!(await confirmar('Quitar logo', 'La portada queda sin logo.', 'Quitar'))) return;
              await ejecutar('quitar', async () => {
                await api.delete(`${ruta}/logo`);
                await alCambiarLogo();
              });
            }}
          />
        ) : null}
        <Parrafo suave>PNG o JPG de hasta 1 MB.</Parrafo>
      </Tarjeta>

      <Subtitulo>Equipo de educadores</Subtitulo>
      {educadores.map((e, i) => (
        <Tarjeta key={i}>
          <Campo etiqueta="Nombre" obligatorio value={e.nombre} onChangeText={(t) => cambiar(i, { nombre: t })} />
          <Campo etiqueta="Cargo" value={e.cargo} onChangeText={(t) => cambiar(i, { cargo: t })} placeholder="Jefe de rama" />
          <Campo etiqueta="Formación" value={e.formacion} onChangeText={(t) => cambiar(i, { formacion: t })} placeholder="En formación" />
          <Boton titulo="Quitar" variante="texto" onPress={() => setEducadores((l) => l.filter((_, j) => j !== i))} />
        </Tarjeta>
      ))}
      <Boton titulo="Agregar educador" variante="secundario" onPress={() => setEducadores((l) => [...l, { nombre: '', cargo: '', formacion: '' }])} />
      <Boton
        titulo="Guardar"
        cargando={ocupado === 'guardar'}
        deshabilitado={educadores.some((e) => !e.nombre.trim())}
        onPress={() =>
          void ejecutar('guardar', async () => {
            await api.put(ruta, { nombreGrupo: nombreGrupo.trim(), nombreComunidad: nombreComunidad.trim(), educadores });
            return 'Cabecera guardada';
          })
        }
      />
    </Pantalla>
  );
}
