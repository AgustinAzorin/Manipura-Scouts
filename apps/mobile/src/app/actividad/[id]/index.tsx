import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  estadoActividad,
  faltaAutorizacion,
  formatearFechaHora,
  formatearRango,
  hoyAR,
  NOMBRE_ANTELACION,
  NOMBRE_CONFIRMACION,
  tienePermiso,
  totalesActividad,
  type Confirmacion,
  type InscripcionDTO,
} from '@scouttracker/shared';
import { api, mensajeDeError } from '../../../lib/api';
import { nombreInscripto, useActividad } from '../../../lib/actividades';
import { useDatos } from '../../../lib/datos';
import { useSesion } from '../../../lib/sesion';
import { EtiquetaTipo, Marca, NOMBRE_ESTADO_ACTIVIDAD, Totales } from '../../../ui/actividades';
import { avisar, Aviso, Boton, Cargando, confirmar, Pantalla, Parrafo } from '../../../ui/componentes';
import { colores, espacio, TACTIL_MINIMO, texto } from '../../../ui/tema';

const SIGUIENTE_CONFIRMACION: Record<Confirmacion, Confirmacion> = { sinRespuesta: 'va', va: 'noVa', noVa: 'sinRespuesta' };

type Filtro = 'todos' | 'van' | 'faltanLlegar';

/**
 * RF-071: vista de control en el lugar. Por inscripto, la confirmación, la asistencia y la
 * autorización, con los totales. La asistencia y la autorización se marcan sin conexión
 * (RF-058, RF-059) y se envían solas al volver la señal (RF-057).
 */
export default function VistaActividad() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { contexto } = useSesion();
  const { snapshot, sinConexion, pendientes, registrar, registrarEnLinea, rechazados, descartarRechazados, recargar } = useDatos();
  const { actividad, tipo, guardada, error } = useActividad(id);
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'aviso'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const requiere = !!tipo?.requiereAutorizacion;
  const totales = useMemo(() => (actividad ? totalesActividad(actividad.inscripciones, requiere) : null), [actividad, requiere]);
  const equipos = useMemo(() => new Map(snapshot?.rama.equipos.map((e) => [e.id, e.nombre]) ?? []), [snapshot]);

  if (!actividad || !contexto || !totales) return <Pantalla>{error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />}</Pantalla>;

  const estado = estadoActividad(actividad);
  const cancelada = estado === 'cancelada';
  const p = contexto.permisos;
  const puedeRegistrar = tienePermiso(p, 'actividades', 'editar') && guardada && !cancelada;
  const veAutorizaciones = requiere && actividad.inscripciones.some((i) => i.autorizacion);
  const propios = pendientes.filter((r) => r.actividadId === actividad.id).length;

  const lista = actividad.inscripciones.filter((i) =>
    filtro === 'van' ? i.confirmacion === 'va' : filtro === 'faltanLlegar' ? i.confirmacion === 'va' && !i.presente : true,
  );

  const marcarPresente = (i: InscripcionDTO) => {
    const valor = !i.presente;
    registrar({ actividadId: actividad.id, fichaId: i.fichaId, campo: 'presente', valor, anterior: i.presente });
    // RF-066: se avisa, pero el presente queda registrado.
    if (valor && faltaAutorizacion(i, requiere)) {
      avisar('Falta la autorización', `${nombreInscripto(i)} no presentó la autorización para esta actividad. El presente quedó registrado igual.`);
    }
  };

  const marcarAutorizacion = (i: InscripcionDTO) => {
    if (!i.autorizacion) return;
    const valor = i.autorizacion.estado === 'presentada' ? 'noPresentada' : 'presentada';
    registrar({ actividadId: actividad.id, fichaId: i.fichaId, campo: 'autorizacion', valor, anterior: i.autorizacion.estado, fecha: valor === 'presentada' ? hoyAR() : null });
  };

  const cambiarConfirmacion = async (i: InscripcionDTO) => {
    // RF-055: la confirmación previa no está entre lo que se registra sin conexión.
    if (sinConexion) {
      setMensaje({ tipo: 'aviso', texto: 'La confirmación (va / no va) requiere conexión. Sin señal podés marcar asistencia y autorizaciones.' });
      return;
    }
    setMensaje(null);
    setOcupado(`conf:${i.fichaId}`);
    try {
      const r = await registrarEnLinea({ actividadId: actividad.id, fichaId: i.fichaId, campo: 'confirmacion', valor: SIGUIENTE_CONFIRMACION[i.confirmacion], anterior: i.confirmacion });
      if (r.estado !== 'aplicado') setMensaje({ tipo: 'aviso', texto: r.motivo ?? 'No se pudo guardar la confirmación' });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(e) });
    } finally {
      setOcupado(null);
    }
  };

  const cancelar = async () => {
    if (!(await confirmar('Cancelar actividad', `"${actividad.nombre}" queda visible como cancelada y ya no se registra asistencia.`, 'Cancelar actividad'))) return;
    setOcupado('cancelar');
    try {
      await api.post(`/actividades/${actividad.id}/cancelar`);
      await recargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(e) });
    } finally {
      setOcupado(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colores.fondo }} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: actividad.nombre }} />
      <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
        {sinConexion && snapshot ? (
          <View style={e.franja} accessibilityRole="alert">
            <Text style={e.textoFranja}>Sin conexión. Datos al {formatearFechaHora(snapshot.generadoEn)}</Text>
          </View>
        ) : null}
        <View style={{ gap: espacio.xs }}>
          <View style={{ flexDirection: 'row', gap: espacio.s, alignItems: 'center', flexWrap: 'wrap' }}>
            <EtiquetaTipo tipo={tipo} />
            <Text style={[e.estado, cancelada && { color: colores.peligro }]}>{NOMBRE_ESTADO_ACTIVIDAD[estado]}</Text>
          </View>
          <Text style={e.detalle}>{formatearRango(actividad.inicio, actividad.fin)}</Text>
          {actividad.lugar ? <Text style={e.detalle}>{actividad.lugar}</Text> : null}
          {actividad.avisos.length ? <Text style={e.detalle}>Avisos: {actividad.avisos.map((a) => NOMBRE_ANTELACION[a].toLowerCase()).join(' y ')}</Text> : null}
        </View>

        {cancelada ? <Aviso tipo="error">Actividad cancelada.</Aviso> : null}
        {!guardada ? <Aviso tipo="info">Actividad anterior a lo que se guarda en el celular: solo se puede consultar.</Aviso> : null}
        {propios ? (
          <Aviso tipo="info">{propios === 1 ? '1 registro sin enviar' : `${propios} registros sin enviar`}: se envían solos cuando haya conexión, aunque cierres la app.</Aviso>
        ) : null}
        {rechazados.length ? (
          <View style={{ gap: espacio.s }}>
            <Aviso tipo="error">
              El servidor no aceptó {rechazados.length === 1 ? 'un registro' : `${rechazados.length} registros`}: {[...new Set(rechazados.map((r) => r.motivo))].join('; ')}
            </Aviso>
            <Boton titulo="Entendido" variante="secundario" onPress={descartarRechazados} />
          </View>
        ) : null}
        {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}

        <Totales
          items={[
            { etiqueta: 'Inscriptos', valor: totales.inscriptos },
            { etiqueta: 'Van', valor: totales.confirmados },
            { etiqueta: 'Presentes', valor: totales.presentes },
            ...(totales.sinAutorizacion !== null ? [{ etiqueta: 'Sin autorización', valor: totales.sinAutorizacion, alerta: true }] : []),
          ]}
        />

        <View style={{ flexDirection: 'row', gap: espacio.s, flexWrap: 'wrap' }}>
          {(
            [
              ['todos', `Todos (${totales.inscriptos})`],
              ['van', `Van (${totales.confirmados})`],
              ['faltanLlegar', 'Van y faltan llegar'],
            ] as const
          ).map(([f, t]) => (
            <Marca key={f} etiqueta={t} activa={filtro === f} onPress={() => setFiltro(f)} etiquetaAccesible={`Mostrar ${t}`} />
          ))}
        </View>

        {lista.length === 0 ? <Parrafo suave>{actividad.inscripciones.length ? 'Nadie coincide con el filtro.' : 'La actividad no tiene inscriptos.'}</Parrafo> : null}
        {lista.map((i) => {
          const falta = faltaAutorizacion(i, requiere);
          const senalada = i.presente && falta;
          const nombre = nombreInscripto(i);
          return (
            <View key={i.fichaId} style={[e.fila, senalada && { borderColor: colores.aviso, backgroundColor: colores.avisoSuave }]}>
              <Text style={e.nombre}>{nombre}</Text>
              <Text style={e.detalle}>
                {[i.equipoId ? equipos.get(i.equipoId) : null, senalada ? '⚠ Presente sin autorización' : null].filter(Boolean).join(' · ') || ' '}
              </Text>
              <View style={e.controles}>
                <Boton
                  titulo={NOMBRE_CONFIRMACION[i.confirmacion]}
                  variante={i.confirmacion === 'va' ? 'primario' : 'secundario'}
                  onPress={() => void cambiarConfirmacion(i)}
                  deshabilitado={!puedeRegistrar}
                  cargando={ocupado === `conf:${i.fichaId}`}
                  etiquetaAccesible={`Confirmación de ${nombre}: ${NOMBRE_CONFIRMACION[i.confirmacion]}. Tocá para cambiar.`}
                  estilo={{ flexGrow: 1, minWidth: 110 }}
                />
                <Marca etiqueta="Presente" activa={i.presente} onPress={() => marcarPresente(i)} deshabilitada={!puedeRegistrar} etiquetaAccesible={`${nombre} presente`} />
                {veAutorizaciones && i.autorizacion ? (
                  <Marca
                    etiqueta="Autorización"
                    activa={i.autorizacion.estado === 'presentada'}
                    onPress={() => marcarAutorizacion(i)}
                    deshabilitada={!puedeRegistrar}
                    etiquetaAccesible={`Autorización de ${nombre} presentada`}
                  />
                ) : null}
              </View>
              {veAutorizaciones && i.autorizacion && guardada ? (
                <Boton
                  titulo={i.autorizacion.archivo ? 'Ver autorización' : 'Fecha o archivo de la autorización'}
                  variante="texto"
                  onPress={() => router.push(`/actividad/${actividad.id}/autorizacion?ficha=${i.fichaId}`)}
                  etiquetaAccesible={`Fecha o archivo de la autorización de ${nombre}`}
                />
              ) : null}
            </View>
          );
        })}

        <View style={{ gap: espacio.s, marginTop: espacio.l }}>
          <Boton titulo="Reporte de asistencia" variante="secundario" onPress={() => router.push(`/actividad/${actividad.id}/reporte`)} />
          {tienePermiso(p, 'fichaActividad', 'ver') ? (
            <Boton titulo="Ficha de Actividad" variante="secundario" onPress={() => router.push(`/actividad/${actividad.id}/ficha`)} deshabilitado={sinConexion} />
          ) : null}
          {tienePermiso(p, 'actividades', 'editar') && !cancelada && guardada ? (
            <>
              <Boton titulo="Editar actividad" variante="secundario" onPress={() => router.push(`/actividad/${actividad.id}/editar`)} deshabilitado={sinConexion} />
              <Boton titulo="Agregar o quitar inscriptos" variante="secundario" onPress={() => router.push(`/actividad/${actividad.id}/inscriptos`)} deshabilitado={sinConexion} />
            </>
          ) : null}
          {tienePermiso(p, 'actividades', 'eliminar') && !cancelada && guardada ? (
            <Boton titulo="Cancelar actividad" variante="peligro" onPress={() => void cancelar()} deshabilitado={sinConexion} cargando={ocupado === 'cancelar'} />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  contenido: { padding: espacio.l, gap: espacio.m, paddingBottom: espacio.xxl },
  franja: { backgroundColor: colores.aviso, padding: espacio.s, borderRadius: 8 },
  textoFranja: { color: colores.primarioTexto, fontWeight: '700', fontSize: texto.normal - 1, textAlign: 'center' },
  estado: { fontSize: texto.chico, fontWeight: '700', color: colores.textoSuave },
  detalle: { fontSize: texto.normal - 1, color: colores.textoSuave },
  fila: { backgroundColor: colores.superficie, borderRadius: 12, borderWidth: 2, borderColor: colores.bordeSuave, padding: espacio.m, gap: espacio.xs },
  nombre: { fontSize: texto.normal, fontWeight: '700', color: colores.texto },
  controles: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, alignItems: 'center', minHeight: TACTIL_MINIMO },
});
