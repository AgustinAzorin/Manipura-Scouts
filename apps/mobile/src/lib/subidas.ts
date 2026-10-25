import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { TAMANO_MAXIMO_ARCHIVO } from '@scouttracker/shared';
import { pedir } from './api';

export interface ArchivoElegido {
  uri: string;
  nombre: string;
  mime: string;
  tamano?: number | null;
  /** Solo en web: el File del navegador. */
  archivoWeb?: Blob;
}

export class ArchivoGrande extends Error {
  constructor() {
    super('El archivo supera el límite de 10 MB');
  }
}

function verificarTamano(a: ArchivoElegido, maximo = TAMANO_MAXIMO_ARCHIVO) {
  if (a.tamano && a.tamano > maximo) throw new ArchivoGrande();
  return a;
}

/** Elige un archivo del dispositivo (RF-041). */
export async function elegirArchivo(tipos: string[] = ['application/pdf', 'image/jpeg', 'image/png']): Promise<ArchivoElegido | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: tipos, copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return verificarTamano({ uri: a.uri, nombre: a.name, mime: a.mimeType ?? 'application/octet-stream', tamano: a.size, archivoWeb: a.file });
}

/** Fotografía un documento con la cámara (RI-004). */
export async function sacarFoto(): Promise<ArchivoElegido | null> {
  const permiso = await ImagePicker.requestCameraPermissionsAsync();
  if (!permiso.granted) throw new Error('Sin permiso para usar la cámara. Habilitalo en los ajustes del celular.');
  const r = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.7 });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return verificarTamano({ uri: a.uri, nombre: a.fileName ?? `foto-${Date.now()}.jpg`, mime: a.mimeType ?? 'image/jpeg', tamano: a.fileSize, archivoWeb: a.file ?? undefined });
}

/** Elige una imagen de la galería (logos, RF-047). */
export async function elegirImagen(): Promise<ArchivoElegido | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.9 });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return verificarTamano({ uri: a.uri, nombre: a.fileName ?? 'logo.png', mime: a.mimeType ?? 'image/png', tamano: a.fileSize, archivoWeb: a.file ?? undefined }, 1024 * 1024);
}

export async function subir<T>(ruta: string, archivo: ArchivoElegido): Promise<T> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = archivo.archivoWeb ?? (await (await fetch(archivo.uri)).blob());
    form.append('archivo', blob, archivo.nombre);
  } else {
    // En React Native, FormData acepta { uri, name, type } y lee el archivo del disco.
    form.append('archivo', { uri: archivo.uri, name: archivo.nombre, type: archivo.mime } as unknown as Blob);
  }
  return pedir<T>('POST', ruta, form);
}
