#!/usr/bin/env bash
# Restaura un backup de deploy/backup.sh: reemplaza las tablas de la app en Supabase y los
# archivos subidos por los del backup. Detiene el servidor mientras tanto.
# Uso: sudo deploy/restaurar.sh /var/backups/scouttracker/scouttracker-AAAA-MM-DD_HHMM.tar.gpg
set -euo pipefail

DIR_DEPLOY="$(cd "$(dirname "$0")" && pwd)"
ENV_ARCHIVO="${ENV_ARCHIVO:-$DIR_DEPLOY/.env}"
DIR_DATOS="${DIR_DATOS:-/srv/scouttracker-datos}"
CLAVE="${CLAVE_BACKUP:-/root/.scouttracker-backup.clave}"
PG_RESTORE="${PG_RESTORE:-docker run --rm -i -v $DIR_DATOS/supabase.crt:/ca.crt:ro postgres:17 pg_restore}"
COMPOSE="${COMPOSE:-docker compose -f $DIR_DEPLOY/docker-compose.yml}"

valor() { grep -E "^$1=" "$ENV_ARCHIVO" | tail -n1 | cut -d= -f2- || true; }

archivo="${1:-}"
[ -f "$archivo" ] || { echo "Uso: $0 archivo.tar.gpg" >&2; exit 1; }
URL="$(valor DATABASE_URL)"
[ -n "$URL" ] || { echo "Falta DATABASE_URL en $ENV_ARCHIVO" >&2; exit 1; }
if [ -z "${SSL_PARAMS+x}" ]; then
  if [ "$(valor DATABASE_SSL)" = "sin-verificar" ]; then SSL_PARAMS="sslmode=require"; else SSL_PARAMS="sslmode=verify-full&sslrootcert=/ca.crt"; fi
fi
if [ -n "$SSL_PARAMS" ]; then
  case "$URL" in *\?*) URL="$URL&$SSL_PARAMS" ;; *) URL="$URL?$SSL_PARAMS" ;; esac
fi

echo "Esto reemplaza TODOS los datos actuales de la app por los del backup:"
echo "  $archivo"
if [ "${CONFIRMAR:-}" != "RESTAURAR" ]; then
  read -r -p 'Escribí RESTAURAR para seguir: ' respuesta
  [ "$respuesta" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$CLAVE" -d "$archivo" | tar -C "$tmp" -xf -

$COMPOSE stop servidor
# --clean borra y recrea solo los objetos que están en el backup (las tablas de la app).
$PG_RESTORE --dbname "$URL" --clean --if-exists --no-owner --no-privileges --single-transaction < "$tmp/base.dump"
# Los archivos actuales quedan aparte por si hacen falta.
anterior="$DIR_DATOS/archivos.antes-$(date +%Y-%m-%d_%H%M)"
[ -d "$DIR_DATOS/archivos" ] && mv "$DIR_DATOS/archivos" "$anterior"
tar -C "$DIR_DATOS" -xzf "$tmp/archivos.tgz"
# El contenedor corre como el usuario node (uid 1000).
chown -R 1000:1000 "$DIR_DATOS/archivos" 2>/dev/null || true
$COMPOSE start servidor
echo "Restaurado. Los archivos que había antes quedaron en $anterior (borralos cuando confirmes que todo está bien)."
