import { sql } from 'kysely';
import { hoyAR } from '@scouttracker/shared';
import type { Db } from '../db';

export type TipoMail = 'invitacion' | 'recuperacion' | 'aviso' | 'error';

export interface Mail {
  para: string;
  asunto: string;
  texto: string;
  tipo: TipoMail;
}

/** Transporte de mails: Resend en producción, memoria en pruebas, consola en desarrollo. */
export interface TransporteMail {
  enviar(mail: Mail): Promise<void>;
}

export class TransporteResend implements TransporteMail {
  constructor(
    private readonly apiKey: string,
    private readonly remitente: string,
  ) {}

  async enviar(mail: Mail): Promise<void> {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.remitente, to: [mail.para], subject: mail.asunto, text: mail.texto }),
    });
    if (!r.ok) throw new Error(`Resend respondió ${r.status}: ${await r.text()}`);
  }
}

export class TransporteConsola implements TransporteMail {
  async enviar(mail: Mail): Promise<void> {
    console.info(`[mail ${mail.tipo}] a ${mail.para}: ${mail.asunto}\n${mail.texto}`);
  }
}

export class TransporteMemoria implements TransporteMail {
  readonly enviados: Mail[] = [];
  async enviar(mail: Mail): Promise<void> {
    this.enviados.push(mail);
  }
}

/** RN-14: tope de 100 mails por día; desde el envío 91 los avisos de eventos salen solo por push. */
export const TOPE_MAILS_DIARIO = 100;
export const TOPE_MAILS_AVISOS = 90;

export class Mailer {
  constructor(
    private readonly db: Db,
    private readonly transporte: TransporteMail,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  /** Mails enviados hoy (hora de Argentina). */
  async enviadosHoy(): Promise<number> {
    const inicio = new Date(`${hoyAR(this.ahora())}T00:00:00-03:00`);
    const r = await this.db
      .selectFrom('mails')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('enviado', '=', true)
      .where('creado_en', '>=', inicio)
      .executeTakeFirstOrThrow();
    return r.n;
  }

  /** Envía respetando el tope. Devuelve false si no se envió (queda registrado). */
  async enviar(mail: Mail): Promise<boolean> {
    const tope = mail.tipo === 'aviso' ? TOPE_MAILS_AVISOS : TOPE_MAILS_DIARIO;
    if ((await this.enviadosHoy()) >= tope) {
      await this.registrar(mail.tipo, false, 'tope diario alcanzado');
      return false;
    }
    try {
      await this.transporte.enviar(mail);
      await this.registrar(mail.tipo, true, null);
      return true;
    } catch (e) {
      await this.registrar(mail.tipo, false, (e as Error).message.slice(0, 500));
      return false;
    }
  }

  private async registrar(tipo: string, enviado: boolean, detalle: string | null) {
    await this.db.insertInto('mails').values({ tipo, enviado, detalle }).execute();
  }
}
