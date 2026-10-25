import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSesion } from '../lib/sesion';
import { ItemMenu, Pantalla, Parrafo, Subtitulo } from '../ui/componentes';

/** RF-021: elegir grupo y rama. */
export default function ElegirContexto() {
  const { yo, elegirRama, contexto } = useSesion();
  const router = useRouter();
  if (!yo) return null;
  const grupos = [...new Set(yo.contextos.map((c) => c.grupoNombre))];
  return (
    <Pantalla>
      <Parrafo>La nómina y la información que ves dependen de la rama que elijas.</Parrafo>
      {grupos.map((g) => (
        <View key={g}>
          <Subtitulo>{g}</Subtitulo>
          {yo.contextos
            .filter((c) => c.grupoNombre === g)
            .map((c) => (
              <ItemMenu
                key={c.ramaId}
                titulo={`${c.ramaNombre}${contexto?.ramaId === c.ramaId ? ' (actual)' : ''}`}
                detalle={[c.comunidad, c.soloEquipos ? 'Solo tu equipo' : null].filter(Boolean).join(' · ') || undefined}
                onPress={async () => {
                  await elegirRama(c.ramaId);
                  router.replace('/inicio');
                }}
              />
            ))}
        </View>
      ))}
    </Pantalla>
  );
}
