import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { opcionesSsl } from '../src/db';

describe('SSL hacia la base (Supabase)', () => {
  it('sin variables no usa SSL (base local o de pruebas)', () => {
    expect(opcionesSsl({})).toBeUndefined();
  });

  it('con DATABASE_SSL_CA verifica el servidor contra ese certificado', () => {
    const archivo = path.join(mkdtempSync(path.join(tmpdir(), 'ca-')), 'supabase.crt');
    writeFileSync(archivo, '-----BEGIN CERTIFICATE-----\nficticio\n-----END CERTIFICATE-----\n');
    expect(opcionesSsl({ DATABASE_SSL_CA: archivo })).toEqual({ ca: '-----BEGIN CERTIFICATE-----\nficticio\n-----END CERTIFICATE-----\n' });
  });

  it('DATABASE_SSL=sin-verificar cifra sin verificar', () => {
    expect(opcionesSsl({ DATABASE_SSL: 'sin-verificar' })).toEqual({ rejectUnauthorized: false });
  });
});
