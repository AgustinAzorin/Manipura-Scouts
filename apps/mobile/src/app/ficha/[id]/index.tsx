import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import {
  CONCEPTOS_CUOTA,
  DEF_CAMPOS,
  DEF_DOCUMENTO,
  NOMBRE_CONCEPTO_CUOTA,
  NOMBRE_ESTADO_CUOTA,
  NOMBRE_ESTADO_DOCUMENTO,
  NOMBRE_SECCION,
  SECCIONES,
  diaCumpleanios,
  edadDe,
  estadoTadaDe,
  formatearEdad,
  formatearFecha,
  hoyAR,
  NOMBRE_ESTADO_TADA,
  nombreCompleto,
  porcentajeAsistencia,
  tienePermiso,
  valorColumna,
  type CampoFicha,
  type Seccion,
} from '@scouttracker/shared';
import { api, mensajeDeError } from '../../../lib/api';
import { useDatos } from '../../../lib/datos';
import { useFicha } from '../../../lib/fichas';
import { Logo } from '../../../lib/logos';
import { useSesion } from '../../../lib/sesion';
import { Aviso, Boton, Cargando, confirmar, Dato, Pantalla, Parrafo, Selector, Subtitulo, Tarjeta } from '../../../ui/componentes';
import { colores, espacio } from '../../../ui/tema';

const CAMPO_A_COLUMNA: Partial<Record<CampoFicha, string>> = {
  equipoId: 'equipo',
  elementoId: 'elemento',
  promesaId: 'promesa',
  etapaId: 'etapa',
  religionId: 'religion',
  categoriaMiembroId: 'categoriaMiembro',
  raidId: 'raid',
  guardianId: 'guardian',
  ingresoMovimientoId: 'ingresoMovimiento',
  cordi: 'cordi',
};

/** RF-035: ficha en secciones. Funciona sin conexión con los datos guardados. */
export default function DetalleFicha() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { contexto, yo } = useSesion();
  const { snapshot, indice, sinConexion: sinConexionNomina, quitarFicha } = useDatos();
  const { ficha, error, sinConexion, setFicha } = useFicha(id);
  const router = useRouter();
  const [accion, setAccion] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [ramaPase, setRamaPase] = useState<string | null>(null);

  if (!ficha || !snapshot || !indice || !contexto) {
    return <Pantalla>{error ? <Aviso tipo="error">{error}</Aviso> : sinConexion ? <Aviso tipo="aviso">Esta ficha no está guardada en el celular y no hay conexión.</Aviso> : <Cargando />}</Pantalla>;
  }

  const hoy = hoyAR();
  const offline = sinConexion || sinConexionNomina;
  const ocultos = new Set<string>(snapshot.rama.camposOcultos);
  const p = contexto.permisos;
  const activa = ficha.estado === 'activa' || ficha.estado === 'incompleta';
  const esAdminGrupo = !!yo?.gruposAdministrables.some((g) => g.grupoId === ficha.grupoId);
  const edad = edadDe(ficha, hoy);
  const tada = estadoTadaDe(ficha, hoy);
  const nombre = nombreCompleto(ficha) || '(sin nombre)';

  const valorDe = (c: CampoFicha): string => {
    const col = CAMPO_A_COLUMNA[c];
    if (col) return valorColumna(ficha, col, indice, hoy).texto;
    const v = ficha[c];
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (c === 'fechaNacimiento' || c === 'fechaRevisionDiario') return formatearFecha(String(v));
    return String(v);
  };

  const ejecutar = async (nombreAccion: string, fn: () => Promise<void>) => {
    setErrorAccion(null);
    setAccion(nombreAccion);
    try {
      await fn();
    } catch (e) {
      setErrorAccion(mensajeDeError(e));
    } finally {
      setAccion(null);
    }
  };

  const telefono = (t: string | null | undefined, etiqueta: string) =>
    t ? (
      <Dato
        key={etiqueta}
        etiqueta={etiqueta}
        valor={t}
        accion={<Boton titulo="Llamar" variante="secundario" onPress={() => Linking.openURL(`tel:${t}`)} etiquetaAccesible={`Llamar al ${etiqueta}`} />}
      />
    ) : (
      <Dato key={etiqueta} etiqueta={etiqueta} valor="" />
    );

  const seccion = (s: Seccion) => {
    const campos = DEF_CAMPOS.filter((d) => d.seccion === s && !ocultos.has(d.clave) && (snapshot.contexto.verSensibles || !d.sensible));
    const propios = snapshot.rama.camposPropios.filter((c) => c.activo && c.seccion === s && (snapshot.contexto.verSensibles || !c.sensible));
    const extra: React.ReactNode[] = [];
    if (s === 'datosPersonales') {
      extra.push(<Dato key="edad" etiqueta="Edad" valor={formatearEdad(edad)} />);
      extra.push(<Dato key="cumple" etiqueta="Cumpleaños" valor={diaCumpleanios(ficha.fechaNacimiento)} />);
    }
    if (s === 'progresion' && !ocultos.has('tieneTada')) {
      extra.push(<Dato key="tada" etiqueta="Estado de TADA" valor={tada ? NOMBRE_ESTADO_TADA[tada] : ''} />);
    }
    if (campos.length + propios.length + extra.length === 0) return null;
    return (
      <Tarjeta key={s}>
        <Subtitulo>{NOMBRE_SECCION[s]}</Subtitulo>
        {campos.map((d) => {
          if (d.tipo === 'telefono') return telefono(ficha[d.clave] as string | null, d.etiqueta);
          const conLogo = d.clave === 'elementoId' || d.clave === 'promesaId' || d.clave === 'equipoId';
          const v = conLogo ? valorColumna(ficha, CAMPO_A_COLUMNA[d.clave]!, indice, hoy) : null;
          return (
            <Dato
              key={d.clave}
              etiqueta={d.etiqueta}
              valor={
                conLogo && v?.texto ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s }}>
                    <Logo id={v.logo} tamano={28} />
                    <Parrafo>{`${v.texto}${v.inactivo ? ' (inactivo)' : ''}`}</Parrafo>
                  </View>
                ) : (
                  valorDe(d.clave)
                )
              }
            />
          );
        })}
        {propios.map((c) => {
          const v = ficha.camposPropios[c.id];
          const texto = v === undefined || v === null ? '' : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : c.tipo === 'fecha' ? formatearFecha(String(v)) : String(v);
          return <Dato key={c.id} etiqueta={c.nombre} valor={texto} />;
        })}
        {extra}
      </Tarjeta>
    );
  };

  const emergencia = ficha.telEmergencia1 ?? ficha.telEmergencia2;

  return (
    <Pantalla>
      <Stack.Screen options={{ title: nombre }} />
      {offline ? <Aviso tipo="aviso">Sin conexión: estás viendo los datos guardados. Para modificar la ficha hace falta conexión.</Aviso> : null}
      {ficha.estado === 'archivada' ? <Aviso tipo="aviso">Ficha archivada (ex integrante).</Aviso> : null}
      {ficha.estado === 'incompleta' ? (
        <Aviso tipo="aviso">Ficha incompleta: {ficha.incompletaMotivos.join('; ')}</Aviso>
      ) : null}
      {errorAccion ? <Aviso tipo="error">{errorAccion}</Aviso> : null}

      {/* Acceso rápido al teléfono de emergencia (RNF-030). */}
      {emergencia && snapshot.contexto.verSensibles ? (
        <Tarjeta estilo={{ borderColor: colores.peligro, borderWidth: 2 }}>
          <Dato etiqueta="Teléfono de emergencia" valor={emergencia} />
          <Boton titulo={`Llamar al ${emergencia}`} variante="peligro" onPress={() => Linking.openURL(`tel:${emergencia}`)} />
        </Tarjeta>
      ) : null}

      <View style={{ flexDirection: 'row', gap: espacio.s, flexWrap: 'wrap' }}>
        {activa && tienePermiso(p, 'padron', 'editar') ? (
          <Boton titulo="Editar" onPress={() => router.push(`/ficha/${ficha.id}/editar`)} deshabilitado={offline} estilo={{ flex: 1 }} />
        ) : null}
        <Boton titulo="Historial" variante="secundario" onPress={() => router.push(`/ficha/${ficha.id}/historial`)} deshabilitado={offline} estilo={{ flex: 1 }} />
      </View>

      {/* RF-069: asistencia del año calendario. */}
      {tienePermiso(p, 'actividades', 'ver') && snapshot.asistenciaAnio[ficha.id]?.total ? (
        <Tarjeta>
          <Dato
            etiqueta={`Asistencia ${hoy.slice(0, 4)}`}
            valor={`${porcentajeAsistencia(snapshot.asistenciaAnio[ficha.id])}% (presente en ${snapshot.asistenciaAnio[ficha.id]!.presentes} de ${snapshot.asistenciaAnio[ficha.id]!.total} actividades)`}
          />
        </Tarjeta>
      ) : null}

      {SECCIONES.filter((s) => s !== 'administrativa' && s !== 'documentos').map(seccion)}

      {ficha.cuotas ? (
        <Tarjeta>
          <Subtitulo>{NOMBRE_SECCION.administrativa}: cuotas</Subtitulo>
          {CONCEPTOS_CUOTA.map((c) => (
            <Dato key={c} etiqueta={NOMBRE_CONCEPTO_CUOTA[c]} valor={ficha.cuotas![c] ? NOMBRE_ESTADO_CUOTA[ficha.cuotas![c]!] : 'Sin dato'} />
          ))}
        </Tarjeta>
      ) : null}

      {ficha.documentos ? (
        <Tarjeta>
          <Subtitulo>{NOMBRE_SECCION.documentos}</Subtitulo>
          {ficha.documentos.map((d) => (
            <View key={d.tipo} style={{ borderTopWidth: 1, borderTopColor: colores.bordeSuave, paddingTop: espacio.s, gap: espacio.xs }}>
              <Dato
                etiqueta={DEF_DOCUMENTO[d.tipo].nombre}
                valor={`${NOMBRE_ESTADO_DOCUMENTO[d.estado]}${d.fechaEntrega ? ` · ${formatearFecha(d.fechaEntrega)}` : ''}${d.archivo ? ` · ${d.archivo.nombre}` : ''}`}
              />
              <Boton titulo="Ver o cambiar" variante="secundario" onPress={() => router.push(`/ficha/${ficha.id}/documento?tipo=${d.tipo}`)} etiquetaAccesible={`Ver o cambiar ${DEF_DOCUMENTO[d.tipo].nombre}`} />
            </View>
          ))}
        </Tarjeta>
      ) : null}

      {!offline ? (
        <Tarjeta>
          <Subtitulo>Acciones</Subtitulo>
          {activa && tienePermiso(p, 'padron', 'eliminar') ? (
            <Boton
              titulo="Dar de baja (archivar)"
              variante="secundario"
              cargando={accion === 'archivar'}
              onPress={async () => {
                if (!(await confirmar('Dar de baja', `${nombre} deja de aparecer en la nómina y pasa a ex integrantes. Se puede reactivar.`, 'Dar de baja'))) return;
                await ejecutar('archivar', async () => {
                  const f = await api.post<typeof ficha>(`/fichas/${ficha.id}/archivar`);
                  setFicha(f);
                  quitarFicha(ficha.id);
                });
              }}
            />
          ) : null}
          {ficha.estado === 'archivada' && tienePermiso(p, 'padron', 'crear') ? (
            <Boton titulo="Reactivar" cargando={accion === 'reactivar'} onPress={() => ejecutar('reactivar', async () => setFicha(await api.post(`/fichas/${ficha.id}/reactivar`)))} />
          ) : null}
          {activa && tienePermiso(p, 'padron', 'editar') && yo ? (
            <>
              <Selector
                etiqueta="Pase de rama"
                valor={ramaPase}
                alCambiar={(v) => setRamaPase(v as string | null)}
                textoVacio="Elegí la rama de destino"
                opciones={yo.contextos.filter((c) => c.grupoId === ficha.grupoId && c.ramaId !== ficha.ramaId).map((c) => ({ valor: c.ramaId, etiqueta: c.ramaNombre }))}
              />
              {ramaPase ? (
                <Boton
                  titulo="Hacer el pase"
                  cargando={accion === 'pase'}
                  onPress={async () => {
                    if (!(await confirmar('Pase de rama', 'La ficha pasa a la otra rama con su historial. Pierde el equipo y los valores de catálogo que no existan en la rama de destino.', 'Hacer el pase'))) return;
                    await ejecutar('pase', async () => {
                      await api.post(`/fichas/${ficha.id}/pase`, { ramaId: ramaPase });
                      quitarFicha(ficha.id);
                      router.back();
                    });
                  }}
                />
              ) : null}
            </>
          ) : null}
          {esAdminGrupo ? (
            <Boton
              titulo="Suprimir datos definitivamente"
              variante="peligro"
              cargando={accion === 'suprimir'}
              onPress={async () => {
                if (!(await confirmar('Suprimir datos', `Se borran para siempre la ficha de ${nombre}, sus documentos, su historial y sus archivos. No se puede deshacer. Usalo solo ante un pedido de supresión (Ley 25.326).`, 'Suprimir'))) return;
                await ejecutar('suprimir', async () => {
                  await api.delete(`/fichas/${ficha.id}`, { confirmar: true });
                  quitarFicha(ficha.id);
                  router.back();
                });
              }}
            />
          ) : null}
        </Tarjeta>
      ) : null}
    </Pantalla>
  );
}
