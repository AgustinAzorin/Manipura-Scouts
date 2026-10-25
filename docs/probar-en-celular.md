# Probar la app en un celular o en un emulador

Hay dos formas de verla funcionando en Android:

- **Opción A — APK en tu celular**: EAS compila en la nube y te da un APK para instalar. Es la que más se parece a lo que van a usar los educadores (ideal en el Motorola Moto G22 de referencia).
- **Opción B — Emulador en tu compu**: Android Studio compila e instala la app en un celular virtual. Sirve para probar rápido mientras se programa.

En las dos, la app necesita llegar a un servidor. Primero se levanta el servidor en tu compu (paso 1), después se lo hace accesible para el celular (paso 2).

> iOS: el simulador y la compilación local necesitan una Mac. Sin Mac, la app de iOS se compila con EAS y se instala por TestFlight (requiere la cuenta de Apple Developer, DEP-03). Queda para más adelante.

---

## 1. Servidor en tu compu

Necesitás **Node 22** y **Docker Desktop** (o un PostgreSQL 16 instalado).

```bash
git clone https://github.com/AgustinAzorin/Manipura-Scouts.git
cd Manipura-Scouts
npm install

npm run db        # levanta PostgreSQL con Docker (docker-compose.yml)
```

Copiá `apps/server/.env.local.example` como `apps/server/.env`. Por ahora dejalo como está; en el paso 2 vas a cambiar `URL_PUBLICA`.

```bash
npm run demo      # carga datos ficticios: un grupo, 2 ramas, 4 equipos y 30 fichas
npm run servidor  # deja el servidor andando en http://localhost:3000
```

Usuarios de prueba (contraseña `demo-scouttracker`):

| Usuario | Qué puede hacer |
|---|---|
| `admin@demo.ar` | Admin de plataforma y del grupo: todo, incluida la administración |
| `educador@demo.ar` | Educador en Caminantes, con datos sensibles |
| `lector@demo.ar` | Solo lectura en el equipo Cóndor, sin datos sensibles |

Sin `RESEND_API_KEY` no se envían mails: los de invitación y recuperación aparecen en la consola del servidor, con el enlace para copiar.

## 2. Que el celular llegue al servidor

Elegí una de estas dos opciones.

### 2.a Túnel HTTPS (recomendado: funciona con datos móviles y en cualquier red)

1. Instalá `cloudflared`: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Con el servidor andando, en otra terminal:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. Te muestra una dirección del tipo `https://palabras-al-azar.trycloudflare.com`. Esa es la **dirección del servidor**.
4. Poné esa dirección en `URL_PUBLICA` de `apps/server/.env` y reiniciá el servidor, para que los enlaces de los mails apunten ahí.

La dirección cambia cada vez que abrís el túnel: en la app se actualiza desde la pantalla de inicio de sesión (paso 3), no hace falta recompilar.

### 2.b Misma red Wi-Fi

1. Buscá la IP de tu compu en la red: en Windows `ipconfig` (Dirección IPv4); en macOS o Linux `ip addr` o `ifconfig`. Por ejemplo `192.168.0.10`.
2. La dirección del servidor es `http://192.168.0.10:3000`.
3. Si usás Windows, aceptá el aviso del firewall para Node (redes privadas), o abrí el puerto 3000.
4. Para el **emulador** de Android Studio la dirección es siempre `http://10.0.2.2:3000` (así ve el emulador a tu compu).

Las versiones de prueba de la app aceptan `http://`. La de producción exige `https://` (RI-013).

## 3. Elegir el servidor en la app

Las versiones de prueba ("ScoutTracker Prueba" y "ScoutTracker Dev") muestran abajo, en la pantalla de inicio de sesión, **"Versión de prueba · Servidor: …"**:

1. Tocá **Cambiar servidor**.
2. Escribí la dirección del paso 2 y tocá **Probar y guardar**. Tiene que decir "Conectado".
3. Iniciá sesión con uno de los usuarios de prueba.

---

## Opción A — APK en tu celular (EAS)

Una sola vez:

1. Creá una cuenta gratis en https://expo.dev.
2. En la carpeta de la app:
   ```bash
   cd apps/mobile
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```
   `init` crea el proyecto en Expo. Si avisa que no puede escribir el `projectId` porque la configuración es dinámica, copialo en `app.json` dentro de `"expo"`:
   ```json
   "extra": { "eas": { "projectId": "el-id-que-te-muestra" } }
   ```
   y commitealo.

Cada vez que quieras un APK nuevo:

```bash
cd apps/mobile
npx eas-cli@latest build --profile preview --platform android
```

- La primera vez pregunta si genera una clave de firma (keystore): respondé que sí, EAS la guarda.
- Tarda unos minutos (en el plan gratis puede haber cola). Al terminar te da un enlace y un QR.
- Abrí el enlace desde el celular, descargá el APK e instalalo. Android va a pedir permiso para "instalar apps desconocidas" del navegador.
- La app se llama **ScoutTracker Prueba** y puede convivir con la versión final.

Seguí con el paso 3 para elegir el servidor.

### Variante: build de desarrollo (recarga en vivo)

Si vas a programar, conviene el perfil `development`: se instala una vez y el código se carga desde tu compu, así cada cambio se ve al instante.

```bash
npx eas-cli@latest build --profile development --platform android   # una vez
npm run app                                                          # en la raíz, cada vez
```

Abrí "ScoutTracker Dev" en el celular (misma Wi-Fi que la compu) y elegí el servidor de desarrollo que muestra, o escaneá el QR de la terminal.

---

## Opción B — Emulador de Android Studio

Una sola vez:

1. Instalá Android Studio: https://developer.android.com/studio (trae el SDK y el JDK).
2. En Android Studio: **More Actions → Virtual Device Manager → Create device** (por ejemplo un Pixel con Android 14, imagen x86_64 o arm64 según tu compu).
3. Definí la variable `ANDROID_HOME` con la ruta del SDK (Android Studio la muestra en **Settings → Android SDK**). En Windows suele ser `C:\Users\<vos>\AppData\Local\Android\Sdk`.
4. En el emulador, para probar el bloqueo (RNF-016): **Ajustes → Seguridad** → configurá un PIN y una huella. La huella se "toca" desde los controles extendidos del emulador (**⋯ → Fingerprint → Touch sensor**).

Cada vez:

```bash
# con el emulador abierto y el servidor andando
npm run android
```

La primera compilación tarda varios minutos. Se instala **ScoutTracker Dev**; en el paso 3 usá `http://10.0.2.2:3000` como servidor.

---

## Qué probar (Parte 1)

| Qué | Cómo | Requisito |
|---|---|---|
| Bloqueo | Cerrá la app y abrila: pide huella o PIN. Dejala 5 minutos sin tocar: vuelve a pedirlo. | RNF-016 |
| Nómina | Desplazá la tabla a los costados: la columna Nombre queda fija. Ordená tocando "Edad" dos veces. | RF-029, RF-033 |
| Columnas y filtros | Agregá la columna "DNI", filtrá por equipo y edad, cerrá y abrí la app: se conservan. | RF-030, RF-031 |
| Búsqueda | Buscá "acosta" (sin tilde) o un DNI con puntos. | RF-032 |
| Sin datos sensibles | Entrá como `lector@demo.ar`: no ve DNI ni teléfonos y solo ve su equipo. | RF-019, RF-020 |
| Emergencia | Abrí una ficha y tocá "Llamar". Cronometrá cuánto tarda alguien que nunca usó la app (meta: 30 s). | RNF-030 |
| Edición | Editá un teléfono y mirá el historial. | RF-024, RF-026 |
| Edición simultánea | Abrí la misma ficha en dos celulares, guardá en uno y después en el otro. | RF-025 |
| Documentos | Sacá una foto de un documento y adjuntá un PDF; abrilo. | RF-041, RI-004 |
| Sin conexión | Poné el celular en modo avión y abrí la app: ves la nómina con "Datos al…" y no podés editar. | RF-054 a RF-056 |
| Cerrar sesión | Desde el menú: los datos guardados se borran del celular. | RF-013 |
| Importación | Como admin, en Administración → Rama → Importar planilla, elegí un CSV o XLSX guardado en el celular. Usá datos ficticios. | RF-049 a RF-053 |

## Qué probar (Parte 2: actividades)

`npm run demo` crea una reunión de la semana pasada (con asistencia) y un campamento dentro de tres
semanas con 18 confirmados y 2 de ellos sin autorización.

| Qué | Cómo | Requisito |
|---|---|---|
| Columna "Va" | En la nómina, la columna Va muestra Va / No va / Sin respuesta para el campamento. | RF-067 |
| Vista de control | Menú → Actividades → el campamento: totales 18 van y 2 sin autorización. | RF-071 |
| Escenario de campamento | Con datos sincronizados, poné dos celulares en modo avión, marcá presentes y autorizaciones en los dos (a uno de los mismos chicos "Presente" en uno y nada en el otro), cerrá la app y sacá el modo avión: todo llega al servidor sin tocar nada y queda "Presente". | RF-057 a RF-059, RN-08 |
| Presente sin autorización | Marcá presente a alguien sin autorización: aparece el aviso, el presente queda y la fila se señala. | RF-066 |
| Confirmación sin señal | En modo avión, tocá "Va" de alguien: la app avisa que requiere conexión. | RF-055 |
| Asistencia de 25 | Cronometrá a alguien que nunca usó la app marcando la asistencia de 25 (meta: 3 min). | RNF-031 |
| Crear y cancelar | Creá una actividad con fin anterior al inicio (se rechaza), después una válida; cancelala: queda visible como cancelada. | RF-060 a RF-062 |
| Tipos de actividad | Como admin: Administración → Tipos de actividad. Un tipo sin "Requiere autorización" no muestra esa columna. | RF-063 |
| Porcentaje de asistencia | Abrí una ficha: muestra la asistencia del año. | RF-069 |
| Reporte | En una actividad, "Reporte de asistencia"; en Actividades anteriores, las de otros años. | RF-070 |

## Qué probar (Parte 2: calendario y avisos)

En el servidor de desarrollo los push se escriben en su consola (`[push] …`). Para que lleguen de verdad
al celular hacen falta la build con el proyecto de EAS y Firebase ([desplegar.md](desplegar.md), paso 7)
y arrancar el servidor con `EXPO_PUSH=si`.

| Qué | Cómo | Requisito |
|---|---|---|
| Vistas | Menú → Calendario: cambiá entre Mes, Semana y Día. | RF-072 |
| Actividades | El campamento de la demo aparece en sus tres días, con el color de su tipo. Con `lector@demo.ar` (equipo Cóndor) no se ven las de otros equipos. | RF-073, RN-19 |
| Cumpleaños | Cada protagonista activo aparece el día de su cumpleaños; uno archivado, no. | RF-074 |
| Feriados | Al arrancar, el servidor trae los nacionales de ArgentinaDatos. Como admin: Administración → Feriados → cargá uno propio. | RF-075, RF-076 |
| Recordatorios | "+ Recordatorio": lo ves vos y no otro usuario. Tocalo para borrarlo. | RF-077 |
| Avisos programados | Creá una actividad para dentro de 2 horas con aviso "1 hora antes": a la hora llega el push (o el log `[push]`) y el mail. No se puede elegir un tercer aviso. | RF-078, RN-16 |
| Destinatarios | Elegí "Rol Jefe de rama": solo les llega a ellos. | RF-079 |
| Tocar el aviso | Con la app cerrada, tocá la notificación: abre la actividad. | RF-081 |
| Aviso de cumpleaños | A las 9:00 del día llega el aviso a los educadores de la rama. | RF-083, RN-15 |
| Preferencias | Menú → Avisos: apagá el mail de cumpleaños y comprobá que llega solo el push. | RF-084 |
| Cambios | Mové de fecha una actividad con avisos: llega "Cambio en…"; cancelala: llega "Cancelada:…". | RF-085, RF-061, RF-062 |
| Avisos manuales | Como admin: Administración → Avisos al grupo. Mandá uno a la rama Caminantes y otro "importante"; mirá el historial. | RF-086, RF-087 |

## Problemas comunes

- **"No responde un servidor de ScoutTracker en esa dirección"**: el servidor no está andando, el túnel se cerró, la IP cambió, o el firewall bloquea el puerto 3000. Probá abrir `https://…/salud` en el navegador del celular: tiene que mostrar `{"ok":true}`.
- **La app no abre en Expo Go**: es lo esperado. Usa módulos nativos (llavero, biometría, cámara) que Expo Go no trae; hace falta un APK o una build de desarrollo.
- **Los enlaces de los mails no abren en el celular**: `URL_PUBLICA` sigue en `localhost`. Cambiala por la dirección del túnel o la IP y reiniciá el servidor.
