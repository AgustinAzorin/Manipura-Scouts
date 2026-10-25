import { Stack, useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  autorizacionesPendientes,
  cuotasPendientes,
  cumpleaniosDelMes,
  documentosPendientes,
  formatearFecha,
  formatearFechaHora,
  hoyAR,
  NOMBRES_MES,
  nombreCompleto,
  partesFecha,
  proximasActividades,
  tienePermiso,
} from '@scouttracker/shared';
import { useDatos } from '../lib/datos';
import { useAnexosPendientes } from '../lib/fichaActividad';
import { Logo } from '../lib/logos';
import { useSesion } from '../lib/sesion';
import { TarjetaActividad } from '../ui/actividades';
import { Aviso, Boton, Cargando, ItemMenu, Pantalla, Parrafo, Subtitulo } from '../ui/componentes';
import { BotonMenu } from '../ui/encabezado';
import { colores, espacio, TACTIL_MINIMO, texto } from '../ui/tema';

/** Cantidad de próximas actividades que se muestran en el inicio. */
const PROXIMAS = 3;

/** RF-113 y RF-114: resumen de la rama y pendientes. Funciona sin conexión, salvo los anexos. */
export default function Inicio() {
  const { contexto } = useSesion();
  const { snapshot, actividades, sinConexion, error, cargando, recargar } = useDatos();
  const { anexos } = useAnexosPendientes();
  const router = useRouter();
  const hoy = hoyAR();

  const resumen = useMemo(() => {
    if (!snapshot) return null;
    const ahora = new Date();
    return {
      cumpleanios: cumpleaniosDelMes(snapshot.fichas, hoy),
      proximas: proximasActividades(actividades, ahora).slice(0, PROXIMAS),
      incompletas: snapshot.fichas.filter((f) => f.estado === 'incompleta').length,
      documentos: documentosPendientes(snapshot.fichas),
      cuotas: cuotasPendientes(snapshot.fichas),
      autorizaciones: autorizacionesPendientes(actividades, snapshot.tiposActividad, ahora),
    };
  }, [snapshot, actividades, hoy]);

  if (!contexto) return null;
  const encabezado = <Stack.Screen options={{ title: contexto.ramaNombre, headerRight: () => <BotonMenu /> }} />;
  if (!snapshot || !resumen) {
    return (
      <Pantalla>
        {encabezado}
        {error ? <Aviso tipo="error">{error}</Aviso> : null}
        {sinConexion ? <Aviso tipo="aviso">Sin conexión y sin datos guardados de esta rama. Conectate para descargarlos.</Aviso> : <Cargando mensaje="Descargando la rama…" />}
        {sinConexion ? <Boton titulo="Reintentar" onPress={recargar} cargando={cargando} /> : null}
      </Pantalla>
    );
  }

  const p = contexto.permisos;
  const verActividades = tienePermiso(p, 'actividades', 'ver');
  const tipo = (id: string) => snapshot.tiposActividad.find((t) => t.id === id);
  const equipoOculto = (snapshot.rama.camposOcultos as string[]).includes('equipoId');
  const equipos = equipoOculto ? [] : snapshot.rama.equipos.filter((e) => e.activo && (!contexto.soloEquipos || contexto.soloEquipos.includes(e.id)));
  const integrantes = (equipoId: string) => snapshot.fichas.filter((f) => f.equipoId === equipoId).length;
  const total = snapshot.fichas.length;
  const mes = NOMBRES_MES[partesFecha(hoy).mes - 1]!;

  return (
    <Pantalla>
      {encabezado}
      {sinConexion ? <Aviso tipo="aviso">Sin conexión. Datos al {formatearFechaHora(snapshot.generadoEn)}</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${total} protagonistas activos. Ver la nómina`}
        onPress={() => router.push('/nomina')}
        style={({ pressed }) => [e.total, pressed && { opacity: 0.85 }]}
      >
        <Text style={e.totalNumero}>{total}</Text>
        <View style={{ flex: 1 }}>
          <Text style={e.totalTexto}>{total === 1 ? 'protagonista activo' : 'protagonistas activos'}</Text>
          {contexto.comunidad ? <Text style={e.totalDetalle}>{contexto.comunidad}</Text> : null}
        </View>
        <Text style={e.totalTexto} aria-hidden>
          Nómina ›
        </Text>
      </Pressable>

      {/* RF-114: cada contador abre su listado. */}
      <Subtitulo>Pendientes</Subtitulo>
      <View>
        <Contador cantidad={resumen.incompletas} titulo={resumen.incompletas === 1 ? 'ficha incompleta' : 'fichas incompletas'} destino="/incompletas" />
        {resumen.documentos ? (
          <Contador
            cantidad={resumen.documentos.cantidad}
            titulo={resumen.documentos.cantidad === 1 ? 'documento no presentado' : 'documentos no presentados'}
            detalle={resumen.documentos.fichas.length ? `En ${resumen.documentos.fichas.length === 1 ? '1 ficha' : `${resumen.documentos.fichas.length} fichas`}` : undefined}
            destino="/pendientes?tipo=documentos"
          />
        ) : null}
        {resumen.cuotas ? (
          <Contador
            cantidad={resumen.cuotas.cantidad}
            titulo={resumen.cuotas.cantidad === 1 ? 'cuota adeudada' : 'cuotas adeudadas'}
            detalle={resumen.cuotas.fichas.length ? `En ${resumen.cuotas.fichas.length === 1 ? '1 ficha' : `${resumen.cuotas.fichas.length} fichas`}` : undefined}
            destino="/pendientes?tipo=cuotas"
          />
        ) : null}
        <Contador
          cantidad={anexos.length}
          titulo={anexos.length === 1 ? 'anexo tuyo sin completar' : 'anexos tuyos sin completar'}
          detalle={sinConexion ? 'Se actualiza con conexión' : undefined}
          destino="/anexos-pendientes"
        />
        {verActividades && resumen.autorizaciones ? (
          <Contador
            cantidad={resumen.autorizaciones.cantidad}
            titulo={resumen.autorizaciones.cantidad === 1 ? 'autorización faltante' : 'autorizaciones faltantes'}
            detalle={`${resumen.autorizaciones.actividad.nombre} · ${formatearFecha(hoyAR(new Date(resumen.autorizaciones.actividad.inicio)))} · de los que van`}
            destino={`/actividad/${resumen.autorizaciones.actividad.id}`}
          />
        ) : null}
      </View>

      <Subtitulo>Cumpleaños de {mes}</Subtitulo>
      {resumen.cumpleanios.length === 0 ? <Parrafo suave>Nadie cumple años este mes.</Parrafo> : null}
      <View>
        {resumen.cumpleanios.map((c) => (
          <ItemMenu
            key={c.fichaId}
            titulo={`${formatearFecha(c.fecha).slice(0, 5)} · ${nombreCompleto(c) || '(sin nombre)'}`}
            detalle={`${c.fecha === hoy ? '¡Hoy! ' : ''}Cumple ${c.cumple}`}
            onPress={() => router.push(`/ficha/${c.fichaId}`)}
          />
        ))}
      </View>

      {verActividades ? (
        <>
          <Subtitulo>Próximas actividades</Subtitulo>
          {resumen.proximas.length === 0 ? <Parrafo suave>No hay actividades próximas.</Parrafo> : null}
          <View style={{ gap: espacio.m }}>
            {resumen.proximas.map((a) => (
              <TarjetaActividad key={a.id} actividad={a} tipo={tipo(a.tipoId)} onPress={() => router.push(`/actividad/${a.id}`)} />
            ))}
          </View>
          <Boton titulo="Ver todas las actividades" variante="secundario" onPress={() => router.push('/actividades')} />
        </>
      ) : null}

      {equipos.length > 0 ? (
        <>
          <Subtitulo>Equipos</Subtitulo>
          <View style={e.equipos}>
            {equipos.map((eq) => {
              const n = integrantes(eq.id);
              return (
                <Pressable
                  key={eq.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Equipo ${eq.nombre}, ${n === 1 ? '1 integrante' : `${n} integrantes`}`}
                  onPress={() => router.push(`/nomina?equipo=${eq.id}`)}
                  style={({ pressed }) => [e.equipo, pressed && { backgroundColor: colores.primarioSuave }]}
                >
                  <Logo id={eq.logo} tamano={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={e.equipoNombre}>{eq.nombre}</Text>
                    <Text style={e.equipoDetalle}>{n === 1 ? '1 integrante' : `${n} integrantes`}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {tienePermiso(p, 'graficos', 'ver') ? <Boton titulo="Gráficos" variante="secundario" onPress={() => router.push('/graficos')} /> : null}
    </Pantalla>
  );
}

function Contador({ cantidad, titulo, detalle, destino }: { cantidad: number; titulo: string; detalle?: string; destino: Href }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${cantidad} ${titulo}${detalle ? `. ${detalle}` : ''}`}
      onPress={() => router.push(destino)}
      style={({ pressed }) => [e.contador, pressed && { backgroundColor: colores.primarioSuave }]}
    >
      <Text style={[e.contadorNumero, cantidad > 0 && { color: colores.aviso }]}>{cantidad}</Text>
      <View style={{ flex: 1 }}>
        <Text style={e.contadorTitulo}>{titulo}</Text>
        {detalle ? <Text style={e.equipoDetalle}>{detalle}</Text> : null}
      </View>
      <Text style={e.contadorTitulo} aria-hidden>
        ›
      </Text>
    </Pressable>
  );
}

const e = StyleSheet.create({
  total: { flexDirection: 'row', alignItems: 'center', gap: espacio.l, padding: espacio.l, borderRadius: 12, backgroundColor: colores.primario, minHeight: TACTIL_MINIMO },
  totalNumero: { fontSize: 44, fontWeight: '700', color: colores.primarioTexto },
  totalTexto: { fontSize: texto.normal, fontWeight: '700', color: colores.primarioTexto },
  totalDetalle: { fontSize: texto.chico, color: colores.primarioTexto },
  contador: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingHorizontal: espacio.l, paddingVertical: espacio.m, backgroundColor: colores.superficie, borderBottomWidth: 1, borderBottomColor: colores.bordeSuave },
  contadorNumero: { minWidth: 40, fontSize: texto.titulo, fontWeight: '700', color: colores.texto, textAlign: 'right' },
  contadorTitulo: { fontSize: texto.normal, fontWeight: '600', color: colores.texto },
  equipos: { gap: espacio.s },
  equipo: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: espacio.m, padding: espacio.m, borderRadius: 12, borderWidth: 1, borderColor: colores.bordeSuave, backgroundColor: colores.superficie },
  equipoNombre: { fontSize: texto.normal, fontWeight: '700', color: colores.texto },
  equipoDetalle: { fontSize: texto.chico, color: colores.textoSuave },
});
