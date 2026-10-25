import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import type { UsuarioAdminDTO } from '@scouttracker/shared';
import { api } from '../../../../../lib/api';
import { useAccion, useCarga } from '../../../../../lib/carga';
import { ASIGNACION_VACIA, asignacionCompleta, SelectorAsignacion } from '../../../../../ui/alcance';
import { Aviso, Boton, Cargando, confirmar, Dato, Pantalla, Subtitulo, Tarjeta } from '../../../../../ui/componentes';

/** RF-014, RF-015, RF-019 */
export default function Usuario() {
  const { grupoId, usuarioId } = useLocalSearchParams<{ grupoId: string; usuarioId: string }>();
  const { datos: usuarios, recargar } = useCarga<UsuarioAdminDTO[]>(`/grupos/${grupoId}/usuarios`);
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [asig, setAsig] = useState(ASIGNACION_VACIA);
  const u = usuarios?.find((x) => x.id === usuarioId);
  if (!u) return <Cargando />;
  return (
    <Pantalla>
      <Stack.Screen options={{ title: u.nombre }} />
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Tarjeta>
        <Dato etiqueta="Mail" valor={u.email} />
        <Dato etiqueta="Estado" valor={u.pendienteActivacion ? 'Invitación sin activar' : u.activo ? 'Activo' : 'Inactivo'} />
        {u.pendienteActivacion ? (
          <Boton titulo="Reenviar invitación" variante="secundario" cargando={ocupado === 'reenviar'} onPress={() => ejecutar('reenviar', async () => {
            await api.post(`/grupos/${grupoId}/usuarios/${u.id}/reenviar-invitacion`);
            return 'Invitación reenviada. La anterior dejó de valer.';
          })} />
        ) : null}
        <Boton
          titulo={u.activo ? 'Desactivar usuario' : 'Reactivar usuario'}
          variante={u.activo ? 'peligro' : 'primario'}
          cargando={ocupado === 'estado'}
          onPress={async () => {
            if (u.activo && !(await confirmar('Desactivar usuario', 'Pierde el acceso al grupo y se cierran sus sesiones. Sus cambios anteriores siguen en el historial con su nombre.', 'Desactivar'))) return;
            await ejecutar('estado', async () => {
              await api.post(`/grupos/${grupoId}/usuarios/${u.id}/${u.activo ? 'desactivar' : 'reactivar'}`);
              await recargar();
            });
          }}
        />
      </Tarjeta>
      <Tarjeta>
        <Subtitulo>Roles asignados</Subtitulo>
        {u.asignaciones.map((a) => (
          <Dato
            key={a.id}
            etiqueta={a.rolNombre}
            valor={a.alcanceNombre}
            accion={
              <Boton titulo="Quitar" variante="texto" etiquetaAccesible={`Quitar ${a.rolNombre} en ${a.alcanceNombre}`} onPress={async () => {
                if (!(await confirmar('Quitar rol', `¿Quitar ${a.rolNombre} (${a.alcanceNombre})?`, 'Quitar'))) return;
                await ejecutar(`q-${a.id}`, async () => {
                  await api.delete(`/grupos/${grupoId}/asignaciones/${a.id}`);
                  await recargar();
                });
              }} />
            }
          />
        ))}
        <Subtitulo>Agregar rol</Subtitulo>
        <SelectorAsignacion grupoId={grupoId} valor={asig} alCambiar={setAsig} />
        <Boton titulo="Agregar" deshabilitado={!asignacionCompleta(asig)} cargando={ocupado === 'agregar'} onPress={() => ejecutar('agregar', async () => {
          await api.post(`/grupos/${grupoId}/usuarios/${u.id}/asignaciones`, asig);
          setAsig(ASIGNACION_VACIA);
          await recargar();
          return 'Rol agregado';
        })} />
      </Tarjeta>
    </Pantalla>
  );
}
