# Poner ScoutTracker en producción (DonWeb + Supabase)

Cómo queda armado:

```
Celulares  ──HTTPS──▶ Cloud Server de DonWeb (Rosario)          Supabase (São Paulo)
Navegadores           ├─ Caddy: HTTPS con certificado automático y la versión web
                     ├─ Servidor de ScoutTracker ──SSL──────▶  PostgreSQL (fichas, usuarios…)
                     ├─ Documentos y fotos (disco del servidor)
                     └─ Backup diario cifrado ──▶ otro almacenamiento (otro servidor por SFTP, Google Drive…)
```

Vas a necesitar: el Cloud Server con **Ubuntu 24.04**, un **dominio**, una cuenta en **Supabase** y una
en **Expo** (para compilar la app). Calculá un par de horas la primera vez.

En los comandos, reemplazá lo que está en MAYÚSCULAS. Las líneas que empiezan con `#` son
comentarios: no hace falta copiarlas.

---

## 1. Base de datos en Supabase

1. Entrá a https://supabase.com, creá una organización (plan Free) y un proyecto nuevo:
   - **Region:** South America (São Paulo). Es la más cercana, pero queda en Brasil: leé
     [Datos fuera de Argentina](#datos-fuera-de-argentina-ley-25326) antes de cargar datos reales.
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
| A | `app` | la misma IP |

La dirección del servidor va a ser `https://api.TUDOMINIO.com.ar` y la versión web `https://app.TUDOMINIO.com.ar`.
Desde tu compu, `nslookup api.TUDOMINIO.com.ar` y `nslookup app.TUDOMINIO.com.ar` tienen que devolver la IP del
servidor (puede tardar hasta una hora en propagarse).

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

Completá en `.env`: `DOMINIO`, `DOMINIO_WEB`, `URL_PUBLICA` (con `https://`), `DATABASE_URL` (paso 1.3), `SECRETO_ENLACES`
y `MAIL_RESPONSABLE_TECNICO` (tu mail: ahí llegan los errores nuevos del servidor y de la app, RNF-034).
`RESEND_API_KEY` puede quedar vacío por ahora. Guardá con Ctrl+O, Enter, Ctrl+X.

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
tiene que decir `{"ok":true}` con candado. La primera vez Caddy también compila la versión web (unos minutos
más): `https://app.TUDOMINIO.com.ar` tiene que mostrar la pantalla de inicio de sesión.

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
(perfil `production`) y commitealo.

**Avisos push (RF-080).** Salen por el servicio gratuito de Expo, que necesita un proyecto de EAS y,
para Android, Firebase. Se hace una sola vez:

1. En `apps/mobile`: `npx eas-cli@latest init`. Copiá el id del proyecto que muestra y agregalo en
   `eas.json` a los perfiles `preview` y `production`, dentro de `env`: `"EAS_PROJECT_ID": "el-id"`.
2. Android: en [console.firebase.google.com](https://console.firebase.google.com) creá un proyecto, agregá
   una app Android con el paquete `ar.scouttracker.app` (y `ar.scouttracker.app.prueba` para la de prueba)
   y bajá `google-services.json`. Subilo a EAS como variable de tipo archivo, sin commitearlo:
   `npx eas-cli@latest env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret`.
3. Android: en Firebase → Configuración del proyecto → Cuentas de servicio, generá una clave privada
   (JSON) y cargala con `npx eas-cli@latest credentials` → Android → *Google Service Account* → *FCM V1*.
4. iOS: `eas build` configura solo las credenciales de push de Apple, con la cuenta del Apple Developer Program.

Sin estos pasos la app funciona igual, pero no recibe notificaciones; los avisos siguen saliendo por
mail. Después, en `apps/mobile`:

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

**Copia fuera del servidor.** Los backups quedan 7 días en el disco del servidor, pero eso solo no
alcanza: si el servidor se rompe, lo borran o lo hackean, se pierden junto con los datos. RNF-007 pide
una copia diaria en otro almacenamiento, guardada 30 días o más. El backup se cifra antes de salir del
servidor, así que el destino no puede leerlo. Elegí uno:

- **Google Drive (el elegido por ahora; gratis hasta 15 GB):** `rclone config` → `n` (nuevo) → nombre
  `gdrive` → tipo `drive` → dejá *client_id* y *client_secret* vacíos → *scope* `1` → cuando pregunte por
  *auto config* respondé `n` y seguí las instrucciones (te pide correr `rclone authorize "drive"` en una
  compu con navegador y pegar el resultado). Después, en `deploy/.env`:
  `BACKUP_REMOTO=gdrive:scouttracker-backups`. Los servidores de Google están fuera del país (ver
  [Datos fuera de Argentina](#datos-fuera-de-argentina-ley-25326)).

- **Otro servidor en Argentina:** el Cloud Server más chico de DonWeb, o cualquier otro equipo con
  SSH en el país. Así nada sale de Argentina (RES-06), pero tiene costo. En ese servidor creá un usuario
  `backups` (`adduser --disabled-password backups`). En el servidor de ScoutTracker:

  ```bash
  ssh-keygen -t ed25519 -f /root/.ssh/backups -N ''
  cat /root/.ssh/backups.pub   # pegalo en /home/backups/.ssh/authorized_keys del otro servidor
  rclone config create respaldo sftp host IP_DEL_OTRO_SERVIDOR user backups key_file /root/.ssh/backups
  rclone mkdir respaldo:scouttracker-backups && rclone lsd respaldo:   # tiene que listar la carpeta
  ```

  Después, en `deploy/.env`: `BACKUP_REMOTO=respaldo:scouttracker-backups`.

Probalo y programalo para todos los días a las 3:30:

```bash
/srv/scouttracker/deploy/backup.sh
echo '30 3 * * * root /srv/scouttracker/deploy/backup.sh >> /var/log/scouttracker-backup.log 2>&1' > /etc/cron.d/scouttracker-backup
```

Quedan 7 días en el servidor (`/var/backups/scouttracker`) y 60 en el otro almacenamiento. El backup semanal de DonWeb copia además todo el servidor.
Cada tanto mirá `tail /var/log/scouttracker-backup.log`: cada día tiene que decir `Backup listo` y `Copiado a`.

**Prueba de restauración cada 3 meses (RNF-010).** `probar-restauracion.sh` restaura un backup en una
base temporal (un contenedor que se borra al terminar), sin tocar la de producción ni los archivos,
y comprueba que cada archivo que figura en la base esté en el backup. Al menos una vez, probá con una
copia bajada del otro almacenamiento, para confirmar que esa copia sirve:

```bash
rclone copy gdrive:scouttracker-backups/ARCHIVO /tmp/
/srv/scouttracker/deploy/probar-restauracion.sh /tmp/ARCHIVO
```

Para que se haga sola el día 1 de enero, abril, julio y octubre con el último backup:

```bash
echo '0 5 1 1,4,7,10 * root /srv/scouttracker/deploy/probar-restauracion.sh "$(ls -t /var/backups/scouttracker/scouttracker-*.tar.gpg | head -1)" >> /var/log/scouttracker-backup.log 2>&1' > /etc/cron.d/scouttracker-prueba-restauracion
```

Cada prueba deja una línea en `/var/log/scouttracker-restauracion.log` con el resultado, la cantidad de
fichas y archivos y cuánto tardó: ese archivo es el registro que pide RNF-010. La duración de la prueba
sirve de referencia para el tiempo de recuperación (RTO ≤ 24 h, RNF-009).

**Restaurar** (reemplaza todos los datos actuales por los del backup; pide escribir RESTAURAR):

```bash
/srv/scouttracker/deploy/restaurar.sh /var/backups/scouttracker/scouttracker-AAAA-MM-DD_HHMM.tar.gpg
# Si el backup está solo en Drive, primero: rclone copy gdrive:scouttracker-backups/ARCHIVO /var/backups/scouttracker/
```

## La versión web

Está en `https://app.TUDOMINIO.com.ar` y se entra con el mismo usuario que en el celular. Se compila al
levantar Caddy (`deploy/web.Dockerfile`) con la dirección de la API de `DOMINIO`, así que no hay nada que
configurar aparte. Para que los educadores la encuentren, mandales el enlace.

En la web los datos de los protagonistas no quedan guardados en la compu: se borran al cerrar la pestaña,
y tras 5 minutos sin uso se pide la contraseña. No funciona sin conexión ni recibe notificaciones push; los
avisos llegan por mail.

**Si ya tenías el servidor andando** antes de que existiera la versión web: agregá el registro DNS `app`
(paso 2) y `DOMINIO_WEB=app.TUDOMINIO.com.ar` en `deploy/.env`, y actualizá como se explica abajo.

## Actualizar a una versión nueva

**Nunca un sábado de 9:00 a 20:00** (RNF-006): es cuando los educadores usan la app en las actividades.
Antes, sacá un snapshot del Cloud Server desde el panel de DonWeb.

```bash
cd /srv/scouttracker && git pull
cd deploy && docker compose up -d --build
docker image prune -f      # borra imágenes viejas (el disco es de 20 GB)
```

Las migraciones de la base se aplican solas al arrancar.

## Datos fuera de Argentina (Ley 25.326)

RES-06 pide que los datos estén en Argentina, o en un proveedor que cubra la transferencia
internacional con cláusulas contractuales. Con esta guía:

| Dónde | Qué guarda | Situación |
|---|---|---|
| Cloud Server de DonWeb (Rosario) | Documentos y fotos, backups de 7 días | En Argentina. |
| Supabase (São Paulo, Brasil) | La base completa: fichas, datos sensibles, usuarios | **Fuera del país y sin cifrar para el proveedor.** Se cubre con el DPA de Supabase (ver abajo). |
| Google Drive | Copia de los backups, cifrada con una clave que Google no tiene | Fuera del país, pero Google no puede leerla. Si esto cuenta como transferencia es una consulta legal; el riesgo es mucho menor que el de la base. |

**Decisión por ahora: la base sigue en Supabase, cubierta por su DPA.** Lo que dice el DPA (versión
del 1/8/2026, <https://supabase.com/legal/customer-resources/data-processing-addendum>):

- La contraparte es Supabase Pte. Ltd. (Singapur). Supabase puede procesar datos donde tengan
  instalaciones sus subprocesadores; elegir São Paulo asegura que se guarden y procesen *principalmente* ahí.
- Usa las cláusulas contractuales tipo de la UE (Decisión 2021/914) y las adapta a otras jurisdicciones
  (Schedule 2, punto 4). No menciona a Argentina ni la Ley 25.326. Aceptar los términos de servicio
  equivale a firmarlo (cláusula 12.2): no hay un documento firmado aparte.

Brasil, Singapur y Estados Unidos no están en la lista de países adecuados de la AAIP, y el DPA no es el
modelo de la AAIP (Disposición 60/2016, Resolución 198/2023). Un contrato distinto del modelo **se presenta
a la AAIP dentro de los 30 días corridos desde la firma**: mail a datospersonales@aaip.gob.ar con copia
del contrato y los puntos en que difiere del modelo (ver
<https://www.argentina.gob.ar/transferencias-internacionales>). Para que el DPA cubra RES-06:

1. Al crear el proyecto en Supabase (paso 1), anotá la fecha en que aceptaste los términos.
2. Bajá el DPA vigente en PDF y mandalo a la AAIP antes de que pasen 30 días.
3. Guardá el mail enviado y la respuesta de la AAIP junto con esta guía: es la evidencia que pide RNF-025.

Si la AAIP lo rechaza, las alternativas son agregar al consentimiento que firman los padres (DEP-06) el
consentimiento expreso para la transferencia, o mover la base a PostgreSQL en el servidor de DonWeb.

## Problemas comunes

| Síntoma | Qué mirar |
|---|---|
| La app dice que no hay conexión | `docker compose ps` (¿está `healthy`?) y `docker compose logs --tail 100 servidor`. |
| La web dice que no hay conexión con el servidor | `DOMINIO_WEB` en `.env` tiene que ser exactamente el dominio con el que se abre la web (sin `https://`): la API solo acepta pedidos del navegador desde ese origen. Después de cambiarlo, `docker compose up -d`. |
| `/salud` no abre o sin candado | El DNS (`nslookup`), el firewall (`ufw status`) y `docker compose logs caddy`. Caddy necesita los puertos 80 y 443 libres. |
| Errores de conexión a la base | Proyecto pausado en Supabase, contraseña mal escrita en `DATABASE_URL`, o el certificado (paso 5). |
| Disco lleno | `df -h`, `du -sh /srv/scouttracker-datos/archivos /var/backups/scouttracker`, `docker system df`. |
| No llegan notificaciones | En la app: Menú → Avisos → "Activar o revisar notificaciones". Si dice que no está disponible, la build no tiene `EAS_PROJECT_ID`; si llegan a iOS y no a Android, faltan las credenciales FCM V1 (paso 7). Los errores de envío llegan por mail al responsable técnico. |
| No llegan mails | Sin `RESEND_API_KEY` los enlaces quedan en `docker compose logs servidor`. Para enviarlos, creá una cuenta en Resend, verificá el dominio y completá `RESEND_API_KEY` y `MAIL_REMITENTE`. |
