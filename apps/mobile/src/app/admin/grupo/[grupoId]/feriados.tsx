import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { formatearFecha, hoyAR, interpretarFecha, type FeriadoDTO } from '@scouttracker/shared';
import { api } from '../../../../lib/api';
import { useAccion, useCarga } from '../../../../lib/carga';
import { useDatos } from '../../../../lib/datos';
import { Aviso, Boton, Campo, Cargando, confirmar, Dato, Pantalla, Parrafo, Subtitulo, Tarjeta } from '../../../../ui/componentes';
import { espacio } from '../../../../ui/tema';

/** RF-075 / RF-076: feriados nacionales (de la fuente pública) y los que carga el grupo. */
export default function Feriados() {
  const { grupoId } = useLocalSearchParams<{ grupoId: string }>();
  const [anio, setAnio] = useState(Number(hoyAR().slice(0, 4)));
  const { datos: feriados, error, recargar } = useCarga<FeriadoDTO[]>(`/grupos/${grupoId}/feriados?anio=${anio}`);
  const { recargar: recargarRama } = useDatos();
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [fecha, setFecha] = useState('');
  const [nombre, setNombre] = useState('');
  if (error && !feriados) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!feriados) return <Cargando />;
  const nacionales = feriados.filter((f) => f.origen === 'nacional');
  return (
    <Pantalla>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Tarjeta>
        <Subtitulo>Agregar un feriado del grupo</Subtitulo>
        <Parrafo suave>Para días que la fuente pública no trae, o si no está disponible.</Parrafo>
        <Campo etiqueta="Fecha" value={fecha} onChangeText={setFecha} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />
        <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder="Aniversario del grupo" />
        <Boton
          titulo="Agregar"
          deshabilitado={!fecha.trim() || !nombre.trim()}
          cargando={ocupado === 'crear'}
          onPress={() =>
            ejecutar('crear', async () => {
              const f = interpretarFecha(fecha, hoyAR());
              if (!f) throw new Error('Fecha inválida (dd/mm/aaaa)');
              await api.post(`/grupos/${grupoId}/feriados`, { fecha: f, nombre: nombre.trim() });
              setFecha('');
              setNombre('');
              await recargar();
              await recargarRama();
              return 'Feriado agregado';
            })
          }
        />
      </Tarjeta>
      <View style={{ flexDirection: 'row', gap: espacio.s, alignItems: 'center' }}>
        <Boton titulo="‹" variante="secundario" onPress={() => setAnio(anio - 1)} etiquetaAccesible={`Año ${anio - 1}`} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Subtitulo>{String(anio)}</Subtitulo>
        </View>
        <Boton titulo="›" variante="secundario" onPress={() => setAnio(anio + 1)} etiquetaAccesible={`Año ${anio + 1}`} />
      </View>
      {nacionales.length === 0 ? (
        <Aviso tipo="aviso">Todavía no hay feriados nacionales de {anio}: la fuente pública no respondió o no los publicó. Se pueden cargar a mano.</Aviso>
      ) : null}
      {feriados.map((f) => (
        <Tarjeta key={`${f.fecha}-${f.nombre}`}>
          <Dato etiqueta={`${formatearFecha(f.fecha)} · ${f.origen === 'nacional' ? 'Nacional' : 'Del grupo'}`} valor={f.nombre} />
          {f.id ? (
            <Boton
              titulo="Borrar"
              variante="texto"
              cargando={ocupado === f.id}
              onPress={async () => {
                if (!(await confirmar('Borrar feriado', `"${f.nombre}" se quita del calendario del grupo.`, 'Borrar'))) return;
                await ejecutar(f.id!, async () => {
                  await api.delete(`/feriados/${f.id}`);
                  await recargar();
                  await recargarRama();
                  return 'Feriado borrado';
                });
              }}
            />
          ) : null}
        </Tarjeta>
      ))}
    </Pantalla>
  );
}
