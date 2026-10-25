import { useState } from 'react';
import { View } from 'react-native';
import {
  fechaAR,
  formatearFecha,
  horaAR,
  hoyAR,
  instanteAR,
  interpretarFecha,
  interpretarHora,
  type ActividadDTO,
  type Alcance,
  type TipoActividadDTO,
} from '@scouttracker/shared';
import { Aviso, Boton, Campo, Selector, Tarjeta } from './componentes';
import { espacio } from './tema';

export interface DatosActividad {
  tipoId: string;
  nombre: string;
  inicio: string;
  fin: string;
  lugar: string | null;
  alcance: Alcance;
  equipoId: string | null;
}

/** Opción de alcance: 'rama', 'grupo' o el id de un equipo. */
type OpcionAlcance = string;

/**
 * RF-060 / RF-061: datos de una actividad. El alcance solo se elige al crearla. Las fechas se
 * escriben dd/mm/aaaa y las horas hh:mm, en hora de Argentina (RNF-042).
 */
export function FormularioActividad({
  tipos,
  inicial,
  alcances,
  textoGuardar,
  alGuardar,
}: {
  tipos: TipoActividadDTO[];
  inicial?: ActividadDTO;
  /** Alcances que se pueden elegir al crear; sin esto el alcance no se muestra. */
  alcances?: { valor: OpcionAlcance; etiqueta: string }[];
  textoGuardar: string;
  alGuardar(d: DatosActividad): Promise<void>;
}) {
  const [tipoId, setTipoId] = useState<string | null>(inicial?.tipoId ?? tipos.find((t) => t.activo)?.id ?? null);
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [fechaInicio, setFechaInicio] = useState(inicial ? formatearFecha(fechaAR(inicial.inicio)) : '');
  const [horaInicio, setHoraInicio] = useState(inicial ? horaAR(inicial.inicio) : '');
  const [fechaFin, setFechaFin] = useState(inicial ? formatearFecha(fechaAR(inicial.fin)) : '');
  const [horaFin, setHoraFin] = useState(inicial ? horaAR(inicial.fin) : '');
  const [lugar, setLugar] = useState(inicial?.lugar ?? '');
  const [alcance, setAlcance] = useState<OpcionAlcance | null>(alcances?.[0]?.valor ?? null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const opcionesTipo = tipos
    .filter((t) => t.activo || t.id === inicial?.tipoId)
    .map((t) => ({ valor: t.id, etiqueta: t.nombre, detalle: t.requiereAutorizacion ? 'Pide autorización a cada inscripto' : undefined }));

  const guardar = async () => {
    setError(null);
    const hoy = hoyAR();
    const e: Record<string, string> = {};
    const fi = interpretarFecha(fechaInicio, hoy);
    // Si no se indica la fecha de fin, termina el mismo día.
    const ff = fechaFin.trim() ? interpretarFecha(fechaFin, hoy) : fi;
    const hi = interpretarHora(horaInicio);
    const hf = interpretarHora(horaFin);
    if (!tipoId) e.tipo = 'Elegí el tipo de actividad';
    if (!nombre.trim()) e.nombre = 'Falta el nombre';
    if (!fi) e.fechaInicio = 'Fecha inválida (dd/mm/aaaa)';
    if (!ff) e.fechaFin = 'Fecha inválida (dd/mm/aaaa)';
    if (!hi) e.horaInicio = 'Hora inválida (hh:mm)';
    if (!hf) e.horaFin = 'Hora inválida (hh:mm)';
    if (alcances && !alcance) e.alcance = 'Elegí para quién es';
    if (fi && ff && hi && hf && instanteAR(ff, hf) < instanteAR(fi, hi)) e.fechaFin = 'El fin no puede ser anterior al inicio';
    setErrores(e);
    if (Object.keys(e).length) return;
    setGuardando(true);
    try {
      await alGuardar({
        tipoId: tipoId!,
        nombre: nombre.trim(),
        inicio: instanteAR(fi!, hi!),
        fin: instanteAR(ff!, hf!),
        lugar: lugar.trim() || null,
        alcance: alcance === 'grupo' ? 'grupo' : alcance === 'rama' || !alcance ? 'rama' : 'equipo',
        equipoId: alcance && alcance !== 'grupo' && alcance !== 'rama' ? alcance : null,
      });
    } catch (x) {
      setError(x instanceof Error ? x.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View style={{ gap: espacio.m }}>
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <Tarjeta>
        <Selector etiqueta="Tipo de actividad" opciones={opcionesTipo} valor={tipoId} alCambiar={(v) => setTipoId(v as string)} permitirVacio={false} error={errores.tipo} />
        <Campo etiqueta="Nombre" obligatorio value={nombre} onChangeText={setNombre} error={errores.nombre} placeholder="Campamento de primavera" />
        {alcances ? (
          <Selector etiqueta="Para quién es" opciones={alcances} valor={alcance} alCambiar={(v) => setAlcance(v as string)} permitirVacio={false} error={errores.alcance} />
        ) : null}
      </Tarjeta>
      <Tarjeta>
        <View style={{ flexDirection: 'row', gap: espacio.m }}>
          <View style={{ flex: 3 }}>
            <Campo etiqueta="Fecha de inicio" obligatorio placeholder="dd/mm/aaaa" value={fechaInicio} onChangeText={setFechaInicio} error={errores.fechaInicio} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={{ flex: 2 }}>
            <Campo etiqueta="Hora" obligatorio placeholder="hh:mm" value={horaInicio} onChangeText={setHoraInicio} error={errores.horaInicio} keyboardType="numbers-and-punctuation" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: espacio.m }}>
          <View style={{ flex: 3 }}>
            <Campo etiqueta="Fecha de fin" placeholder="Igual al inicio" value={fechaFin} onChangeText={setFechaFin} error={errores.fechaFin} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={{ flex: 2 }}>
            <Campo etiqueta="Hora" obligatorio placeholder="hh:mm" value={horaFin} onChangeText={setHoraFin} error={errores.horaFin} keyboardType="numbers-and-punctuation" />
          </View>
        </View>
        <Campo etiqueta="Lugar" value={lugar} onChangeText={setLugar} placeholder="Opcional" />
      </Tarjeta>
      <Boton titulo={textoGuardar} onPress={() => void guardar()} cargando={guardando} />
    </View>
  );
}
