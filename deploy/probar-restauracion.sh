#!/usr/bin/env bash
# Prueba de restauración (RNF-008 a RNF-010): abre un backup de deploy/backup.sh, lo restaura en
# una base PostgreSQL temporal (no toca la de producción ni los archivos) y comprueba que cada
# archivo que figura en la base esté en el backup. Deja una línea en el registro de pruebas.
# Uso: sudo deploy/probar-restauracion.sh /var/backups/scouttracker/scouttracker-AAAA-MM-DD_HHMM.tar.gpg
set -euo pipefail

CLAVE="${CLAVE_BACKUP:-/root/.scouttracker-backup.clave}"
REGISTRO="${REGISTRO:-/var/log/scouttracker-restauracion.log}"
CONTENEDOR=scouttracker-prueba-restauracion

archivo="${1:-}"
[ -f "$archivo" ] || { echo "Uso: $0 archivo.tar.gpg" >&2; exit 1; }
[ -r "$CLAVE" ] || { echo "Falta la clave de cifrado en $CLAVE (ver la guía)" >&2; exit 1; }

inicio=$(date +%s)
tmp="$(mktemp -d)"
con_contenedor=0
limpiar() {
  rm -rf "$tmp"
  [ "$con_contenedor" -eq 0 ] || docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true
}
trap limpiar EXIT

gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$CLAVE" -d "$archivo" | tar -C "$tmp" -xf -

# Base temporal: un contenedor de PostgreSQL 17 que se borra al terminar. URL_PRUEBA, PG_RESTORE y
# PSQL permiten usar otra base vacía (por ejemplo, para probar el script sin Docker).
if [ -z "${URL_PRUEBA:-}" ]; then
  docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true
  docker run -d --name "$CONTENEDOR" -e POSTGRES_PASSWORD=prueba postgres:17 >/dev/null
  con_contenedor=1
  # Por TCP: mientras se inicializa, PostgreSQL solo escucha en el socket local.
  until docker exec "$CONTENEDOR" pg_isready -h localhost -U postgres -q; do sleep 1; done
  URL_PRUEBA=postgres://postgres:prueba@localhost/postgres
  PG_RESTORE="${PG_RESTORE:-docker exec -i $CONTENEDOR pg_restore}"
  PSQL="${PSQL:-docker exec -i $CONTENEDOR psql}"
fi
PG_RESTORE="${PG_RESTORE:-pg_restore}"
PSQL="${PSQL:-psql}"

# Las mismas opciones que restaurar.sh, así se prueba la restauración real.
$PG_RESTORE --dbname "$URL_PRUEBA" --clean --if-exists --no-owner --no-privileges --single-transaction < "$tmp/base.dump"
contar() { $PSQL "$URL_PRUEBA" -tAc "SELECT count(*) FROM $1"; }
fichas=$(contar fichas)
usuarios=$(contar usuarios)
actividades=$(contar actividades)

# Cada archivo de la base tiene que estar en el backup, en archivos/<2 primeras letras>/<clave>.
tar -C "$tmp" -xzf "$tmp/archivos.tgz"
faltan=0
total=0
while read -r clave; do
  [ -n "$clave" ] || continue
  total=$((total + 1))
  [ -f "$tmp/archivos/${clave:0:2}/$clave" ] || faltan=$((faltan + 1))
done < <($PSQL "$URL_PRUEBA" -tAc "SELECT clave FROM archivos")

segundos=$(( $(date +%s) - inicio ))
resultado=OK
[ "$faltan" -eq 0 ] || resultado="FALTAN $faltan ARCHIVOS"
linea="$(date '+%F %T') $resultado backup=$(basename "$archivo") fichas=$fichas usuarios=$usuarios actividades=$actividades archivos=$total duracion=${segundos}s"
echo "$linea" | tee -a "$REGISTRO"
[ "$faltan" -eq 0 ]
