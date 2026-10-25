import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { nombreCompleto, type FichaDTO } from '@scouttracker/shared';
import { api } from '../../../lib/api';
import { useFicha } from '../../../lib/fichas';
import { Cargando } from '../../../ui/componentes';
import { FormularioFicha } from '../../../ui/formulario-ficha';

/** RF-024 / RF-025 */
export default function EditarFicha() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ficha, setFicha } = useFicha(id);
  const router = useRouter();
  if (!ficha) return <Cargando />;
  return (
    <>
      <Stack.Screen options={{ title: `Editar: ${nombreCompleto(ficha)}` }} />
      <FormularioFicha
        key={ficha.version}
        ficha={ficha}
        enviar={(e) => api.patch<FichaDTO>(`/fichas/${ficha.id}`, { ...e, version: ficha.version })}
        alGuardar={(f) => {
          setFicha(f);
          router.back();
        }}
      />
    </>
  );
}
