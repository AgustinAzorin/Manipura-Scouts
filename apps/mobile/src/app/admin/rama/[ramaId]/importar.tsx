import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import type { ResumenImportacion } from '@scouttracker/shared';
import { useAccion } from '../../../../lib/carga';
import { useDatos } from '../../../../lib/datos';
import { elegirArchivo, subir } from '../../../../lib/subidas';
import { Aviso, Boton, Dato, Pantalla, Parrafo, Subtitulo, Tarjeta } from '../../../../ui/componentes';

const TIPOS = ['text/csv', 'text/comma-separated-values', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '*/*'];

/** RF-049 a RF-053 */
export default function Importar() {
  const { ramaId } = useLocalSearchParams<{ ramaId: string }>();
  const { recargar } = useDatos();
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);
  return (
    <Pantalla>
      <Parrafo>
        Elegí la planilla (CSV o XLSX) con las columnas actuales: Apellido, Nombre, DNI, Fecha de nacimiento, teléfonos de emergencia, Equipo, Elemento, Promesa, Etapa, Raid, cuotas y documentos.
      </Parrafo>
      <Parrafo suave>
        Antes de importar cargá los equipos y los valores de catálogo de la rama: los valores que no coincidan quedan vacíos y la ficha queda incompleta. Las filas de adultos y las de DNI repetido no se importan.
      </Parrafo>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Boton
        titulo="Elegir planilla e importar"
        cargando={ocupado === 'importar'}
        onPress={() =>
          ejecutar('importar', async () => {
            const a = await elegirArchivo(TIPOS);
            if (!a) return;
            setResumen(await subir<ResumenImportacion>(`/ramas/${ramaId}/importar`, a));
            await recargar();
          })
        }
      />
      {resumen ? (
        <Tarjeta>
          <Subtitulo>Resumen</Subtitulo>
          <Dato etiqueta="Filas leídas" valor={String(resumen.filasLeidas)} />
          <Dato etiqueta="Fichas creadas" valor={`${resumen.creadas} (${resumen.incompletas} incompletas)`} />
          <Dato etiqueta="Filas omitidas" valor={String(resumen.omitidas.length)} />
          {resumen.omitidas.map((o) => (
            <Parrafo key={o.fila}>• Fila {o.fila}: {o.motivo}</Parrafo>
          ))}
          {resumen.adultos.length ? <Parrafo>Filas de adultos no importadas: {resumen.adultos.join(', ')}</Parrafo> : null}
          {resumen.detalleIncompletas.length ? <Subtitulo>Fichas incompletas</Subtitulo> : null}
          {resumen.detalleIncompletas.map((d) => (
            <Parrafo key={d.fila}>• Fila {d.fila}: {d.motivos.join('; ')}</Parrafo>
          ))}
          {resumen.columnasIgnoradas.length ? <Aviso tipo="aviso">Columnas no reconocidas (no se importaron): {resumen.columnasIgnoradas.join(', ')}</Aviso> : null}
        </Tarjeta>
      ) : null}
    </Pantalla>
  );
}
