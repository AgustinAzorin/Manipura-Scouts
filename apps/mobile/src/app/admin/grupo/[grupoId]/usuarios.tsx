import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { CODIGOS_ERROR, type UsuarioAdminDTO } from '@scouttracker/shared';
import { api, ErrorDelServidor } from '../../../../lib/api';
import { useAccion, useCarga } from '../../../../lib/carga';
import { ASIGNACION_VACIA, asignacionCompleta, SelectorAsignacion } from '../../../../ui/alcance';
import { Aviso, Boton, Campo, Cargando, confirmar, ItemMenu, Pantalla, Subtitulo, Tarjeta } from '../../../../ui/componentes';

/** RF-009 / RF-016 */
export default function Usuarios() {
  const { grupoId } = useLocalSearchParams<{ grupoId: string }>();
  const router = useRouter();
  const { datos: usuarios, error, recargar } = useCarga<UsuarioAdminDTO[]>(`/grupos/${grupoId}/usuarios`);
  const { ocupado, mensaje, ejecutar, setMensaje } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [asig, setAsig] = useState(ASIGNACION_VACIA);
  if (error) return <Pantalla><Aviso tipo="error">{error}</Aviso></Pantalla>;
  if (!usuarios) return <Cargando />;

  const invitar = async () => {
    try {
      setMensaje(null);
      await api.post(`/grupos/${grupoId}/usuarios`, { nombre: nombre.trim(), email: email.trim(), ...asig });
      setMensaje({ tipo: 'exito', texto: `Se envió la invitación a ${email.trim()}. El enlace vence en 7 días.` });
      setAbierto(false);
      setNombre('');
      setEmail('');
      setAsig(ASIGNACION_VACIA);
      await recargar();
    } catch (e) {
      // RF-009: el mail ya es del grupo: se ofrece agregarle la asignación.
      if (e instanceof ErrorDelServidor && e.codigo === CODIGOS_ERROR.usuarioExistente) {
        if (await confirmar('El usuario ya existe', e.message, 'Agregar asignación')) {
          await ejecutar('asig', async () => {
            await api.post(`/grupos/${grupoId}/usuarios/${e.datos.usuarioId}/asignaciones`, asig);
            setAbierto(false);
            await recargar();
            return 'Asignación agregada';
          });
        }
      } else setMensaje({ tipo: 'error', texto: (e as Error).message });
    }
  };

  return (
    <Pantalla>
      {mensaje ? <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso> : null}
      {abierto ? (
        <Tarjeta>
          <Subtitulo>Invitar usuario</Subtitulo>
          <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} />
          <Campo etiqueta="Mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <SelectorAsignacion grupoId={grupoId} valor={asig} alCambiar={setAsig} />
          <Boton titulo="Enviar invitación" onPress={() => ejecutar('invitar', invitar)} cargando={ocupado === 'invitar'} deshabilitado={!nombre.trim() || !email.trim() || !asignacionCompleta(asig)} />
          <Boton titulo="Cancelar" variante="texto" onPress={() => setAbierto(false)} />
        </Tarjeta>
      ) : (
        <Boton titulo="Invitar usuario" onPress={() => setAbierto(true)} />
      )}
      {usuarios.map((u) => (
        <ItemMenu
          key={u.id}
          titulo={`${u.nombre}${u.activo ? '' : ' (inactivo)'}${u.pendienteActivacion ? ' (sin activar)' : ''}`}
          detalle={`${u.email}\n${u.asignaciones.map((a) => `${a.rolNombre}: ${a.alcanceNombre}`).join('\n') || 'Sin roles'}`}
          onPress={() => router.push(`/admin/grupo/${grupoId}/usuario/${u.id}`)}
        />
      ))}
    </Pantalla>
  );
}
