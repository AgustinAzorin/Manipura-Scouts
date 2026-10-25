import { Stack, useLocalSearchParams } from 'expo-router';
import { formatearRango, totalesActividad } from '@scouttracker/shared';
import { nombreInscripto, useActividad } from '../../../lib/actividades';
import { Totales } from '../../../ui/actividades';
import { Aviso, Cargando, Pantalla, Parrafo, Subtitulo, Tarjeta } from '../../../ui/componentes';

/** RF-070: presentes y ausentes de una actividad, con sus nombres. */
export default function ReporteAsistencia() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actividad, tipo, error } = useActividad(id);
  if (!actividad) return <Pantalla>{error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />}</Pantalla>;
  const t = totalesActividad(actividad.inscripciones, !!tipo?.requiereAutorizacion);
  const presentes = actividad.inscripciones.filter((i) => i.presente);
  const ausentes = actividad.inscripciones.filter((i) => !i.presente);
  return (
    <Pantalla>
      <Stack.Screen options={{ title: `Asistencia: ${actividad.nombre}` }} />
      <Parrafo suave>
        {tipo?.nombre ? `${tipo.nombre} · ` : ''}
        {formatearRango(actividad.inicio, actividad.fin)}
      </Parrafo>
      {actividad.canceladaEn ? <Aviso tipo="error">Actividad cancelada.</Aviso> : null}
      <Totales
        items={[
          { etiqueta: 'Inscriptos', valor: t.inscriptos },
          { etiqueta: 'Presentes', valor: t.presentes },
          { etiqueta: 'Ausentes', valor: t.ausentes },
        ]}
      />
      <Tarjeta>
        <Subtitulo>Presentes ({presentes.length})</Subtitulo>
        {presentes.length ? presentes.map((i) => <Parrafo key={i.fichaId}>{nombreInscripto(i)}</Parrafo>) : <Parrafo suave>Nadie marcado presente.</Parrafo>}
      </Tarjeta>
      <Tarjeta>
        <Subtitulo>Ausentes ({ausentes.length})</Subtitulo>
        {ausentes.length ? ausentes.map((i) => <Parrafo key={i.fichaId}>{nombreInscripto(i)}</Parrafo>) : <Parrafo suave>No hubo ausentes.</Parrafo>}
      </Tarjeta>
    </Pantalla>
  );
}
