import { useState } from 'react';
import { View } from 'react-native';
import {
  calcularEdad,
  CODIGOS_ERROR,
  CONCEPTOS_CUOTA,
  DEF_CAMPOS,
  ESTADOS_CUOTA,
  esFechaISO,
  formatearFecha,
  hoyAR,
  interpretarFecha,
  NOMBRE_CONCEPTO_CUOTA,
  NOMBRE_CORDI,
  NOMBRE_ESTADO_CUOTA,
  NOMBRE_SECCION,
  tadaEditable,
  tienePermiso,
  type CambioHistorialDTO,
  type CampoFicha,
  type Cuotas,
  type DatosFicha,
  type FichaDTO,
  type Seccion,
} from '@scouttracker/shared';
import { ErrorDelServidor, mensajeDeError, SinConexion } from '../lib/api';
import { useDatos } from '../lib/datos';
import { useSesion } from '../lib/sesion';
import { Aviso, Boton, Campo, confirmar, Interruptor, Pantalla, Parrafo, Selector, Subtitulo, Tarjeta } from './componentes';
import { espacio } from './tema';

const SECCIONES_FORM: Exclude<Seccion, 'administrativa' | 'documentos'>[] = ['datosPersonales', 'contacto', 'organizacion', 'progresion'];

type Valores = Record<string, string | boolean | null>;

function inicial(f: FichaDTO | null): Valores {
  const v: Valores = {};
  for (const d of DEF_CAMPOS) {
    const x = f?.[d.clave];
    if (d.tipo === 'fecha') v[d.clave] = x ? formatearFecha(String(x)) : '';
    else if (d.tipo === 'booleano') v[d.clave] = x === true;
    else v[d.clave] = x === undefined || x === null ? (d.tipo === 'texto' || d.tipo === 'dni' || d.tipo === 'telefono' ? '' : null) : String(x);
  }
  return v;
}

export interface Envio {
  datos: DatosFicha;
  cuotas?: Cuotas;
  camposPropios?: Record<string, unknown>;
  reemplazarCordi?: boolean;
  forzar?: boolean;
  revisada?: boolean;
}

/**
 * Formulario de alta (RF-022) y edición (RF-024). Solo envía los campos que cambiaron.
 * Maneja el aviso de edición simultánea (RF-025) y el reemplazo de cordi (RF-038).
 */
export function FormularioFicha({ ficha, enviar, alGuardar }: { ficha: FichaDTO | null; enviar(e: Envio): Promise<FichaDTO>; alGuardar(f: FichaDTO): void }) {
  const { contexto } = useSesion();
  const { snapshot, sinConexion } = useDatos();
  const [valores, setValores] = useState<Valores>(() => inicial(ficha));
  const [cuotas, setCuotas] = useState<Cuotas>(() => ({ ...(ficha?.cuotas ?? {}) }));
  const [propios, setPropios] = useState<Record<string, unknown>>(() => ({ ...(ficha?.camposPropios ?? {}) }));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState<CambioHistorialDTO[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [revisada, setRevisada] = useState(false);
  if (!snapshot || !contexto) return null;

  const rama = snapshot.rama;
  const ocultos = new Set<string>(rama.camposOcultos);
  const sensibles = snapshot.contexto.verSensibles;
  const nueva = !ficha;
  const editaCuotas = tienePermiso(contexto.permisos, 'cuotas', 'editar') && !!ficha?.cuotas;
  const hoy = hoyAR();
  const poner = (k: string, v: string | boolean | null) => setValores((x) => ({ ...x, [k]: v }));

  const fechaNacimiento = interpretarFecha(String(valores.fechaNacimiento ?? ''), hoy);
  const edad = fechaNacimiento ? calcularEdad(fechaNacimiento, hoy) : null;

  const opcionesCatalogo = (cat: string, actual: string | null) =>
    rama.catalogos
      .filter((v) => v.catalogo === cat && (v.activo || v.id === actual))
      .map((v) => ({ valor: v.id, etiqueta: v.activo ? v.nombre : `${v.nombre} (desactivado)` }));
  const opcionesEquipo = (actual: string | null) =>
    rama.equipos
      .filter((e) => (e.activo || e.id === actual) && (!contexto.soloEquipos || contexto.soloEquipos.includes(e.id)))
      .map((e) => ({ valor: e.id, etiqueta: e.activo ? e.nombre : `${e.nombre} (inactivo)` }));

  /** Arma el pedido con lo que cambió y valida fechas en el dispositivo. */
  function armarDatos(): DatosFicha | null {
    const datos: Record<string, unknown> = {};
    const errs: Record<string, string> = {};
    const original = inicial(ficha);
    for (const d of DEF_CAMPOS) {
      const v = valores[d.clave];
      if (!nueva && v === original[d.clave]) continue;
      if (d.tipo === 'fecha') {
        const texto = String(v ?? '').trim();
        if (!texto) datos[d.clave] = null;
        else {
          const f = interpretarFecha(texto, hoy);
          if (!f) errs[d.clave] = 'Usá el formato dd/mm/aaaa';
          else datos[d.clave] = f;
        }
      } else if (d.tipo === 'booleano') datos[d.clave] = v === true;
      else datos[d.clave] = v === '' ? null : v;
    }
    setErrores(errs);
    return Object.keys(errs).length ? null : (datos as DatosFicha);
  }

  async function guardar(extra: { reemplazarCordi?: boolean; forzar?: boolean } = {}) {
    setError(null);
    setConflicto(null);
    const datos = armarDatos();
    if (!datos) return setError('Revisá los datos marcados');
    const propiosCambiados: Record<string, unknown> = {};
    for (const c of rama.camposPropios) {
      if (!c.activo) continue;
      const antes = ficha?.camposPropios[c.id] ?? null;
      const ahora = propios[c.id] ?? null;
      if (antes !== ahora) propiosCambiados[c.id] = ahora;
    }
    const envio: Envio = { datos, ...extra };
    if (revisada) envio.revisada = true;
    if (Object.keys(propiosCambiados).length) envio.camposPropios = propiosCambiados;
    if (editaCuotas) {
      const cambiadas: Cuotas = {};
      for (const c of CONCEPTOS_CUOTA) if ((cuotas[c] ?? null) !== (ficha?.cuotas?.[c] ?? null)) cambiadas[c] = cuotas[c] ?? null;
      if (Object.keys(cambiadas).length) envio.cuotas = cambiadas;
    }
    setGuardando(true);
    try {
      alGuardar(await enviar(envio));
    } catch (e) {
      if (e instanceof ErrorDelServidor && e.codigo === CODIGOS_ERROR.conflictoEdicion) {
        setConflicto((e.datos.cambios as CambioHistorialDTO[]) ?? []);
      } else if (e instanceof ErrorDelServidor && e.codigo === CODIGOS_ERROR.confirmarReemplazo && !extra.reemplazarCordi) {
        if (await confirmar('Reemplazar cordi', e.message, 'Reemplazar')) await guardar({ ...extra, reemplazarCordi: true });
      } else if (e instanceof ErrorDelServidor && e.datos.campos) {
        setErrores(e.datos.campos as Record<string, string>);
        setError(e.message);
      } else {
        // RF-055: sin conexión no se guarda.
        setError(e instanceof SinConexion ? 'Sin conexión: la edición requiere conexión y no se guardó.' : mensajeDeError(e));
      }
    } finally {
      setGuardando(false);
    }
  }

  const campo = (clave: CampoFicha) => {
    const d = DEF_CAMPOS.find((x) => x.clave === clave)!;
    if (ocultos.has(clave)) return null;
    // En el alta se pueden cargar los obligatorios aunque no se puedan ver después (RF-020).
    if (d.sensible && !sensibles && !nueva) return null;
    const v = valores[clave];
    const err = errores[clave];
    const obligatorio = ['apellido', 'nombre', 'dni', 'fechaNacimiento'].includes(clave);
    switch (d.tipo) {
      case 'texto':
        return <Campo key={clave} etiqueta={d.etiqueta} value={String(v ?? '')} onChangeText={(t) => poner(clave, t)} error={err} obligatorio={obligatorio} multiline={clave === 'mistica' || clave === 'rolComunidad'} />;
      case 'dni':
        return <Campo key={clave} etiqueta={d.etiqueta} value={String(v ?? '')} onChangeText={(t) => poner(clave, t)} error={err} obligatorio keyboardType="number-pad" ayuda="Con o sin puntos" />;
      case 'telefono':
        return <Campo key={clave} etiqueta={d.etiqueta} value={String(v ?? '')} onChangeText={(t) => poner(clave, t)} error={err} keyboardType="phone-pad" ayuda={clave === 'telEmergencia1' ? 'Obligatorio al menos un teléfono de emergencia' : undefined} />;
      case 'fecha':
        return <Campo key={clave} etiqueta={d.etiqueta} value={String(v ?? '')} onChangeText={(t) => poner(clave, t)} error={err} obligatorio={obligatorio} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />;
      case 'booleano': {
        // RF-037: "Tiene TADA" solo desde los 16.
        const editable = tadaEditable(edad);
        return (
          <Interruptor
            key={clave}
            etiqueta={d.etiqueta}
            valor={v === true}
            alCambiar={(x) => poner(clave, x)}
            deshabilitado={!editable && v !== true}
            ayuda={!editable ? 'Disponible desde los 16 años' : err}
          />
        );
      }
      case 'catalogo':
        return <Selector key={clave} etiqueta={d.etiqueta} valor={v as string | null} alCambiar={(x) => poner(clave, x as string | null)} opciones={opcionesCatalogo(d.catalogo!, (ficha?.[clave] as string) ?? null)} error={err} />;
      case 'equipo':
        return (
          <Selector
            key={clave}
            etiqueta={d.etiqueta}
            valor={v as string | null}
            alCambiar={(x) => poner(clave, x as string | null)}
            opciones={opcionesEquipo(ficha?.equipoId ?? null)}
            textoVacio="Sin equipo"
            permitirVacio={!contexto.soloEquipos}
            error={err}
          />
        );
      case 'cordi':
        return (
          <Selector
            key={clave}
            etiqueta={d.etiqueta}
            valor={v as string | null}
            alCambiar={(x) => poner(clave, x as string | null)}
            opciones={[{ valor: 'coordinador', etiqueta: NOMBRE_CORDI.coordinador }, { valor: 'subcoordinador', etiqueta: NOMBRE_CORDI.subcoordinador }]}
            textoVacio="No"
            deshabilitado={!valores.equipoId}
            error={err ?? (!valores.equipoId ? 'Requiere equipo' : undefined)}
          />
        );
    }
  };

  return (
    <Pantalla>
      {sinConexion ? <Aviso tipo="aviso">Sin conexión: para guardar cambios hace falta conexión.</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {conflicto ? (
        <Tarjeta>
          <Subtitulo>Otra persona modificó esta ficha</Subtitulo>
          <Parrafo>Mientras la editabas se guardaron estos cambios:</Parrafo>
          {conflicto.map((c) => (
            <Parrafo key={c.id}>
              • {c.etiqueta}: {c.oculto ? '(dato sensible)' : `${c.valorAnterior ?? '—'} → ${c.valorNuevo ?? '—'}`} ({c.usuarioNombre})
            </Parrafo>
          ))}
          <Parrafo suave>Si guardás tu versión, los campos que vos cambiaste reemplazan a los de la otra persona; el resto se conserva.</Parrafo>
          <Boton titulo="Guardar mi versión" onPress={() => guardar({ forzar: true })} cargando={guardando} />
          <Boton titulo="Descartar mis cambios" variante="secundario" onPress={() => ficha && alGuardar(ficha)} />
        </Tarjeta>
      ) : null}
      {ficha?.estado === 'incompleta' ? (
        <Tarjeta>
          <Subtitulo>Ficha incompleta</Subtitulo>
          {ficha.incompletaMotivos.map((m) => (
            <Parrafo key={m}>• {m}</Parrafo>
          ))}
          {ficha.incompletaMotivos.some((m) => !m.startsWith('Falta ')) ? (
            <Interruptor
              etiqueta="Ya revisé los valores marcados"
              ayuda="Los valores no reconocidos al importar dejan de figurar como pendientes aunque queden vacíos"
              valor={revisada}
              alCambiar={setRevisada}
            />
          ) : null}
        </Tarjeta>
      ) : null}
      {SECCIONES_FORM.map((s) => {
        const campos = DEF_CAMPOS.filter((d) => d.seccion === s).map((d) => campo(d.clave)).filter(Boolean);
        const cps = rama.camposPropios.filter((c) => c.activo && c.seccion === s && (sensibles || !c.sensible || nueva));
        if (!campos.length && !cps.length) return null;
        return (
          <Tarjeta key={s}>
            <Subtitulo>{NOMBRE_SECCION[s]}</Subtitulo>
            {campos}
            {cps.map((c) => {
              const v = propios[c.id];
              if (c.tipo === 'booleano') return <Interruptor key={c.id} etiqueta={c.nombre} valor={v === true} alCambiar={(x) => setPropios((p) => ({ ...p, [c.id]: x }))} />;
              if (c.tipo === 'lista') return <Selector key={c.id} etiqueta={c.nombre} valor={(v as string) ?? null} alCambiar={(x) => setPropios((p) => ({ ...p, [c.id]: x }))} opciones={c.opciones.map((o) => ({ valor: o, etiqueta: o }))} error={errores[`cp.${c.id}`]} />;
              if (c.tipo === 'fecha') {
                return (
                  <Campo
                    key={c.id}
                    etiqueta={c.nombre}
                    placeholder="dd/mm/aaaa"
                    value={typeof v === 'string' && esFechaISO(v) ? formatearFecha(v) : String(v ?? '')}
                    onChangeText={(t) => setPropios((p) => ({ ...p, [c.id]: interpretarFecha(t, hoy) ?? (t || null) }))}
                    error={errores[`cp.${c.id}`]}
                  />
                );
              }
              return <Campo key={c.id} etiqueta={c.nombre} value={String(v ?? '')} onChangeText={(t) => setPropios((p) => ({ ...p, [c.id]: t || null }))} error={errores[`cp.${c.id}`]} />;
            })}
          </Tarjeta>
        );
      })}
      {editaCuotas ? (
        <Tarjeta>
          <Subtitulo>Cuotas</Subtitulo>
          {CONCEPTOS_CUOTA.map((c) => (
            <Selector
              key={c}
              etiqueta={NOMBRE_CONCEPTO_CUOTA[c]}
              valor={cuotas[c] ?? null}
              alCambiar={(x) => setCuotas((q) => ({ ...q, [c]: (x as Cuotas[typeof c]) ?? null }))}
              textoVacio="Sin dato"
              opciones={ESTADOS_CUOTA.map((e) => ({ valor: e, etiqueta: NOMBRE_ESTADO_CUOTA[e] }))}
            />
          ))}
        </Tarjeta>
      ) : null}
      <View style={{ gap: espacio.s }}>
        <Boton titulo={nueva ? 'Crear ficha' : 'Guardar cambios'} onPress={() => guardar()} cargando={guardando} deshabilitado={sinConexion} />
      </View>
    </Pantalla>
  );
}
