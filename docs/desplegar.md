# Poner ScoutTracker en producción (DonWeb + Supabase)

Cómo queda armado:

```
Celulares ──HTTPS──▶ Cloud Server de DonWeb (Rosario)          Supabase (São Paulo)
                     ├─ Caddy: HTTPS con certificado automático
                     ├─ Servidor de ScoutTracker ──SSL──────▶  PostgreSQL (fichas, usuarios…)
                     ├─ Documentos y fotos (disco del servidor)
                     └─ Backup diario cifrado ──▶ Google Drive (u otro destino de rclone)
```

Vas a necesitar: el Cloud Server con **Ubuntu 24.04**, un **dominio**, una cuenta en **Supabase** y una
en **Expo** (para compilar la app). Calculá un par de horas la primera vez.

En los comandos, reemplazá lo que está en MAYÚSCULAS. Las líneas que empiezan con `#` son
comentarios: no hace falta copiarlas.

---

## 1. Base de datos en Supabase

1. Entrá a https://supabase.com, creá una organización (plan Free) y un proyecto nuevo:
   - **Region:** South America (São Paulo).
   - **Database password:** generá una larga y **guardala** (gestor de contraseñas). Evitá `@`, `/`, `:` y `?`: van dentro de una URL.
2. **Apagá la API REST de Supabase** (la app no la usa y expone las tablas): *Project Settings → Data API* → desactivá *Enable Data API*.
   El servidor además activa RLS en todas las tablas al arrancar, así que aunque quede encendida no ve datos; apagarla es la segunda barrera.
3. **Dirección de la base:** botón **Connect** (arriba) → **Session pooler**. Copiá la URI. Se ve así:
   `postgresql://postgres.ABCDEFG:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
   Reemplazá `[YOUR-PASSWORD]` por la contraseña del paso 1 (sin los corchetes). Usá el *Session pooler* y no la conexión directa: la directa es solo IPv6.
4. **Certificado SSL:** *Project Settings → Database → SSL Configuration → Download certificate*. Se baja un archivo `.crt`; lo vas a subir al servidor en el paso 4.

> El plan gratis se pausa si pasan 7 días sin uso. El servidor consulta la base cada hora, así que
> con el servidor andando no debería pasar. Si un día la app dice que no hay conexión con el servidor
> y los logs muestran errores de la base, revisá en el panel de Supabase si el proyecto está pausado.

## 2. Dominio

Usá el dominio que viene con el Cloud Server de DonWeb o registrá uno en https://nic.ar.
En la zona DNS del dominio creá un registro:

| Tipo | Nombre | Valor |
|---|---|---|
| A | `api` | la IP pública del Cloud Server |

La dirección del servidor va a ser `https://api.TUDOMINIO.com.ar`. Desde tu compu, `nslookup api.TUDOMINIO.com.ar`
tiene que devolver la IP del servidor (puede tardar hasta una hora en propagarse).

## 3. Preparar el Cloud Server

Conectate por SSH (desde Windows: `ssh root@IP_DEL_SERVIDOR` en PowerShell) y corré:

```bash
# Actualizaciones, y que las de seguridad se instalen solas
apt update && apt upgrade -y
apt install -y unattended-upgrades git rclone
dpkg-reconfigure -f noninteractive unattended-upgrades

# Firewall: solo SSH y web
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443 && ufw --force enable

# Docker (instalador oficial)
curl -fsSL https://get.docker.com | sh
```

## 4. Código y configuración

```bash
git clone https://github.com/AgustinAzorin/Manipura-Scouts.git /srv/scouttracker

# Datos fuera del repositorio: archivos subidos (los usa el contenedor, usuario 1000) y el certificado
mkdir -p /srv/scouttracker-datos/archivos
chown -R 1000:1000 /srv/scouttracker-datos/archivos

cd /srv/scouttracker/deploy
cp .env.example .env
openssl rand -hex 32     # copiá el resultado: es el SECRETO_ENLACES
nano .env
```

Completá en `.env`: `DOMINIO`, `URL_PUBLICA` (con `https://`), `DATABASE_URL` (paso 1.3), `SECRETO_ENLACES`
y `MAIL_RESPONSABLE_TECNICO` (tu mail). `RESEND_API_KEY` puede quedar vacío por ahora. Guardá con Ctrl+O, Enter, Ctrl+X.

Subí el certificado de Supabase **desde tu compu** (otra ventana de PowerShell, en la carpeta donde se bajó):

```bash
scp prod-ca-2021.crt root@IP_DEL_SERVIDOR:/srv/scouttracker-datos/supabase.crt
```

(El nombre del archivo puede variar; en el servidor tiene que quedar como `supabase.crt`.)

## 5. Levantar

```bash
cd /srv/scouttracker/deploy
docker compose up -d --build        # la primera vez tarda unos minutos
docker compose logs -f servidor     # Ctrl+C para salir
```

Cuando el log muestra `Server listening`, abrí `https://api.TUDOMINIO.com.ar/salud` en el navegador:
tiene que decir `{"ok":true}` con candado.

**Si el log muestra un error de certificado** (`self-signed certificate`, `unable to verify` o `Hostname/IP does not match`):
la conexión con Supabase se puede cifrar sin verificar el certificado. En `.env` agregá estas dos líneas y volvé a levantar
con `docker compose up -d`:

```
DATABASE_SSL=sin-verificar
DATABASE_SSL_CA_CONTENEDOR=
```

## 6. Tu usuario de administrador

```bash
cd /srv/scouttracker/deploy
read -s -p "Contraseña (10+ caracteres): " PASSWORD; echo; export PASSWORD
docker compose exec -e PASSWORD servidor node dist/crear-admin.js "TU NOMBRE" TU@MAIL.COM
unset PASSWORD
```

## 7. La app

En tu compu, en `apps/mobile/eas.json`, cambiá `https://api.ejemplo.com.ar` por `https://api.TUDOMINIO.com.ar`
(perfil `production`) y commitealo. Después, en `apps/mobile`:

```bash
# APK para instalar directamente (sin Play Store)
npx eas-cli@latest build --profile production-apk --platform android
```

Te da un enlace para descargar el APK; instalalo en tu celular y en los de los educadores.
Esta versión solo habla con tu servidor y exige HTTPS. Para publicarla en Play Store se usa el perfil
`production` (genera un `.aab`) y hace falta una cuenta de Google Play Console.

## 8. Grupo, rama, equipos y catálogos

1. En la app, iniciá sesión → **Administración → Grupos** → creá el grupo. Entrá al grupo → **Ramas** → creá la rama (por ejemplo "Caminantes").
2. En el servidor, cargá los equipos y valores de catálogo de la planilla (`deploy/ramas/caminantes.json`). Se puede correr más de una vez:

```bash
cd /srv/scouttracker/deploy
docker compose run --rm -v "$PWD/ramas:/ramas:ro" servidor \
  node dist/cargar-rama.js "NOMBRE DEL GRUPO" "Caminantes" /ramas/caminantes.json
```

Para otra rama, copiá el JSON, ajustalo y commitealo (no lleva datos personales).

## 9. Importar la planilla

En la app: **Administración → Rama → Importar planilla** y elegí el CSV o XLSX exportado de la planilla.
El resumen muestra cuántas fichas se crearon, los adultos que no se importan y las fichas a revisar.
Con la planilla actual son 40 protagonistas y 11 fichas para revisar (ver README).

Después, desde **Administración → Grupo → Usuarios**, invitá a los educadores.

## 10. Backups diarios

```bash
# Clave de cifrado de los backups. GUARDALA TAMBIÉN FUERA DEL SERVIDOR (gestor de contraseñas):
# sin ella los backups no se pueden abrir.
openssl rand -base64 48 > /root/.scouttracker-backup.clave
chmod 600 /root/.scouttracker-backup.clave
cat /root/.scouttracker-backup.clave
```

**Copia fuera del servidor (Google Drive):** `rclone config` → `n` (nuevo) → nombre `gdrive` → tipo `drive` →
dejá *client_id* y *client_secret* vacíos → *scope* `1` → cuando pregunte por *auto config* respondé `n`
y seguí las instrucciones (te pide correr `rclone authorize "drive"` en una compu con navegador y pegar el resultado).
Después, en `deploy/.env`: `BACKUP_REMOTO=gdrive:scouttracker-backups`.

Probalo y programalo para todos los días a las 3:30:

```bash
/srv/scouttracker/deploy/backup.sh
echo '30 3 * * * root /srv/scouttracker/deploy/backup.sh >> /var/log/scouttracker-backup.log 2>&1' > /etc/cron.d/scouttracker-backup
```

Quedan 7 días en el servidor (`/var/backups/scouttracker`) y 60 en Drive. El backup semanal de DonWeb copia además todo el servidor.
Cada tanto mirá `tail /var/log/scouttracker-backup.log`: cada día tiene que decir `Backup listo`.

**Restaurar** (reemplaza todos los datos actuales por los del backup; pide escribir RESTAURAR):

```bash
/srv/scouttracker/deploy/restaurar.sh /var/backups/scouttracker/scouttracker-AAAA-MM-DD_HHMM.tar.gpg
# Si el backup está solo en Drive, primero: rclone copy gdrive:scouttracker-backups/ARCHIVO /var/backups/scouttracker/
```

## Actualizar a una versión nueva

Antes, sacá un snapshot del Cloud Server desde el panel de DonWeb.

```bash
cd /srv/scouttracker && git pull
cd deploy && docker compose up -d --build
docker image prune -f      # borra imágenes viejas (el disco es de 20 GB)
```

Las migraciones de la base se aplican solas al arrancar.

## Problemas comunes

| Síntoma | Qué mirar |
|---|---|
| La app dice que no hay conexión | `docker compose ps` (¿está `healthy`?) y `docker compose logs --tail 100 servidor`. |
| `/salud` no abre o sin candado | El DNS (`nslookup`), el firewall (`ufw status`) y `docker compose logs caddy`. Caddy necesita los puertos 80 y 443 libres. |
| Errores de conexión a la base | Proyecto pausado en Supabase, contraseña mal escrita en `DATABASE_URL`, o el certificado (paso 5). |
| Disco lleno | `df -h`, `du -sh /srv/scouttracker-datos/archivos /var/backups/scouttracker`, `docker system df`. |
| No llegan mails | Sin `RESEND_API_KEY` los enlaces quedan en `docker compose logs servidor`. Para enviarlos, creá una cuenta en Resend, verificá el dominio y completá `RESEND_API_KEY` y `MAIL_REMITENTE`. |
