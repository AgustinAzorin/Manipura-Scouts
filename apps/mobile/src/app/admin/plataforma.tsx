import { useState } from 'react';
import type { GrupoDTO } from '@scouttracker/shared';
import { api } from '../../lib/api';
import { useAccion, useCarga } from '../../lib/carga';
import { useSesion } from '../../lib/sesion';
import { Aviso, Boton, Campo, Cargando, confirmar, Dato, Pantalla, Parrafo, Subtitulo, Tarjeta } from '../../ui/componentes';

/** RF-001 a RF-003. El admin de plataforma no ve fichas desde acá (RN-18). */
export default function Plataforma() {
  const { refrescarYo } = useSesion();
  const { datos: grupos, error, recargar } = useCarga<GrupoDTO[]>('/plataforma/grupos');
  const { ocupado, mensaje, ejecutar } = useAccion();
  const [nombre, setNombre] = useState('');
  const [invitar, setInvitar] = useState<{ grupoId: string; nombre: string; email: string } | null>(null);
  if (error) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!grupos) return <Cargando />;
  return (
    <Pantalla>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      <Tarjeta>
        <Subtitulo>Nuevo grupo</Subtitulo>
        <Campo etiqueta="Nombre del grupo" value={nombre} onChangeText={setNombre} placeholder="Grupo Scout General Paz" />
        <Boton
          titulo="Crear grupo"
          deshabilitado={!nombre.trim()}
          cargando={ocupado === 'crear'}
          onPress={() =>
            ejecutar('crear', async () => {
              await api.post('/plataforma/grupos', { nombre: nombre.trim() });
              setNombre('');
              await recargar();
              return 'Grupo creado. Ahora designá a su admin.';
            })
          }
        />
      </Tarjeta>
      {grupos.map((g) => (
        <Tarjeta key={g.id}>
          <Subtitulo>{g.nombre}</Subtitulo>
          <Dato etiqueta="Estado" valor={g.activo ? 'Activo' : 'Desactivado: sus usuarios no acceden a los datos'} />
          <Dato etiqueta="Admins de grupo" valor={String(g.cantidadAdmins)} />
          {invitar?.grupoId === g.id ? (
            <>
              <Campo etiqueta="Nombre del admin" value={invitar.nombre} onChangeText={(t) => setInvitar({ ...invitar, nombre: t })} />
              <Campo etiqueta="Mail del admin" value={invitar.email} onChangeText={(t) => setInvitar({ ...invitar, email: t })} autoCapitalize="none" keyboardType="email-address" />
              <Boton
                titulo="Enviar invitación"
                cargando={ocupado === `inv-${g.id}`}
                deshabilitado={!invitar.nombre.trim() || !invitar.email.trim()}
                onPress={() =>
                  ejecutar(`inv-${g.id}`, async () => {
                    await api.post(`/plataforma/grupos/${g.id}/admins`, { nombre: invitar.nombre.trim(), email: invitar.email.trim() });
                    setInvitar(null);
                    await recargar();
                    await refrescarYo();
                    return `Se envió la invitación a ${invitar.email.trim()}`;
                  })
                }
              />
              <Boton titulo="Cancelar" variante="texto" onPress={() => setInvitar(null)} />
            </>
          ) : (
            <Boton titulo="Designar admin de grupo" variante="secundario" onPress={() => setInvitar({ grupoId: g.id, nombre: '', email: '' })} />
          )}
          <Boton
            titulo={g.activo ? 'Desactivar grupo' : 'Reactivar grupo'}
            variante={g.activo ? 'peligro' : 'primario'}
            cargando={ocupado === `act-${g.id}`}
            onPress={async () => {
              if (g.activo && !(await confirmar('Desactivar grupo', 'Sus usuarios dejan de ver y editar las fichas. Los datos se conservan y vuelven al reactivarlo.', 'Desactivar'))) return;
              await ejecutar(`act-${g.id}`, async () => {
                await api.post(`/plataforma/grupos/${g.id}/${g.activo ? 'desactivar' : 'reactivar'}`);
                await recargar();
              });
            }}
          />
        </Tarjeta>
      ))}
      {grupos.length === 0 ? <Parrafo suave>Todavía no hay grupos.</Parrafo> : null}
    </Pantalla>
  );
}
