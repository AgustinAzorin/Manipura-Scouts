import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import type { RamaDTO } from '@scouttracker/shared';
import { api } from '../../../../lib/api';
import { useAccion, useCarga } from '../../../../lib/carga';
import { useSesion } from '../../../../lib/sesion';
import { Aviso, Boton, Campo, Cargando, ItemMenu, Pantalla, Subtitulo, Tarjeta } from '../../../../ui/componentes';

/** RF-005 */
export default function Ramas() {
  const { grupoId } = useLocalSearchParams<{ grupoId: string }>();
  const router = useRouter();
  const { refrescarYo } = useSesion();
  const { datos: ramas, error, recargar } = useCarga<RamaDTO[]>(`/grupos/${grupoId}/ramas`);
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [nombre, setNombre] = useState('');
  const [comunidad, setComunidad] = useState('');
  if (error) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!ramas) return <Cargando />;
  return (
    <Pantalla>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Tarjeta>
        <Subtitulo>Nueva rama</Subtitulo>
        <Campo etiqueta="Rama" value={nombre} onChangeText={setNombre} placeholder="Caminantes" />
        <Campo etiqueta="Comunidad o unidad" value={comunidad} onChangeText={setComunidad} placeholder="Posta Antártida Argentina" />
        <Boton
          titulo="Crear rama"
          deshabilitado={!nombre.trim()}
          cargando={ocupado === 'crear'}
          onPress={() =>
            ejecutar('crear', async () => {
              await api.post(`/grupos/${grupoId}/ramas`, { nombre: nombre.trim(), comunidad: comunidad.trim() || null });
              setNombre('');
              setComunidad('');
              await recargar();
              await refrescarYo();
              return 'Rama creada';
            })
          }
        />
      </Tarjeta>
      {ramas.map((r) => (
        <ItemMenu key={r.id} titulo={r.nombre} detalle={r.comunidad ?? undefined} onPress={() => router.push(`/admin/rama/${r.id}`)} />
      ))}
    </Pantalla>
  );
}
