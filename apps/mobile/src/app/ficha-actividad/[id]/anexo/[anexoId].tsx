import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { formatearCantidad, NOMBRE_CAMPO_ANEXO, type AnexoDTO, type FichaActividadDTO } from '@scouttracker/shared';
import { api, ErrorDelServidor, mensajeDeError } from '../../../../lib/api';
import { useFichaActividad } from '../../../../lib/fichaActividad';
import { Aviso, Boton, Campo, Cargando, confirmar, Interruptor, Pantalla, Parrafo, Selector, Subtitulo, Tarjeta } from '../../../../ui/componentes';
import { EditorDesarrollo } from '../../../../ui/desarrollo';
import { espacio } from '../../../../ui/tema';

interface MaterialEditable {
  clave: number;
  cantidad: string;
  descripcion: string;
  porEquipo: boolean;
}

let siguienteClave = 0;
const numeroOVacio = (n: number | null) => (n === null ? '' : String(n));

/** Lee un entero; '' es null y undefined indica que no es un número válido. */
function entero(t: string): number | null | undefined {
  const v = t.trim();
  if (!v) return null;
  return /^\d+$/.test(v) ? Number(v) : undefined;
}

/** RF-095 a RF-097: el educador asignado completa los campos de RD-005. */
export default function EditarAnexo() {
  const { id, anexoId } = useLocalSearchParams<{ id: string; anexoId: string }>();
  const { ficha, error } = useFichaActividad(id);
  if (error && !ficha) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  const anexo = ficha?.anexos.find((a) => a.id === anexoId);
  if (!ficha) return <Cargando />;
  if (!anexo) return <Pantalla><Aviso tipo="error">El anexo ya no existe.</Aviso></Pantalla>;
  return <Formulario key={anexo.id} ficha={ficha} anexo={anexo} />;
}

function Formulario({ ficha, anexo }: { ficha: FichaActividadDTO; anexo: AnexoDTO }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState(anexo.titulo);
  const [categoriaId, setCategoriaId] = useState(anexo.categoriaId);
  const [edadDesde, setEdadDesde] = useState(numeroOVacio(anexo.edadDesde));
  const [edadHasta, setEdadHasta] = useState(numeroOVacio(anexo.edadHasta));
  const [participantes, setParticipantes] = useState(numeroOVacio(anexo.participantes));
  const [duracion, setDuracion] = useState(numeroOVacio(anexo.duracionMinutos));
  const [espacioFisico, setEspacioFisico] = useState(anexo.espacio);
  const [educadores, setEducadores] = useState(anexo.educadores);
  const [equipos, setEquipos] = useState(numeroOVacio(anexo.equipos));
  const [motivacion, setMotivacion] = useState(anexo.motivacion);
  const [objetivos, setObjetivos] = useState(anexo.objetivos);
  const [areas, setAreas] = useState(anexo.areas);
  const [desarrollo, setDesarrollo] = useState(anexo.desarrollo);
  const [materiales, setMateriales] = useState<MaterialEditable[]>(() =>
    anexo.materiales.map((m) => ({ clave: ++siguienteClave, cantidad: m.cantidad === null ? '' : formatearCantidad(m.cantidad), descripcion: m.descripcion, porEquipo: m.porEquipo })),
  );
  const [asignadoA, setAsignadoA] = useState(anexo.asignadoA?.id ?? null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const editable = anexo.puedeEditar;
  const puedeAsignar = ficha.permisos.editar;
  const cambiarMaterial = (clave: number, c: Partial<MaterialEditable>) => setMateriales((ms) => ms.map((m) => (m.clave === clave ? { ...m, ...c } : m)));

  /** Arma lo que se manda al servidor o devuelve los errores de los campos. */
  function datos(): Record<string, unknown> | null {
    const errs: Record<string, string> = {};
    const numeros = { edadDesde, edadHasta, participantes, duracionMinutos: duracion, equipos };
    const leidos: Record<string, number | null> = {};
    for (const [campo, t] of Object.entries(numeros)) {
      const n = entero(t);
      if (n === undefined) errs[campo] = 'Tiene que ser un número entero';
      else leidos[campo] = n;
    }
    if (leidos.equipos === 0) errs.equipos = 'Tiene que ser al menos 1';
    const items = materiales
      .filter((m) => m.descripcion.trim() || m.cantidad.trim())
      .map((m) => {
        const cantidad = m.cantidad.trim() ? Number(m.cantidad.trim().replace(',', '.')) : null;
        if (cantidad !== null && !(cantidad > 0)) errs[`material-${m.clave}`] = 'Cantidad inválida';
        if (!m.descripcion.trim()) errs[`material-${m.clave}`] = 'Falta la descripción';
        return { cantidad, descripcion: m.descripcion.trim(), porEquipo: m.porEquipo };
      });
    setErrores(errs);
    if (Object.keys(errs).length) return null;
    return {
      titulo,
      categoriaId,
      ...leidos,
      espacio: espacioFisico,
      educadores,
      motivacion,
      objetivos,
      areas,
      materiales: items,
      desarrollo,
      ...(puedeAsignar ? { asignadoA } : {}),
    };
  }

  const guardar = async (completar?: boolean) => {
    const d = datos();
    if (!d) {
      setMensaje({ tipo: 'error', texto: 'Revisá los campos marcados.' });
      return;
    }
    setMensaje(null);
    setOcupado(completar === undefined ? 'guardar' : completar ? 'completo' : 'pendiente');
    try {
      await api.patch(`/anexos/${anexo.id}`, d);
      if (completar !== undefined) await api.post(`/anexos/${anexo.id}/completo`, { completo: completar });
      router.back();
    } catch (e) {
      // RF-096: el servidor indica los obligatorios que faltan.
      if (e instanceof ErrorDelServidor && e.datos.campos) setErrores(Object.fromEntries(Object.keys(e.datos.campos).map((c) => [c, 'Obligatorio para marcarlo completo'])));
      setMensaje({ tipo: 'error', texto: mensajeDeError(e) });
    } finally {
      setOcupado(null);
    }
  };

  const eliminar = async () => {
    if (!(await confirmar(`Eliminar anexo ${anexo.numero}`, 'Se borra el anexo con todo lo que tiene cargado.', 'Eliminar'))) return;
    setOcupado('eliminar');
    try {
      await api.delete(`/anexos/${anexo.id}`);
      router.back();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: mensajeDeError(e) });
    } finally {
      setOcupado(null);
    }
  };

  const categorias = ficha.categorias.filter((c) => c.activo || c.id === categoriaId);
  const cantidadEquipos = entero(equipos) || ficha.equiposActivos;
  return (
    <Pantalla>
      <Stack.Screen options={{ title: `Anexo ${anexo.numero}` }} />
      {!editable ? <Aviso tipo="info">Solo lectura: este anexo lo completa {anexo.asignadoA?.nombre ?? 'quien se asigne'}.</Aviso> : null}
      {anexo.completo ? <Aviso tipo="exito">Anexo completo.</Aviso> : null}
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}

      {puedeAsignar ? (
        <Selector
          etiqueta="Lo completa"
          valor={asignadoA}
          opciones={ficha.usuariosRama.map((u) => ({ valor: u.id, etiqueta: u.nombre }))}
          alCambiar={(v) => setAsignadoA((v as string | null) ?? null)}
        />
      ) : (
        <Parrafo>Lo completa: {anexo.asignadoA?.nombre ?? 'sin asignar'}</Parrafo>
      )}

      <Campo etiqueta={NOMBRE_CAMPO_ANEXO.titulo!} obligatorio value={titulo} onChangeText={setTitulo} editable={editable} error={errores.titulo} placeholder="La telaraña del reencuentro" />
      <Selector
        etiqueta={`${NOMBRE_CAMPO_ANEXO.categoriaId!} *`}
        valor={categoriaId}
        textoVacio="Sin categoría"
        deshabilitado={!editable}
        error={errores.categoriaId}
        opciones={categorias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
        alCambiar={(v) => setCategoriaId((v as string | null) ?? null)}
      />
      {categorias.length === 0 ? <Parrafo suave>La rama no tiene valores en el catálogo “Categoría de anexo”. Los carga el admin en Administración › Catálogos.</Parrafo> : null}

      <View style={{ flexDirection: 'row', gap: espacio.s }}>
        <View style={{ flex: 1 }}>
          <Campo etiqueta="Edad desde" value={edadDesde} onChangeText={setEdadDesde} keyboardType="number-pad" editable={editable} error={errores.edadDesde} />
        </View>
        <View style={{ flex: 1 }}>
          <Campo etiqueta="Edad hasta" value={edadHasta} onChangeText={setEdadHasta} keyboardType="number-pad" editable={editable} error={errores.edadHasta} />
        </View>
      </View>
      <Campo etiqueta="Cantidad de participantes" value={participantes} onChangeText={setParticipantes} keyboardType="number-pad" editable={editable} error={errores.participantes} />
      <Campo etiqueta="Duración (minutos)" value={duracion} onChangeText={setDuracion} keyboardType="number-pad" editable={editable} error={errores.duracionMinutos} />
      <Campo etiqueta="Espacio" value={espacioFisico} onChangeText={setEspacioFisico} editable={editable} placeholder="Aire libre" />
      <Campo etiqueta="Cantidad de educadores" value={educadores} onChangeText={setEducadores} editable={editable} error={errores.educadores} ayuda='Un número o "todos"' />
      <Campo etiqueta="Motivación" value={motivacion} onChangeText={setMotivacion} editable={editable} multiline />
      <Campo etiqueta="Objetivos" value={objetivos} onChangeText={setObjetivos} editable={editable} multiline />
      <Campo etiqueta="Áreas" value={areas} onChangeText={setAreas} editable={editable} placeholder="Habilidades para la vida" />

      <Subtitulo>Materiales</Subtitulo>
      <Parrafo suave>
        Los que van “por equipo” se multiplican en la lista de compras por {cantidadEquipos} {cantidadEquipos === 1 ? 'equipo' : 'equipos'}.
      </Parrafo>
      <Campo
        etiqueta="Cantidad de equipos"
        value={equipos}
        onChangeText={setEquipos}
        keyboardType="number-pad"
        editable={editable}
        error={errores.equipos}
        placeholder={String(ficha.equiposActivos)}
        ayuda={`Vacío usa los ${ficha.equiposActivos} equipos activos de la rama.`}
      />
      {materiales.map((m) => (
        <Tarjeta key={m.clave}>
          {errores[`material-${m.clave}`] ? <Aviso tipo="error">{errores[`material-${m.clave}`]}</Aviso> : null}
          <Campo etiqueta="Cantidad" value={m.cantidad} onChangeText={(t) => cambiarMaterial(m.clave, { cantidad: t })} keyboardType="decimal-pad" editable={editable} ayuda="Puede quedar vacía" />
          <Campo etiqueta="Descripción" value={m.descripcion} onChangeText={(t) => cambiarMaterial(m.clave, { descripcion: t })} editable={editable} placeholder="palos de 1,5 m" />
          <Interruptor etiqueta="Por equipo" valor={m.porEquipo} alCambiar={(v) => cambiarMaterial(m.clave, { porEquipo: v })} deshabilitado={!editable} />
          {editable ? <Boton titulo="Quitar material" variante="texto" onPress={() => setMateriales((ms) => ms.filter((x) => x.clave !== m.clave))} /> : null}
        </Tarjeta>
      ))}
      {editable ? (
        <Boton titulo="Agregar material" variante="secundario" onPress={() => setMateriales((ms) => [...ms, { clave: ++siguienteClave, cantidad: '', descripcion: '', porEquipo: false }])} />
      ) : null}

      <EditorDesarrollo valor={desarrollo} alCambiar={setDesarrollo} editable={editable} error={errores.desarrollo} />

      {editable ? (
        <View style={{ gap: espacio.s, marginTop: espacio.l }}>
          {anexo.completo ? (
            <Boton titulo="Guardar" onPress={() => void guardar()} cargando={ocupado === 'guardar'} />
          ) : (
            <Boton titulo="Guardar y marcar como completo" onPress={() => void guardar(true)} cargando={ocupado === 'completo'} />
          )}
          {anexo.completo ? (
            <Boton titulo="Guardar y volver a pendiente" variante="secundario" onPress={() => void guardar(false)} cargando={ocupado === 'pendiente'} />
          ) : (
            <Boton titulo="Guardar sin terminar" variante="secundario" onPress={() => void guardar()} cargando={ocupado === 'guardar'} />
          )}
        </View>
      ) : null}
      {ficha.permisos.editar ? <Boton titulo="Eliminar anexo" variante="peligro" onPress={() => void eliminar()} cargando={ocupado === 'eliminar'} /> : null}
    </Pantalla>
  );
}
