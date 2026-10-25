import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { formatearFechaHora, NOMBRE_CANAL, type AvisoManualDTO, type CanalAviso, type RolDTO } from '@scouttracker/shared';
import { api } from '../../../../lib/api';
import { useAccion, useCarga } from '../../../../lib/carga';
import { Aviso, Boton, Campo, Cargando, Dato, Interruptor, Pantalla, Parrafo, Selector, Subtitulo, Tarjeta } from '../../../../ui/componentes';

interface Estructura {
  ramas: { id: string; nombre: string; equipos: { id: string; nombre: string; activo: boolean }[] }[];
}

/** RF-086 / RF-087: aviso manual por push y mail, e historial de los enviados. */
export default function AvisosDelGrupo() {
  const { grupoId } = useLocalSearchParams<{ grupoId: string }>();
  const { datos: historial, error, recargar } = useCarga<AvisoManualDTO[]>(`/grupos/${grupoId}/avisos`);
  const { datos: estructura } = useCarga<Estructura>(`/grupos/${grupoId}/estructura`);
  const { datos: roles } = useCarga<RolDTO[]>(`/grupos/${grupoId}/roles`);
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [destino, setDestino] = useState('grupo');
  const [canales, setCanales] = useState<CanalAviso[]>(['push', 'mail']);
  const [importante, setImportante] = useState(false);
  if (error && !historial) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!historial || !estructura || !roles) return <Cargando />;

  const opciones = [
    { valor: 'grupo', etiqueta: 'Todo el grupo' },
    ...estructura.ramas.map((r) => ({ valor: `rama:${r.id}`, etiqueta: `Rama ${r.nombre}` })),
    ...estructura.ramas.flatMap((r) =>
      r.equipos.filter((e) => e.activo).map((e) => ({ valor: `equipo:${e.id}`, etiqueta: `Equipo ${e.nombre}`, detalle: `Rama ${r.nombre}` })),
    ),
    ...roles.map((r) => ({ valor: `rol:${r.id}`, etiqueta: `Rol ${r.nombre}` })),
  ];
  const canal = (c: CanalAviso, v: boolean) => setCanales(v ? [...new Set([...canales, c])] : canales.filter((x) => x !== c));

  return (
    <Pantalla>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Tarjeta>
        <Subtitulo>Nuevo aviso</Subtitulo>
        <Campo etiqueta="Título" obligatorio value={titulo} onChangeText={setTitulo} placeholder="Reunión de padres" />
        <Campo etiqueta="Texto" obligatorio value={texto} onChangeText={setTexto} multiline placeholder="El sábado a las 10 en la sede." />
        <Selector etiqueta="Para quién" opciones={opciones} valor={destino} alCambiar={(v) => setDestino(v as string)} permitirVacio={false} />
        <Interruptor etiqueta="Por notificación" valor={canales.includes('push')} alCambiar={(v) => canal('push', v)} />
        <Interruptor etiqueta="Por mail" valor={canales.includes('mail')} alCambiar={(v) => canal('mail', v)} />
        <Interruptor etiqueta="Importante" ayuda="Llega aunque la persona haya desactivado los avisos del grupo" valor={importante} alCambiar={setImportante} />
        <Boton
          titulo="Enviar aviso"
          deshabilitado={!titulo.trim() || !texto.trim() || canales.length === 0}
          cargando={ocupado === 'enviar'}
          onPress={() =>
            ejecutar('enviar', async () => {
              const [tipo, id] = destino.split(':');
              const r = await api.post<AvisoManualDTO>(`/grupos/${grupoId}/avisos`, {
                titulo: titulo.trim(),
                texto: texto.trim(),
                destino: id ? { tipo, id } : { tipo },
                canales,
                importante,
              });
              setTitulo('');
              setTexto('');
              setImportante(false);
              await recargar();
              return r.destinatarios === 1 ? 'Aviso enviado a 1 persona' : `Aviso enviado a ${r.destinatarios} personas`;
            })
          }
        />
      </Tarjeta>
      <Subtitulo>Enviados</Subtitulo>
      {historial.length === 0 ? <Parrafo suave>Todavía no se envió ningún aviso.</Parrafo> : null}
      {historial.map((h) => (
        <Tarjeta key={h.id}>
          <Dato etiqueta={`${formatearFechaHora(h.creadoEn)} · ${h.remitente}`} valor={`${h.importante ? '⚠ ' : ''}${h.titulo}`} />
          <Parrafo>{h.texto}</Parrafo>
          <Parrafo suave>
            {h.destino} · {h.canales.map((c) => NOMBRE_CANAL[c]).join(' y ')} · {h.destinatarios === 1 ? '1 persona' : `${h.destinatarios} personas`}
          </Parrafo>
        </Tarjeta>
      ))}
    </Pantalla>
  );
}
