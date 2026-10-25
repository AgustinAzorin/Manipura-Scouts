import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { AREAS, NOMBRE_AREA, type Area, type FichaActividadDTO } from '@scouttracker/shared';
import { api } from '../../../lib/api';
import { useAccion } from '../../../lib/carga';
import { useFichaActividad } from '../../../lib/fichaActividad';
import { Aviso, Boton, Campo, Cargando, Interruptor, Pantalla, Parrafo, Subtitulo, Tarjeta } from '../../../ui/componentes';

const lineas = (t: string) =>
  t
    .split('\n')
    .map((l) => l.replace(/^\s*[-•●]\s*/, '').trim())
    .filter(Boolean);

/** RF-089 a RF-092: diagnóstico, justificación, objetivos y áreas a trabajar. */
export default function TextosFicha() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ficha, error } = useFichaActividad(id);
  if (error && !ficha) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!ficha) return <Cargando />;
  return <Formulario ficha={ficha} />;
}

function Formulario({ ficha }: { ficha: FichaActividadDTO }) {
  const router = useRouter();
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [diagnostico, setDiagnostico] = useState(ficha.diagnostico);
  const [porQue, setPorQue] = useState(ficha.porQue);
  const [aQueResponde, setAQueResponde] = useState(ficha.aQueResponde);
  const [dondeNecesidad, setDondeNecesidad] = useState(ficha.dondeNecesidad);
  const [porQueLugar, setPorQueLugar] = useState(ficha.porQueLugar);
  const [educativos, setEducativos] = useState(ficha.objetivosEducativos.join('\n'));
  const [dirigente, setDirigente] = useState(ficha.objetivosDirigente.join('\n'));
  const [areas, setAreas] = useState<Partial<Record<Area, string>>>(Object.fromEntries(ficha.areas.map((a) => [a.area, a.descripcion])));
  const editar = ficha.permisos.editar;
  const multilinea = { multiline: true, editable: editar };

  const guardar = () =>
    ejecutar('guardar', async () => {
      await api.patch(`/fichas-actividad/${ficha.id}`, {
        diagnostico,
        porQue,
        aQueResponde,
        dondeNecesidad,
        porQueLugar,
        objetivosEducativos: lineas(educativos),
        objetivosDirigente: lineas(dirigente),
        areas: AREAS.filter((a) => areas[a] !== undefined).map((a) => ({ area: a, descripcion: areas[a]!.trim() })),
      });
      router.back();
    });

  return (
    <Pantalla>
      {!editar ? <Aviso tipo="info">Solo lectura: no tenés permiso para editar esta ficha.</Aviso> : null}
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Campo
        etiqueta="Diagnóstico"
        ayuda="Se copió de la última ficha de la rama. Cambiarlo acá no cambia la ficha anterior."
        value={diagnostico}
        onChangeText={setDiagnostico}
        {...multilinea}
      />

      <Subtitulo>Justificación</Subtitulo>
      <Campo etiqueta="Por qué se debe realizar esta actividad" value={porQue} onChangeText={setPorQue} {...multilinea} />
      <Campo etiqueta="A qué responde" value={aQueResponde} onChangeText={setAQueResponde} {...multilinea} />
      <Campo etiqueta="Dónde se detectó la necesidad" value={dondeNecesidad} onChangeText={setDondeNecesidad} {...multilinea} />
      <Campo etiqueta="Por qué se eligió este lugar" value={porQueLugar} onChangeText={setPorQueLugar} {...multilinea} />

      <Subtitulo>Objetivos</Subtitulo>
      <Parrafo suave>Un objetivo por línea. En el PDF van como lista con viñetas.</Parrafo>
      <Campo etiqueta="Objetivos educativos" value={educativos} onChangeText={setEducativos} {...multilinea} />
      <Campo etiqueta="Objetivos que persigue el dirigente" value={dirigente} onChangeText={setDirigente} {...multilinea} />

      <Subtitulo>Áreas a trabajar</Subtitulo>
      <Parrafo suave>Cada área elegida necesita una descripción para generar la versión final.</Parrafo>
      {AREAS.map((a) => (
        <Tarjeta key={a}>
          <Interruptor
            etiqueta={NOMBRE_AREA[a]}
            valor={areas[a] !== undefined}
            deshabilitado={!editar}
            alCambiar={(v) =>
              setAreas((prev) => {
                const nuevas = { ...prev };
                if (v) nuevas[a] = prev[a] ?? '';
                else delete nuevas[a];
                return nuevas;
              })
            }
          />
          {areas[a] !== undefined ? (
            <Campo
              etiqueta={`Descripción de ${NOMBRE_AREA[a]}`}
              value={areas[a]}
              onChangeText={(t) => setAreas((prev) => ({ ...prev, [a]: t }))}
              error={!areas[a]!.trim() ? 'Falta la descripción' : null}
              {...multilinea}
            />
          ) : null}
        </Tarjeta>
      ))}
      {editar ? <Boton titulo="Guardar" onPress={() => void guardar()} cargando={ocupado === 'guardar'} /> : null}
    </Pantalla>
  );
}
