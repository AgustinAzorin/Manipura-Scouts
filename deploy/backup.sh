#!/usr/bin/env bash
# Backup diario (RNF-005 a RNF-010): base de Supabase (esquema public) + archivos subidos,
# cifrado con una clave propia y copiado fuera del servidor si BACKUP_REMOTO está configurado.
# Lo corre cron como root (ver docs/desplegar.md). Uso manual: sudo deploy/backup.sh
set -euo pipefail

DIR_DEPLOY="$(cd "$(dirname "$0")" && pwd)"
ENV_ARCHIVO="${ENV_ARCHIVO:-$DIR_DEPLOY/.env}"
DIR_DATOS="${DIR_DATOS:-/srv/scouttracker-datos}"
DIR_BACKUPS="${DIR_BACKUPS:-/var/backups/scouttracker}"
CLAVE="${CLAVE_BACKUP:-/root/.scouttracker-backup.clave}"
DIAS_LOCAL="${DIAS_LOCAL:-7}"
DIAS_REMOTO="${DIAS_REMOTO:-60}"
# Cliente de PostgreSQL 17 en Docker: tiene que ser de la misma versión o más nueva que la de Supabase.
PG_DUMP="${PG_DUMP:-docker run --rm -i -v $DIR_DATOS/supabase.crt:/ca.crt:ro postgres:17 pg_dump}"

# Lee una variable del .env sin ejecutarlo (MAIL_REMITENTE tiene "<" y espacios).
valor() { grep -E "^$1=" "$ENV_ARCHIVO" | tail -n1 | cut -d= -f2- || true; }

URL="$(valor DATABASE_URL)"
[ -n "$URL" ] || { echo "Falta DATABASE_URL en $ENV_ARCHIVO" >&2; exit 1; }
[ -r "$CLAVE" ] || { echo "Falta la clave de cifrado en $CLAVE (ver la guía)" >&2; exit 1; }
# Mismo criterio que el servidor: verificar a Supabase con su certificado, salvo que se haya desactivado.
if [ -z "${SSL_PARAMS+x}" ]; then
  if [ "$(valor DATABASE_SSL)" = "sin-verificar" ]; then SSL_PARAMS="sslmode=require"; else SSL_PARAMS="sslmode=verify-full&sslrootcert=/ca.crt"; fi
fi
if [ -n "$SSL_PARAMS" ]; then
  case "$URL" in *\?*) URL="$URL&$SSL_PARAMS" ;; *) URL="$URL?$SSL_PARAMS" ;; esac
fi

fecha="$(date +%Y-%m-%d_%H%M)"
destino="$DIR_BACKUPS/scouttracker-$fecha.tar.gpg"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$DIR_BACKUPS"
chmod 700 "$DIR_BACKUPS"

# Solo el esquema public: el resto de la base es de Supabase y no se restaura.
$PG_DUMP "$URL" --schema=public --no-owner --no-privileges --format=custom > "$tmp/base.dump"
tar -C "$DIR_DATOS" -czf "$tmp/archivos.tgz" archivos
tar -C "$tmp" -cf - base.dump archivos.tgz |
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$CLAVE" --symmetric --cipher-algo AES256 -o "$destino"
chmod 600 "$destino"
echo "$(date '+%F %T') Backup listo: $destino ($(du -h "$destino" | cut -f1))"

find "$DIR_BACKUPS" -name 'scouttracker-*.tar.gpg' -mtime +"$DIAS_LOCAL" -delete

REMOTO="$(valor BACKUP_REMOTO)"
if [ -n "$REMOTO" ]; then
  rclone copy "$destino" "$REMOTO"
  rclone delete --min-age "${DIAS_REMOTO}d" --include 'scouttracker-*.tar.gpg' "$REMOTO"
  echo "$(date '+%F %T') Copiado a $REMOTO"
fi
