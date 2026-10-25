import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { formatearFechaHora, type CambioHistorialDTO } from '@scouttracker/shared';
import { api, mensajeDeError } from '../../../lib/api';
import { Aviso, Cargando, Dato, Pantalla, Parrafo, Tarjeta } from '../../../ui/componentes';

/** RF-026 */
export default function Historial() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cambios, setCambios] = useState<CambioHistorialDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<CambioHistorialDTO[]>(`/fichas/${id}/historial`).then(setCambios, (e) => setError(mensajeDeError(e)));
  }, [id]);
  if (error) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!cambios) return <Cargando />;
  return (
    <Pantalla>
      {cambios.length === 0 ? <Parrafo suave>Sin cambios registrados.</Parrafo> : null}
      {cambios.map((c) => (
        <Tarjeta key={c.id}>
          <Dato etiqueta={`${formatearFechaHora(c.creadoEn)} · ${c.usuarioNombre}`} valor={c.etiqueta} />
          {c.oculto ? (
            <Parrafo suave>Valor oculto: requiere el permiso de datos sensibles.</Parrafo>
          ) : c.valorAnterior !== null || c.valorNuevo !== null ? (
            <Parrafo>
              {c.valorAnterior ?? '—'} → {c.valorNuevo ?? '—'}
            </Parrafo>
          ) : null}
        </Tarjeta>
      ))}
    </Pantalla>
  );
}
