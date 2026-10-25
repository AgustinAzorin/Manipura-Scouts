import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ACCIONES, MODULOS, NOMBRE_ACCION, NOMBRE_MODULO, type Permisos, type RolDTO } from '@scouttracker/shared';
import { api } from '../../../../../lib/api';
import { useAccion, useCarga } from '../../../../../lib/carga';
import { useSesion } from '../../../../../lib/sesion';
import { Aviso, Boton, Campo, Cargando, confirmar, Interruptor, Pantalla, Parrafo, Subtitulo, Tarjeta } from '../../../../../ui/componentes';
import { espacio } from '../../../../../ui/tema';

/** RF-017, RF-018, RF-020: permisos por módulo (ver, crear, editar, eliminar) y datos sensibles. */
export default function EditarRol() {
  const { grupoId, rolId } = useLocalSearchParams<{ grupoId: string; rolId: string }>();
  const nuevo = rolId === 'nuevo';
  const router = useRouter();
  const { refrescarYo } = useSesion();
  const { datos: roles } = useCarga<RolDTO[]>(`/grupos/${grupoId}/roles`);
  const rol = roles?.find((r) => r.id === rolId);
  if (!nuevo && !rol) return <Cargando />;
  return <FormularioRol key={rol?.id ?? 'nuevo'} grupoId={grupoId} rol={rol ?? null} alTerminar={async () => {
    await refrescarYo();
    router.back();
  }} />;
}

function FormularioRol({ grupoId, rol, alTerminar }: { grupoId: string; rol: RolDTO | null; alTerminar(): Promise<void> }) {
  const nuevo = !rol;
  const rolId = rol?.id;
  const router = useRouter();
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [nombre, setNombre] = useState(rol?.nombre ?? '');
  const [permisos, setPermisos] = useState<Permisos>(rol?.permisos ?? {});
  const [verSensibles, setVerSensibles] = useState(rol?.verSensibles ?? false);
  const sistema = !!rol?.sistema;

  return (
    <Pantalla>
      <Stack.Screen options={{ title: nuevo ? 'Nuevo rol' : rol!.nombre }} />
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      {sistema ? <Aviso tipo="info">Es el rol del admin del grupo: tiene todos los permisos y no se puede recortar ni borrar.</Aviso> : null}
      <Campo etiqueta="Nombre del rol" value={nombre} onChangeText={setNombre} />
      <Tarjeta>
        <Interruptor
          etiqueta="Ver datos sensibles"
          ayuda="DNI, teléfonos, religión, DDJJ de salud, consentimiento y autorizaciones"
          valor={verSensibles}
          alCambiar={setVerSensibles}
          deshabilitado={sistema}
        />
      </Tarjeta>
      {MODULOS.map((m) => (
        <Tarjeta key={m}>
          <Subtitulo>{NOMBRE_MODULO[m]}</Subtitulo>
          <View style={{ gap: espacio.xs }}>
            {ACCIONES.map((a) => (
              <Interruptor
                key={a}
                etiqueta={`${NOMBRE_ACCION[a]} (${NOMBRE_MODULO[m]})`}
                valor={permisos[m]?.includes(a) ?? false}
                deshabilitado={sistema}
                alCambiar={(v) =>
                  setPermisos((p) => {
                    const actuales = p[m] ?? [];
                    return { ...p, [m]: v ? [...actuales, a] : actuales.filter((x) => x !== a) };
                  })
                }
              />
            ))}
          </View>
        </Tarjeta>
      ))}
      {!nuevo && rol ? <Parrafo suave>Los cambios valen para los {rol.cantidadUsuarios} usuario(s) con este rol desde su próxima acción con conexión.</Parrafo> : null}
      <Boton
        titulo={nuevo ? 'Crear rol' : 'Guardar'}
        deshabilitado={!nombre.trim()}
        cargando={ocupado === 'guardar'}
        onPress={() =>
          ejecutar('guardar', async () => {
            const cuerpo = sistema ? { nombre: nombre.trim() } : { nombre: nombre.trim(), permisos, verSensibles };
            if (nuevo) await api.post(`/grupos/${grupoId}/roles`, cuerpo);
            else await api.patch(`/grupos/${grupoId}/roles/${rolId}`, cuerpo);
            await alTerminar();
          })
        }
      />
      {!nuevo && !sistema ? (
        <Boton
          titulo="Borrar rol"
          variante="peligro"
          cargando={ocupado === 'borrar'}
          onPress={async () => {
            if (!(await confirmar('Borrar rol', `¿Borrar el rol ${rol!.nombre}?`, 'Borrar'))) return;
            await ejecutar('borrar', async () => {
              await api.delete(`/grupos/${grupoId}/roles/${rolId}`);
              router.back();
            });
          }}
        />
      ) : null}
    </Pantalla>
  );
}
