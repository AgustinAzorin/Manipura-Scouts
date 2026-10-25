import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import type { RamaConfigDTO } from '@scouttracker/shared';
import { api } from '../../../../lib/api';
import { useAccion, useCarga } from '../../../../lib/carga';
import { useDatos } from '../../../../lib/datos';
import { useSesion } from '../../../../lib/sesion';
import { Aviso, Boton, Campo, Cargando, ItemMenu, Pantalla, Tarjeta } from '../../../../ui/componentes';

export default function ConfigRama() {
  const { ramaId } = useLocalSearchParams<{ ramaId: string }>();
  const router = useRouter();
  const { yo, refrescarYo } = useSesion();
  const { recargar: recargarNomina } = useDatos();
  const { datos: rama, error, recargar } = useCarga<RamaConfigDTO>(`/ramas/${ramaId}/config`);
  if (error) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!rama) return <Cargando />;
  const adminGrupo = yo?.gruposAdministrables.some((g) => g.grupoId === rama.grupoId);
  return (
    <Pantalla>
      <Stack.Screen options={{ title: `Rama ${rama.nombre}` }} />
      {adminGrupo ? <NombreRama key={`${rama.nombre}|${rama.comunidad}`} rama={rama} alGuardar={async () => {
        await recargar();
        await refrescarYo();
      }} /> : null}
      <ItemMenu titulo="Equipos" detalle={`${rama.equipos.filter((e) => e.activo).length} activos`} onPress={() => router.push(`/admin/rama/${ramaId}/equipos`)} />
      <ItemMenu titulo="Catálogos" detalle="Elemento, Promesa, Etapa, Raid, Guardián y otros" onPress={() => router.push(`/admin/rama/${ramaId}/catalogos`)} />
      <ItemMenu titulo="Campos de la ficha" detalle="Ocultar campos y crear campos propios" onPress={() => router.push(`/admin/rama/${ramaId}/campos`)} />
      <ItemMenu titulo="Importar planilla" detalle="CSV o XLSX con las columnas de la planilla actual" onPress={() => router.push(`/admin/rama/${ramaId}/importar`)} />
      <Boton titulo="Actualizar la nómina en este celular" variante="texto" onPress={recargarNomina} />
    </Pantalla>
  );
}

function NombreRama({ rama, alGuardar }: { rama: RamaConfigDTO; alGuardar(): Promise<void> }) {
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [nombre, setNombre] = useState(rama.nombre);
  const [comunidad, setComunidad] = useState(rama.comunidad ?? '');
  return (
    <>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
        <Tarjeta>
          <Campo etiqueta="Nombre de la rama" value={nombre} onChangeText={setNombre} />
          <Campo etiqueta="Comunidad o unidad" value={comunidad} onChangeText={setComunidad} />
          <Boton
            titulo="Guardar nombre"
            variante="secundario"
            cargando={ocupado === 'nombre'}
            onPress={() =>
              ejecutar('nombre', async () => {
                await api.patch(`/grupos/${rama.grupoId}/ramas/${rama.id}`, { nombre: nombre.trim(), comunidad: comunidad.trim() || null });
                await alGuardar();
                return 'Guardado';
              })
            }
          />
        </Tarjeta>
    </>
  );
}
