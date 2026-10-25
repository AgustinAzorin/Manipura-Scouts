import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { URL_API, tokenActual } from './api';
import { almacenDatos } from './sesion';

const memoria = new Map<string, string>();
const pendientes = new Map<string, Promise<string | null>>();

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function aBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i]!, bytes[i + 1], bytes[i + 2]];
    s += ALFABETO[a >> 2]! + ALFABETO[((a & 3) << 4) | (b >> 4)]!;
    s += i + 1 < bytes.length ? ALFABETO[((b & 15) << 2) | (c >> 6)]! : '=';
    s += i + 2 < bytes.length ? ALFABETO[c & 63]! : '=';
  }
  return s;
}

/** Descarga un logo una vez y lo guarda para verlo sin conexión (RI-003). */
async function cargarLogo(id: string): Promise<string | null> {
  if (memoria.has(id)) return memoria.get(id)!;
  const guardado = await almacenDatos.leer<string>(`logo:${id}`);
  if (guardado) {
    memoria.set(id, guardado);
    return guardado;
  }
  try {
    const r = await fetch(`${URL_API}/logos/${id}`, { headers: { Authorization: `Bearer ${tokenActual()}` } });
    if (!r.ok) return null;
    const uri = `data:${r.headers.get('content-type') ?? 'image/png'};base64,${aBase64(new Uint8Array(await r.arrayBuffer()))}`;
    memoria.set(id, uri);
    await almacenDatos.guardar(`logo:${id}`, uri);
    return uri;
  } catch {
    return null;
  }
}

export function Logo({ id, tamano = 24 }: { id: string | null | undefined; tamano?: number }) {
  // Se guarda junto con el id para no mostrar el logo anterior si cambia.
  const [cargado, setCargado] = useState<{ id: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let vigente = true;
    if (!pendientes.has(id)) pendientes.set(id, cargarLogo(id).finally(() => pendientes.delete(id)));
    void pendientes.get(id)!.then((u) => vigente && setCargado({ id, uri: u }));
    return () => {
      vigente = false;
    };
  }, [id]);
  if (!id) return null;
  const uri = memoria.get(id) ?? (cargado?.id === id ? cargado.uri : null);
  if (!uri) return <View style={{ width: tamano, height: tamano }} />;
  return <Image source={{ uri }} style={{ width: tamano, height: tamano, borderRadius: 4 }} accessibilityIgnoresInvertColors importantForAccessibility="no" />;
}
