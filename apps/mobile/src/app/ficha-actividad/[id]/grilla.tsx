import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { interpretarHora, materialesDeFila, ordenarGrilla, type FichaActividadDTO, type FilaGrilla, type Responsable } from '@scouttracker/shared';
import { api } from '../../../lib/api';
import { useAccion } from '../../../lib/carga';
import { useFichaActividad } from '../../../lib/fichaActividad';
import { Aviso, Boton, Campo, Cargando, confirmar, Pantalla, Parrafo, Selector, Subtitulo, Tarjeta } from '../../../ui/componentes';

type TipoResponsable = 'ninguno' | Responsable['tipo'];

interface FilaEditable {
  clave: number;
  hora: string;
  nombre: string;
  tipo: TipoResponsable;
  usuarios: string[];
  texto: string;
  observaciones: string;
  anexo: string | null;
}

let siguienteClave = 0;
const aEditable = (f: FilaGrilla): FilaEditable => ({
  clave: ++siguienteClave,
  hora: f.hora,
  nombre: f.nombre,
  tipo: f.responsable?.tipo ?? 'ninguno',
  usuarios: f.responsable?.tipo === 'usuarios' ? f.responsable.ids : [],
  texto: f.responsable?.tipo === 'texto' ? f.responsable.texto : '',
  observaciones: f.observaciones,
  anexo: f.anexo === null ? null : String(f.anexo),
});

function responsable(f: FilaEditable): Responsable | null {
  if (f.tipo === 'todos') return { tipo: 'todos' };
  if (f.tipo === 'usuarios') return f.usuarios.length ? { tipo: 'usuarios', ids: f.usuarios } : null;
  if (f.tipo === 'texto') return f.texto.trim() ? { tipo: 'texto', texto: f.texto.trim() } : null;
  return null;
}

const TIPOS_RESPONSABLE: { valor: TipoResponsable; etiqueta: string }[] = [
  { valor: 'ninguno', etiqueta: 'Sin responsable' },
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'usuarios', etiqueta: 'Educadores de la rama' },
  { valor: 'texto', etiqueta: 'Escribir un nombre' },
];

/** RF-093 / RF-094 / RF-098: grilla de programación. Se ordena por hora al guardar. */
export default function GrillaFicha() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ficha, error } = useFichaActividad(id);
  if (error && !ficha) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!ficha) return <Cargando />;
  return <Editor ficha={ficha} />;
}

function Editor({ ficha }: { ficha: FichaActividadDTO }) {
  const router = useRouter();
  const { ocupado, mensaje, ejecutar, setMensaje } = useAccion();
  const [filas, setFilas] = useState<FilaEditable[]>(() => ficha.grilla.map(aEditable));
  const [errores, setErrores] = useState<Record<number, string>>({});
  const editar = ficha.permisos.editar;
  const cambiar = (clave: number, c: Partial<FilaEditable>) => setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...c } : f)));

  const guardar = () => {
    const errs: Record<number, string> = {};
    const grilla: FilaGrilla[] = [];
    for (const f of filas) {
      const hora = interpretarHora(f.hora);
      if (!hora) errs[f.clave] = 'Hora inválida (por ejemplo 14:30)';
      else if (!f.nombre.trim()) errs[f.clave] = 'Falta el nombre de la actividad';
      else grilla.push({ hora, nombre: f.nombre.trim(), responsable: responsable(f), observaciones: f.observaciones.trim(), anexo: f.anexo ? Number(f.anexo) : null });
    }
    setErrores(errs);
    if (Object.keys(errs).length) {
      setMensaje({ tipo: 'error', texto: 'Revisá las filas marcadas.' });
      return;
    }
    void ejecutar('guardar', async () => {
      await api.patch(`/fichas-actividad/${ficha.id}`, { grilla: ordenarGrilla(grilla) });
      router.back();
    });
  };

  return (
    <Pantalla>
      {!editar ? <Aviso tipo="info">Solo lectura: no tenés permiso para editar esta ficha.</Aviso> : null}
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Parrafo suave>La columna Materiales del PDF se completa sola con los materiales del anexo de cada fila.</Parrafo>
      {filas.length === 0 ? <Parrafo suave>Todavía no hay actividades en la grilla.</Parrafo> : null}
      {filas.map((f) => (
        <Tarjeta key={f.clave}>
          <Subtitulo>{f.nombre.trim() || 'Nueva actividad'}</Subtitulo>
          {errores[f.clave] ? <Aviso tipo="error">{errores[f.clave]}</Aviso> : null}
          <Campo etiqueta="Hora" value={f.hora} onChangeText={(t) => cambiar(f.clave, { hora: t })} placeholder="14:30" keyboardType="numbers-and-punctuation" editable={editar} obligatorio />
          <Campo etiqueta="Nombre de la actividad" value={f.nombre} onChangeText={(t) => cambiar(f.clave, { nombre: t })} editable={editar} obligatorio />
          <Selector
            etiqueta="Responsable"
            valor={f.tipo}
            permitirVacio={false}
            deshabilitado={!editar}
            opciones={TIPOS_RESPONSABLE}
            alCambiar={(v) => cambiar(f.clave, { tipo: (v as TipoResponsable) ?? 'ninguno' })}
          />
          {f.tipo === 'usuarios' ? (
            <Selector
              etiqueta="Educadores"
              multiple
              textoNinguno="Elegí al menos uno"
              valor={f.usuarios}
              deshabilitado={!editar}
              opciones={ficha.usuariosRama.map((u) => ({ valor: u.id, etiqueta: u.nombre }))}
              alCambiar={(v) => cambiar(f.clave, { usuarios: (v as string[]) ?? [] })}
            />
          ) : null}
          {f.tipo === 'texto' ? <Campo etiqueta="Nombre del responsable" value={f.texto} onChangeText={(t) => cambiar(f.clave, { texto: t })} placeholder="Nehuen" editable={editar} /> : null}
          <Campo etiqueta="Observaciones" value={f.observaciones} onChangeText={(t) => cambiar(f.clave, { observaciones: t })} editable={editar} />
          <Selector
            etiqueta="Anexo"
            valor={f.anexo}
            textoVacio="Sin anexo"
            deshabilitado={!editar}
            opciones={ficha.anexos.map((a) => ({ valor: String(a.numero), etiqueta: `Anexo ${a.numero}${a.titulo ? ` · ${a.titulo}` : ''}` }))}
            alCambiar={(v) => cambiar(f.clave, { anexo: (v as string | null) ?? null })}
          />
          {f.anexo ? <Parrafo suave>Materiales: {materialesDeFila(Number(f.anexo), ficha.anexos).replace(/\n/g, ', ')}</Parrafo> : null}
          {editar ? (
            <Boton
              titulo="Quitar fila"
              variante="texto"
              onPress={async () => {
                if (await confirmar('Quitar fila', `Se quita "${f.nombre || 'la fila'}" de la grilla al guardar.`, 'Quitar')) setFilas((fs) => fs.filter((x) => x.clave !== f.clave));
              }}
            />
          ) : null}
        </Tarjeta>
      ))}
      {ficha.anexos.length === 0 ? <Parrafo suave>Para vincular una fila con un anexo, primero agregá el anexo en la ficha.</Parrafo> : null}
      {editar ? (
        <>
          <Boton
            titulo="Agregar actividad"
            variante="secundario"
            onPress={() => setFilas((fs) => [...fs, aEditable({ hora: '', nombre: '', responsable: { tipo: 'todos' }, observaciones: '', anexo: null })])}
          />
          <Boton titulo="Guardar grilla" onPress={guardar} cargando={ocupado === 'guardar'} />
        </>
      ) : null}
    </Pantalla>
  );
}
