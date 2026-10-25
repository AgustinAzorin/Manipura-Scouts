import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  aISO,
  diasEnMes,
  eventosPorDia,
  formatearFecha,
  hoyAR,
  inicioDeSemana,
  interpretarFecha,
  interpretarHora,
  nombreDia,
  NOMBRES_MES,
  partesFecha,
  semanasDelMes,
  sumarDias,
  tienePermiso,
  type ActividadDTO,
  type EventoCalendario,
  type FechaISO,
  type FeriadoDTO,
  type RecordatorioDTO,
} from '@scouttracker/shared';
import { api, mensajeDeError } from '../lib/api';
import { useDatos } from '../lib/datos';
import { useSesion } from '../lib/sesion';
import { Marca } from '../ui/actividades';
import { Aviso, Boton, Campo, Cargando, confirmar, Pantalla, Parrafo, Subtitulo } from '../ui/componentes';
import { colores, espacio, TACTIL_MINIMO, texto } from '../ui/tema';

type Vista = 'mes' | 'semana' | 'dia';

/** Lo guardado para uso sin conexión cubre desde hace 60 días hasta fin del año siguiente (RF-054). */
const DIAS_GUARDADOS = 60;

const colorEvento = (e: EventoCalendario) =>
  e.tipo === 'actividad' ? e.color : e.tipo === 'feriado' ? colores.peligro : e.tipo === 'cumpleanios' ? colores.info : colores.textoSuave;

const etiquetaEvento = (e: EventoCalendario) =>
  e.tipo === 'actividad'
    ? e.actividad.canceladaEn
      ? 'Actividad cancelada'
      : 'Actividad'
    : e.tipo === 'feriado'
      ? e.feriado.origen === 'nacional'
        ? 'Feriado nacional'
        : 'Feriado del grupo'
      : e.tipo === 'cumpleanios'
        ? 'Cumpleaños'
        : 'Recordatorio personal';

interface DatosAnio {
  clave: string;
  actividades: ActividadDTO[];
  feriados: FeriadoDTO[];
  recordatorios: RecordatorioDTO[];
  error?: string;
}

/** RF-072 a RF-077: calendario con actividades, cumpleaños, feriados y recordatorios. */
export default function Calendario() {
  const { contexto } = useSesion();
  const { snapshot, actividades, sinConexion, recargar } = useDatos();
  const router = useRouter();
  const hoy = hoyAR();
  const [vista, setVista] = useState<Vista>('mes');
  const [dia, setDia] = useState<FechaISO>(hoy);
  const [creando, setCreando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [anterior, setAnterior] = useState<DatosAnio | null>(null);

  const { anio, mes } = partesFecha(dia);
  const rango = useMemo((): [FechaISO, FechaISO] => {
    if (vista === 'mes') {
      const s = semanasDelMes(anio, mes);
      return [s[0]![0]!, s.at(-1)!.at(-1)!];
    }
    if (vista === 'semana') return [inicioDeSemana(dia), sumarDias(inicioDeSemana(dia), 6)];
    return [dia, dia];
  }, [vista, dia, anio, mes]);

  // Fuera de lo guardado (más de 60 días atrás) se pide al servidor el año entero.
  const cubreDesde = sumarDias(hoy, -DIAS_GUARDADOS);
  const necesitaAnio = rango[0] < cubreDesde ? Number(rango[0].slice(0, 4)) : null;
  const ramaId = contexto?.ramaId;
  const grupoId = contexto?.grupoId;
  const clave = `${ramaId}:${necesitaAnio}`;
  useEffect(() => {
    if (!necesitaAnio || !ramaId || !grupoId || sinConexion) return;
    let vigente = true;
    Promise.all([
      api.get<ActividadDTO[]>(`/ramas/${ramaId}/actividades?anio=${necesitaAnio}`),
      api.get<FeriadoDTO[]>(`/grupos/${grupoId}/feriados?anio=${necesitaAnio}`),
      api.get<RecordatorioDTO[]>(`/recordatorios?grupoId=${grupoId}&desde=${necesitaAnio}-01-01&hasta=${necesitaAnio}-12-31`),
    ])
      .then(([a, f, r]) => vigente && setAnterior({ clave, actividades: a, feriados: f, recordatorios: r }))
      .catch((e) => vigente && setAnterior({ clave, actividades: [], feriados: [], recordatorios: [], error: mensajeDeError(e) }));
    return () => {
      vigente = false;
    };
  }, [necesitaAnio, ramaId, grupoId, sinConexion, clave]);
  const extra = necesitaAnio && anterior?.clave === clave ? anterior : null;

  const eventos = useMemo(() => {
    if (!snapshot) return new Map<FechaISO, EventoCalendario[]>();
    const unir = <T extends { id: string | null }>(a: T[], b: T[]) => [...a, ...b.filter((x) => !x.id || !a.some((y) => y.id === x.id))];
    const colores = new Map(snapshot.tiposActividad.map((t) => [t.id, t.color]));
    return eventosPorDia(rango[0], rango[1], {
      actividades: unir(actividades, extra?.actividades ?? []),
      colorDeTipo: (id) => colores.get(id) ?? '#4A5247',
      fichas: snapshot.fichas,
      feriados: [...snapshot.feriados, ...(extra?.feriados ?? []).filter((f) => !snapshot.feriados.some((g) => g.fecha === f.fecha && g.nombre === f.nombre))],
      recordatorios: unir(snapshot.recordatorios, extra?.recordatorios ?? []),
    });
  }, [snapshot, actividades, extra, rango]);

  if (!contexto) return null;
  if (!snapshot) return <Pantalla>{sinConexion ? <Aviso tipo="aviso">Sin conexión y sin datos guardados de esta rama.</Aviso> : <Cargando />}</Pantalla>;
  if (!tienePermiso(contexto.permisos, 'calendario', 'ver')) {
    return (
      <Pantalla>
        <Parrafo>Tu rol no tiene permiso para ver el calendario.</Parrafo>
      </Pantalla>
    );
  }

  const mover = (sentido: 1 | -1) => {
    if (vista === 'dia') return setDia(sumarDias(dia, sentido));
    if (vista === 'semana') return setDia(sumarDias(dia, 7 * sentido));
    const m = mes + sentido;
    const [a, nm] = m < 1 ? [anio - 1, 12] : m > 12 ? [anio + 1, 1] : [anio, m];
    setDia(aISO(a, nm, Math.min(partesFecha(dia).dia, diasEnMes(a, nm))));
  };
  const titulo =
    vista === 'mes' ? `${NOMBRES_MES[mes - 1]} ${anio}` : vista === 'semana' ? `Semana del ${formatearFecha(rango[0])}` : nombreDia(dia);

  const abrir = async (e: EventoCalendario) => {
    if (e.tipo === 'actividad') router.push(`/actividad/${e.actividad.id}`);
    else if (e.tipo === 'cumpleanios') router.push(`/ficha/${e.fichaId}`);
    else if (e.tipo === 'recordatorio') {
      if (sinConexion) return setMensaje('Borrar un recordatorio requiere conexión.');
      if (!(await confirmar('Borrar recordatorio', `"${e.titulo}" se borra de tu calendario.`, 'Borrar'))) return;
      try {
        await api.delete(`/recordatorios/${e.recordatorio.id}`);
        await recargar();
      } catch (x) {
        setMensaje(mensajeDeError(x));
      }
    }
  };

  const listaDia = (d: FechaISO) => {
    const lista = eventos.get(d) ?? [];
    return lista.length === 0 ? (
      <Parrafo suave>Sin eventos.</Parrafo>
    ) : (
      lista.map((e, i) => <FilaEvento key={`${d}-${i}`} evento={e} onPress={e.tipo === 'feriado' ? undefined : () => void abrir(e)} />)
    );
  };

  return (
    <>
      <Pantalla>
        <View style={{ flexDirection: 'row', gap: espacio.s, flexWrap: 'wrap' }}>
          {(['mes', 'semana', 'dia'] as const).map((v) => (
            <Marca key={v} etiqueta={v === 'mes' ? 'Mes' : v === 'semana' ? 'Semana' : 'Día'} activa={vista === v} onPress={() => setVista(v)} etiquetaAccesible={`Vista ${v}`} />
          ))}
        </View>
        <View style={e.navegacion}>
          <Boton titulo="‹" variante="secundario" onPress={() => mover(-1)} etiquetaAccesible="Anterior" />
          <Text style={e.titulo} accessibilityRole="header">
            {titulo}
          </Text>
          <Boton titulo="›" variante="secundario" onPress={() => mover(1)} etiquetaAccesible="Siguiente" />
        </View>
        <View style={{ flexDirection: 'row', gap: espacio.s }}>
          <Boton titulo="Hoy" variante="texto" onPress={() => setDia(hoy)} />
          <Boton titulo="+ Recordatorio" variante="texto" onPress={() => setCreando(true)} deshabilitado={sinConexion} />
        </View>
        {sinConexion && necesitaAnio ? <Aviso tipo="aviso">Sin conexión: en el celular están guardados los últimos 60 días y lo que viene.</Aviso> : null}
        {extra?.error ? <Aviso tipo="error">{extra.error}</Aviso> : null}
        {mensaje ? <Aviso tipo="aviso">{mensaje}</Aviso> : null}

        {vista === 'mes' ? (
          <>
            <Mes semanas={semanasDelMes(anio, mes)} mes={mes} hoy={hoy} elegido={dia} eventos={eventos} alElegir={setDia} />
            <Subtitulo>{nombreDia(dia)}</Subtitulo>
            {listaDia(dia)}
          </>
        ) : vista === 'semana' ? (
          Array.from({ length: 7 }, (_, i) => sumarDias(rango[0], i)).map((d) => (
            <View key={d} style={{ gap: espacio.s }}>
              <Subtitulo>{`${nombreDia(d)}${d === hoy ? ' (hoy)' : ''}`}</Subtitulo>
              {listaDia(d)}
            </View>
          ))
        ) : (
          listaDia(dia)
        )}
        <Leyenda />
      </Pantalla>
      <ModalRecordatorio
        visible={creando}
        dia={dia}
        cerrar={() => setCreando(false)}
        guardar={async (r) => {
          await api.post('/recordatorios', { grupoId: contexto.grupoId, ...r });
          await recargar();
          setCreando(false);
        }}
      />
    </>
  );
}

function Mes({
  semanas,
  mes,
  hoy,
  elegido,
  eventos,
  alElegir,
}: {
  semanas: FechaISO[][];
  mes: number;
  hoy: FechaISO;
  elegido: FechaISO;
  eventos: Map<FechaISO, EventoCalendario[]>;
  alElegir: (d: FechaISO) => void;
}) {
  return (
    <View>
      <View style={e.fila}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <Text key={i} style={e.cabecera} aria-hidden>
            {d}
          </Text>
        ))}
      </View>
      {semanas.map((s) => (
        <View key={s[0]} style={e.fila}>
          {s.map((d) => {
            const lista = eventos.get(d) ?? [];
            const otroMes = partesFecha(d).mes !== mes;
            return (
              <Pressable
                key={d}
                onPress={() => alElegir(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: d === elegido }}
                accessibilityLabel={`${nombreDia(d)}: ${lista.length ? lista.map((x) => x.titulo).join(', ') : 'sin eventos'}`}
                style={[e.celda, d === elegido && { borderColor: colores.primario, backgroundColor: colores.primarioSuave }]}
              >
                <Text style={[e.numero, otroMes && { color: colores.textoSuave }, d === hoy && e.hoy]}>{partesFecha(d).dia}</Text>
                {lista.slice(0, 3).map((x, i) => (
                  <View key={i} style={[e.barra, { backgroundColor: colorEvento(x) }]} />
                ))}
                {lista.length > 3 ? <Text style={e.mas}>+{lista.length - 3}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function FilaEvento({ evento, onPress }: { evento: EventoCalendario; onPress?: () => void }) {
  const cancelada = evento.tipo === 'actividad' && !!evento.actividad.canceladaEn;
  const contenido = (
    <>
      <View style={[e.franja, { backgroundColor: colorEvento(evento) }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[e.nombre, cancelada && { textDecorationLine: 'line-through' }]}>
          {evento.hora ? `${evento.hora} · ` : ''}
          {evento.titulo}
        </Text>
        <Text style={e.detalle}>{etiquetaEvento(evento)}</Text>
      </View>
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${evento.titulo}, ${etiquetaEvento(evento)}`} style={({ pressed }) => [e.evento, pressed && { backgroundColor: colores.primarioSuave }]}>
      {contenido}
    </Pressable>
  ) : (
    <View style={e.evento} accessible accessibilityLabel={`${evento.titulo}, ${etiquetaEvento(evento)}`}>
      {contenido}
    </View>
  );
}

function Leyenda() {
  const items: [string, string][] = [
    [colores.info, 'Cumpleaños'],
    [colores.peligro, 'Feriado'],
    [colores.textoSuave, 'Recordatorio'],
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.m, marginTop: espacio.m }}>
      <Text style={e.detalle}>Las actividades llevan el color de su tipo.</Text>
      {items.map(([c, t]) => (
        <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.xs }}>
          <View style={[e.barra, { backgroundColor: c, width: 16 }]} />
          <Text style={e.detalle}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

/** RF-077: recordatorio personal, que solo ve quien lo crea. */
function ModalRecordatorio({ visible, dia, cerrar, guardar }: { visible: boolean; dia: FechaISO; cerrar(): void; guardar(r: { fecha: FechaISO; hora: string | null; titulo: string }): Promise<void> }) {
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState<string | null>(null);
  const [hora, setHora] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const fechaTexto = fecha ?? formatearFecha(dia);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cerrar}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colores.fondo }}>
        <Pantalla>
          <Subtitulo>Nuevo recordatorio</Subtitulo>
          <Parrafo suave>Solo lo ves vos.</Parrafo>
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <Campo etiqueta="Qué" obligatorio value={titulo} onChangeText={setTitulo} placeholder="Llamar a la sede" />
          <Campo etiqueta="Fecha" obligatorio value={fechaTexto} onChangeText={setFecha} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />
          <Campo etiqueta="Hora" value={hora} onChangeText={setHora} placeholder="Opcional (hh:mm)" keyboardType="numbers-and-punctuation" />
          <Boton
            titulo="Guardar"
            cargando={guardando}
            onPress={async () => {
              const f = interpretarFecha(fechaTexto, hoyAR());
              const h = hora.trim() ? interpretarHora(hora) : null;
              if (!titulo.trim()) return setError('Escribí qué querés recordar');
              if (!f) return setError('Fecha inválida (dd/mm/aaaa)');
              if (hora.trim() && !h) return setError('Hora inválida (hh:mm)');
              setError(null);
              setGuardando(true);
              try {
                await guardar({ fecha: f, hora: h, titulo: titulo.trim() });
                setTitulo('');
                setFecha(null);
                setHora('');
              } catch (x) {
                setError(mensajeDeError(x));
              } finally {
                setGuardando(false);
              }
            }}
          />
          <Boton titulo="Cancelar" variante="secundario" onPress={cerrar} />
        </Pantalla>
      </SafeAreaView>
    </Modal>
  );
}

const e = StyleSheet.create({
  navegacion: { flexDirection: 'row', alignItems: 'center', gap: espacio.s },
  titulo: { flex: 1, textAlign: 'center', fontSize: texto.grande, fontWeight: '700', color: colores.texto, textTransform: 'capitalize' },
  fila: { flexDirection: 'row' },
  cabecera: { flex: 1, textAlign: 'center', fontSize: texto.chico, fontWeight: '700', color: colores.textoSuave, paddingVertical: espacio.xs },
  celda: { flex: 1, minHeight: TACTIL_MINIMO + 8, borderWidth: 1, borderColor: colores.bordeSuave, backgroundColor: colores.superficie, padding: 2, gap: 2, alignItems: 'center' },
  numero: { fontSize: texto.normal - 1, color: colores.texto, fontWeight: '600' },
  hoy: { color: colores.primarioTexto, backgroundColor: colores.primario, borderRadius: 12, paddingHorizontal: 6, overflow: 'hidden' },
  barra: { height: 5, alignSelf: 'stretch', borderRadius: 3 },
  mas: { fontSize: 12, color: colores.textoSuave },
  evento: { flexDirection: 'row', gap: espacio.m, alignItems: 'stretch', backgroundColor: colores.superficie, borderRadius: 8, borderWidth: 1, borderColor: colores.bordeSuave, padding: espacio.m, minHeight: TACTIL_MINIMO },
  franja: { width: 6, borderRadius: 3 },
  nombre: { fontSize: texto.normal, fontWeight: '700', color: colores.texto },
  detalle: { fontSize: texto.chico, color: colores.textoSuave },
});
