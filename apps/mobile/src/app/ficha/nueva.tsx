import { Stack, useRouter } from 'expo-router';
import type { FichaDTO } from '@scouttracker/shared';
import { api } from '../../lib/api';
import { useDatos } from '../../lib/datos';
import { useSesion } from '../../lib/sesion';
import { FormularioFicha } from '../../ui/formulario-ficha';

/** RF-022 */
export default function NuevaFicha() {
  const { contexto } = useSesion();
  const { actualizarFicha } = useDatos();
  const router = useRouter();
  if (!contexto) return null;
  return (
    <>
      <Stack.Screen options={{ title: 'Nueva ficha' }} />
      <FormularioFicha
        ficha={null}
        enviar={(e) => api.post<FichaDTO>(`/ramas/${contexto.ramaId}/fichas`, e)}
        alGuardar={(f) => {
          actualizarFicha(f);
          router.replace(`/ficha/${f.id}`);
        }}
      />
    </>
  );
}
