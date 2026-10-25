import type { Alcance, RolDTO } from '@scouttracker/shared';
import { useCarga } from '../lib/carga';
import { Selector } from './componentes';

export interface Estructura {
  ramas: { id: string; nombre: string; comunidad: string | null; equipos: { id: string; nombre: string; activo: boolean }[] }[];
}

export interface ValorAsignacion {
  rolId: string | null;
  alcance: Alcance;
  ramaId: string | null;
  equipoId: string | null;
}

export const ASIGNACION_VACIA: ValorAsignacion = { rolId: null, alcance: 'rama', ramaId: null, equipoId: null };

export const asignacionCompleta = (v: ValorAsignacion) =>
  !!v.rolId && (v.alcance === 'grupo' || (v.alcance === 'rama' && !!v.ramaId) || (v.alcance === 'equipo' && !!v.equipoId));

/** RF-019: rol y alcance (grupo, rama o equipo). */
export function SelectorAsignacion({ grupoId, valor, alCambiar }: { grupoId: string; valor: ValorAsignacion; alCambiar(v: ValorAsignacion): void }) {
  const { datos: roles } = useCarga<RolDTO[]>(`/grupos/${grupoId}/roles`);
  const { datos: estructura } = useCarga<Estructura>(`/grupos/${grupoId}/estructura`);
  const equipos = (estructura?.ramas ?? []).flatMap((r) => r.equipos.filter((e) => e.activo).map((e) => ({ valor: e.id, etiqueta: `${e.nombre} (${r.nombre})` })));
  return (
    <>
      <Selector etiqueta="Rol" valor={valor.rolId} permitirVacio={false} textoVacio="Elegí un rol" alCambiar={(v) => alCambiar({ ...valor, rolId: v as string })} opciones={(roles ?? []).map((r) => ({ valor: r.id, etiqueta: r.nombre, detalle: r.verSensibles ? 'Con datos sensibles' : undefined }))} />
      <Selector
        etiqueta="Alcance"
        valor={valor.alcance}
        permitirVacio={false}
        alCambiar={(v) => alCambiar({ ...valor, alcance: v as Alcance, ramaId: null, equipoId: null })}
        opciones={[
          { valor: 'grupo', etiqueta: 'Todo el grupo' },
          { valor: 'rama', etiqueta: 'Una rama' },
          { valor: 'equipo', etiqueta: 'Un equipo' },
        ]}
      />
      {valor.alcance === 'rama' ? (
        <Selector etiqueta="Rama" valor={valor.ramaId} permitirVacio={false} textoVacio="Elegí la rama" alCambiar={(v) => alCambiar({ ...valor, ramaId: v as string })} opciones={(estructura?.ramas ?? []).map((r) => ({ valor: r.id, etiqueta: r.nombre }))} />
      ) : null}
      {valor.alcance === 'equipo' ? (
        <Selector etiqueta="Equipo" valor={valor.equipoId} permitirVacio={false} textoVacio="Elegí el equipo" alCambiar={(v) => alCambiar({ ...valor, equipoId: v as string })} opciones={equipos} />
      ) : null}
    </>
  );
}
