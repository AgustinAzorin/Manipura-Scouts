import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  CAMPOS_OCULTABLES,
  DEF_CAMPO,
  NOMBRE_SECCION,
  NOMBRE_TIPO_CAMPO_PROPIO,
  TIPOS_CAMPO_PROPIO,
  type CampoPropioDef,
  type RamaConfigDTO,
  type TipoCampoPropio,
} from '@scouttracker/shared';
import { api } from '../../../../lib/api';
import { useAccion, useCarga } from '../../../../lib/carga';
import { useDatos } from '../../../../lib/datos';
import { Aviso, Boton, Campo, Cargando, Interruptor, Pantalla, Parrafo, Selector, Subtitulo, Tarjeta } from '../../../../ui/componentes';

const SECCIONES_PROPIAS = ['datosPersonales', 'contacto', 'organizacion', 'progresion'] as const;

/** RF-048 (campos ocultos), RF-119 y RF-120 (campos propios). */
export default function Campos() {
  const { ramaId } = useLocalSearchParams<{ ramaId: string }>();
  const { datos: rama, error, recargar } = useCarga<RamaConfigDTO>(`/ramas/${ramaId}/config`);
  const { recargar: recargarNomina } = useDatos();
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [nuevo, setNuevo] = useState({ nombre: '', tipo: 'texto' as TipoCampoPropio, seccion: 'organizacion' as CampoPropioDef['seccion'], sensible: false, opciones: '' });
  const [opcionNueva, setOpcionNueva] = useState<Record<string, string>>({});
  if (error) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!rama) return <Cargando />;
  const listo = async (t?: string) => {
    await recargar();
    await recargarNomina();
    return t;
  };
  const ocultos = new Set<string>(rama.camposOcultos);

  return (
    <Pantalla>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Subtitulo>Campos que usa la rama</Subtitulo>
      <Parrafo suave>Un campo apagado no aparece en la ficha, ni como columna ni como filtro de la nómina.</Parrafo>
      <Tarjeta>
        {CAMPOS_OCULTABLES.map((c) => (
          <Interruptor
            key={c}
            etiqueta={DEF_CAMPO[c].etiqueta}
            valor={!ocultos.has(c)}
            alCambiar={(visible) =>
              void ejecutar(`o-${c}`, async () => {
                const campos = visible ? [...ocultos].filter((x) => x !== c) : [...ocultos, c];
                await api.put(`/ramas/${ramaId}/campos-ocultos`, { campos });
                return listo();
              })
            }
          />
        ))}
      </Tarjeta>

      <Subtitulo>Campos propios</Subtitulo>
      {rama.camposPropios.map((c) => (
        <Tarjeta key={c.id}>
          <Subtitulo>
            {c.nombre}
            {c.activo ? '' : ' (desactivado)'}
          </Subtitulo>
          <Parrafo suave>
            {NOMBRE_TIPO_CAMPO_PROPIO[c.tipo]} · {NOMBRE_SECCION[c.seccion]}
            {c.sensible ? ' · sensible' : ''}
            {c.tipo === 'lista' ? ` · ${c.opciones.join(', ')}` : ''}
          </Parrafo>
          {c.tipo === 'lista' ? (
            <>
              <Campo etiqueta="Agregar valor" value={opcionNueva[c.id] ?? ''} onChangeText={(t) => setOpcionNueva((o) => ({ ...o, [c.id]: t }))} />
              <Boton titulo="Agregar valor" variante="secundario" deshabilitado={!(opcionNueva[c.id] ?? '').trim()} onPress={() => ejecutar(`op-${c.id}`, async () => {
                await api.patch(`/campos-propios/${c.id}`, { opciones: [...c.opciones, opcionNueva[c.id]!.trim()] });
                setOpcionNueva((o) => ({ ...o, [c.id]: '' }));
                return listo('Valor agregado');
              })} />
            </>
          ) : null}
          <Interruptor etiqueta="Activo" ayuda="Desactivado se oculta y los valores cargados se conservan" valor={c.activo} alCambiar={(v) => void ejecutar(`a-${c.id}`, async () => {
            await api.patch(`/campos-propios/${c.id}`, { activo: v });
            return listo();
          })} />
        </Tarjeta>
      ))}
      <Tarjeta>
        <Subtitulo>Nuevo campo propio</Subtitulo>
        <Campo etiqueta="Nombre" value={nuevo.nombre} onChangeText={(t) => setNuevo({ ...nuevo, nombre: t })} placeholder="Seisena" />
        <Selector etiqueta="Tipo" valor={nuevo.tipo} permitirVacio={false} alCambiar={(v) => setNuevo({ ...nuevo, tipo: v as TipoCampoPropio })} opciones={TIPOS_CAMPO_PROPIO.map((t) => ({ valor: t, etiqueta: NOMBRE_TIPO_CAMPO_PROPIO[t] }))} />
        {nuevo.tipo === 'lista' ? <Campo etiqueta="Valores (separados por coma)" value={nuevo.opciones} onChangeText={(t) => setNuevo({ ...nuevo, opciones: t })} placeholder="Blanca, Negra" /> : null}
        <Selector etiqueta="Sección de la ficha" valor={nuevo.seccion} permitirVacio={false} alCambiar={(v) => setNuevo({ ...nuevo, seccion: v as CampoPropioDef['seccion'] })} opciones={SECCIONES_PROPIAS.map((s) => ({ valor: s, etiqueta: NOMBRE_SECCION[s] }))} />
        <Interruptor etiqueta="Dato sensible" ayuda="Solo lo ven quienes tienen el permiso de datos sensibles. Revisá el consentimiento firmado (DEP-06)." valor={nuevo.sensible} alCambiar={(v) => setNuevo({ ...nuevo, sensible: v })} />
        <Boton titulo="Crear campo" deshabilitado={!nuevo.nombre.trim()} cargando={ocupado === 'crear'} onPress={() => ejecutar('crear', async () => {
          await api.post(`/ramas/${ramaId}/campos-propios`, {
            nombre: nuevo.nombre.trim(),
            tipo: nuevo.tipo,
            seccion: nuevo.seccion,
            sensible: nuevo.sensible,
            opciones: nuevo.tipo === 'lista' ? nuevo.opciones.split(',').map((o) => o.trim()).filter(Boolean) : undefined,
          });
          setNuevo({ nombre: '', tipo: 'texto', seccion: 'organizacion', sensible: false, opciones: '' });
          return listo('Campo creado');
        })} />
      </Tarjeta>
    </Pantalla>
  );
}
