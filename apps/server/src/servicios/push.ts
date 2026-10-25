/** RF-080 / RI-011: notificaciones push a Android e iOS por el servicio de Expo (FCM y APNs). */

export interface MensajePush {
  token: string;
  titulo: string;
  cuerpo: string;
  /** RF-081: pantalla que abre la app al tocar la notificación. */
  datos?: { ruta?: string };
}

export interface TransportePush {
  /** Envía los mensajes y devuelve los tokens que ya no son válidos (app desinstalada). */
  enviar(mensajes: MensajePush[]): Promise<{ tokensInvalidos: string[] }>;
}

const URL_EXPO = 'https://exp.host/--/api/v2/push/send';
const LOTE_EXPO = 100;

export class TransporteExpo implements TransportePush {
  constructor(private readonly accessToken: string | null) {}

  async enviar(mensajes: MensajePush[]) {
    const tokensInvalidos: string[] = [];
    for (let i = 0; i < mensajes.length; i += LOTE_EXPO) {
      const lote = mensajes.slice(i, i + LOTE_EXPO);
      const r = await fetch(URL_EXPO, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(
          lote.map((m) => ({ to: m.token, title: m.titulo, body: m.cuerpo, data: m.datos ?? {}, sound: 'default', channelId: 'avisos' })),
        ),
      });
      if (!r.ok) throw new Error(`Expo push respondió ${r.status}: ${await r.text()}`);
      const { data } = (await r.json()) as { data: { status: string; details?: { error?: string } }[] };
      data.forEach((t, k) => {
        if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered') tokensInvalidos.push(lote[k]!.token);
      });
    }
    return { tokensInvalidos };
  }
}

export class TransportePushConsola implements TransportePush {
  async enviar(mensajes: MensajePush[]) {
    for (const m of mensajes) console.info(`[push] ${m.token.slice(0, 24)}…: ${m.titulo} — ${m.cuerpo}`);
    return { tokensInvalidos: [] };
  }
}

export class TransportePushMemoria implements TransportePush {
  readonly enviados: MensajePush[] = [];
  readonly invalidos = new Set<string>();
  async enviar(mensajes: MensajePush[]) {
    this.enviados.push(...mensajes);
    return { tokensInvalidos: mensajes.map((m) => m.token).filter((t) => this.invalidos.has(t)) };
  }
}
