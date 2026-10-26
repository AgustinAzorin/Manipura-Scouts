# ScoutTracker

App móvil (Android e iOS) y versión web para el padrón, las actividades y la documentación de ramas scout.
Este repositorio implementa la **Parte 1 — Base** del SRS v1.4 (grupos, ramas, equipos, usuarios,
roles, padrón, importación y consulta sin conexión), la **Parte 2 — Actividades** (RF-057 a
RF-087): actividades, asistencia y autorizaciones con registro sin conexión, calendario y avisos
por push y mail, la **Parte 3 — PDF** (RF-068, RF-088 a RF-105): el generador de la Ficha de
Actividad con anexos que carga cada educador, y la **Parte 4 — Gráficos e inicio** (RF-106 a
RF-116): gráficos, pantalla de inicio con pendientes y exportación de la nómina a Excel.

## Estructura

| Carpeta | Contenido |
|---|---|
| `packages/shared` | Reglas de negocio compartidas: edad (RN-01), TADA (RN-02), DNI y teléfonos (RN-03, RD-009), fechas (RN-04), cuotas (RN-05), documentos (RN-06), permisos por rol y alcance (RF-017 a RF-020), definición de la ficha (RD-002), lógica de la nómina (RF-029 a RF-034), reglas de la Ficha de Actividad (RN-09, RN-10), gráficos y pendientes del inicio (RF-106 a RF-114) y tipos de la API. |
| `apps/server` | API HTTP (Fastify + PostgreSQL con Kysely). Migraciones SQL en `migrations/`. |
| `apps/mobile` | App Expo SDK 58 (React Native, Expo Router). La misma app se exporta como sitio web (react-native-web). |

## Stack y decisiones

- **TypeScript en todo el monorepo** (npm workspaces): las reglas de negocio se escriben y se prueban una sola vez y las usan el servidor y la app.
- **Servidor:** Node 22, Fastify 5, PostgreSQL 16, Kysely (consultas tipadas, migraciones SQL a mano). Contraseñas con scrypt de Node (sin dependencias nativas). Sesiones con token opaco guardado como hash, 30 días desde el inicio de sesión (RNF-015); al desactivar un usuario se borran sus sesiones (RNF-021).
- **Multi-grupo:** toda tabla con datos tiene `grupo_id` y cada operación se autoriza contra las asignaciones del usuario (rol + alcance de grupo, rama o equipo). El estado activo/inactivo de un usuario es **por grupo**, para que el admin de un grupo no pueda dejar sin acceso a alguien en otro.
- **Sin conexión:** la app descarga la nómina de la rama (sin campos sensibles si el usuario no tiene ese permiso, RNF-018) y la guarda cifrada con AES-256-GCM; la clave vive en el llavero del sistema (SecureStore). Sin conexión todo es de solo lectura (RF-055). Los datos se borran al cerrar sesión, si pasan 7 días sin sincronizar o si el usuario pierde el acceso (RF-013, RNF-019, RNF-020).
- **Bloqueo:** se pide huella, rostro o PIN del celular al abrir la app y tras 5 minutos sin uso (RNF-016).
- **Archivos:** almacenamiento privado; se abren solo con enlaces firmados de 10 minutos (RNF-022). El tipo se valida por los bytes del archivo, no por el nombre.
- **PDF:** la Ficha de Actividad se genera en el servidor con pdfmake (JavaScript puro, sin
  navegador ni dependencias nativas), en A4, con la fuente Roboto que trae el paquete. El PDF no
  descarga nada ni lee otros archivos del servidor. La app lo descarga con un enlace firmado y lo
  entrega al menú de compartir del celular (`expo-sharing`).
- **Gráficos e inicio:** se calculan en el celular con los datos guardados, así funcionan sin conexión
  y no exponen nada que el usuario no tenga ya en su nómina. Las barras son vistas comunes de React
  Native (sin librería de gráficos ni módulos nativos nuevos), con nombre y valor escritos en cada una.
- **Excel:** el servidor arma el XLSX con exceljs (la misma librería de la importación) usando las mismas
  reglas de la nómina que la app (`shared/nomina.ts`), y la app lo entrega al menú de compartir.
- **Versión web:** es la misma app exportada con `expo export --platform web`, así las pantallas, los
  permisos y las reglas no se duplican. En pantallas de 900 px o más el menú pasa a una barra lateral
  fija, el contenido se centra y las listas de opciones abren como diálogo. Lo que cambia por la
  plataforma (archivos `*.web.ts`): la sesión y la nómina van en `sessionStorage` y se borran al cerrar
  la pestaña (la compu puede ser compartida); el bloqueo de RNF-016 pide la contraseña tras 5 minutos
  sin uso, sin desmontar la pantalla; el PDF y el Excel se descargan; no hay notificaciones push (los
  avisos siguen llegando por mail). Se sirve con Caddy en su propio dominio y la API la habilita por CORS.
- **Mails:** Resend por HTTP (SUP-06) con el tope diario de RN-14. Los enlaces de invitación y recuperación abren una página web del servidor, que funciona en cualquier celular aunque el cliente de mail no abra la app.

## Desarrollo local

Requisitos: Node 22 y PostgreSQL 16.

```bash
npm install

# Base de datos y admin de plataforma
createdb scouttracker
export DATABASE_URL=postgres://usuario:clave@localhost/scouttracker
npm run migrate -w @scouttracker/server
PASSWORD='una-clave-de-10+' npm run crear-admin -w @scouttracker/server -- "Agustin" agustin@ejemplo.com

# Servidor (los mails se muestran en la consola si no hay RESEND_API_KEY)
npm run dev -w @scouttracker/server

# App: EXPO_PUBLIC_API_URL debe apuntar al servidor (desde el celular, con la IP de la compu)
cd apps/mobile
EXPO_PUBLIC_API_URL=http://192.168.0.10:3000 npx expo start
```

La app usa módulos nativos (SecureStore, biometría, cámara), así que en el celular necesita un
APK o un *development build*, no Expo Go. **Para probarla en un celular o en el emulador de Android
Studio seguí [docs/probar-en-celular.md](docs/probar-en-celular.md)**: levanta PostgreSQL con
Docker, carga datos ficticios (`npm run demo`) y explica cómo conectar el celular al servidor.

Atajos desde la raíz: `npm run db` (PostgreSQL con Docker), `npm run demo`, `npm run servidor`,
`npm run app` y `npm run android`. El servidor lee `apps/server/.env` si existe.

**Versión web:** con el servidor arrancado con `ORIGENES_CORS=http://localhost:8081`, `npm run web -w mobile`
la abre en http://localhost:8081. Achicá la ventana por debajo de 900 px para ver la disposición de celular.
Para revisar la compilación de producción: `npx expo export --platform web` en `apps/mobile` (deja el sitio en `dist/`).

Variables del servidor: ver `apps/server/.env.example`.

## Producción

Servidor en un Cloud Server de DonWeb con Docker (`Dockerfile`, `deploy/docker-compose.yml`: API +
Caddy para HTTPS) y la base en Supabase, con SSL verificado (`DATABASE_SSL_CA`) y RLS activo en
todas las tablas para que la API REST de Supabase no vea datos. Backups diarios cifrados de la base
y los archivos (`deploy/backup.sh`, `deploy/restaurar.sh`). Equipos y catálogos de una rama:
`deploy/ramas/*.json` con el comando `cargar-rama`. **Paso a paso en [docs/desplegar.md](docs/desplegar.md).**

## Pruebas

```bash
npm run typecheck       # shared, server y mobile
npm test                # unitarias + integración (necesita PostgreSQL)
npm run cobertura       # lo mismo, con la cobertura de las reglas críticas (RNF-032)
cd apps/mobile && npx expo lint
```

Las pruebas de integración usan `TEST_DATABASE_URL` (por defecto
`postgres://scout:scout@localhost:5432/scouttracker_test`) y **borran esa base** en cada archivo.
Usan solo datos ficticios (sección 4 del SRS). La CI (`.github/workflows/ci.yml`) corre todo lo
anterior en cada push (RNF-033).

**Cobertura (RNF-032):** `npm run cobertura` mide los archivos con las reglas críticas del SRS (edad y TADA,
cuotas, permisos por rol y alcance, aislamiento entre grupos, conflictos sin conexión y totalización de
materiales) y falla si alguno baja del 70% de sentencias, ramas, funciones o líneas. Los archivos están en
`packages/shared/vitest.config.ts` y `apps/server/vitest.config.ts`. La CI lo corre en cada push y deja el
reporte HTML como artefacto `cobertura`, que es lo que se inspecciona.

## Trazabilidad de la Parte 1

| Requisitos | Dónde | Pruebas |
|---|---|---|
| RF-001 a RF-004, RN-18 | `rutas/plataforma.ts` | `administracion.test.ts` |
| RF-005 a RF-008, RN-20 | `rutas/admin-grupo.ts`, `rutas/admin-rama.ts`, `servicios/tareas.ts` | `administracion.test.ts` |
| RF-009 a RF-016, RN-21, RNF-012 a RNF-015, RNF-021 | `rutas/auth.ts`, `servicios/usuarios.ts`, `servicios/enlaces.ts` | `auth.test.ts`, `administracion.test.ts` |
| RF-017 a RF-021 | `shared/permisos.ts`, `servicios/acceso.ts`, `rutas/admin-grupo.ts` | `permisos.test.ts`, `administracion.test.ts` |
| RF-022 a RF-028, RF-035 a RF-039, RN-01 a RN-03, RN-11 | `rutas/fichas.ts`, `servicios/edicion.ts`, `shared/ficha.ts` | `padron.test.ts`, `ficha.test.ts`, `fechas.test.ts` |
| RF-029 a RF-034, RNF-002 | `shared/nomina.ts`, app `nomina.tsx`, `ui/tabla.tsx` | `nomina.test.ts` |
| RF-040 a RF-043, RN-05 a RN-07, RNF-022, RNF-023, RNF-044 | `rutas/documentos.ts`, `rutas/archivos.ts` | `padron.test.ts`, `privacidad.test.ts` |
| RF-044 a RF-048, RF-119, RF-120 | `rutas/admin-rama.ts` | `padron.test.ts` |
| RF-049 a RF-053, RN-04, RI-006 | `importacion/` | `importacion.test.ts` |
| RF-054 a RF-056, RNF-016 a RNF-020 | app `lib/datos.tsx`, `lib/almacen.ts`, `lib/bloqueo.tsx`, `lib/sesion.tsx` | recorrido en navegador (ver abajo) |
| RF-117, RF-118, RN-12, RNF-045, RNF-046 | `servicios/privacidad.ts`, `servicios/auditoria.ts` | `privacidad.test.ts` |
| RD-001, RNF-011 | todas las rutas | `aislamiento.test.ts` |
| RNF-027 a RNF-029 | app `ui/tema.ts`, `ui/componentes.tsx` | `apps/mobile/test/contraste.test.ts` |
| RNF-034 | servidor: `servicios/monitoreo.ts`; app: `lib/errores.ts`, `ErrorBoundary` en `app/_layout.tsx`, `rutas/monitoreo.ts` | `privacidad.test.ts`, recorrido en navegador |

## Trazabilidad de la Parte 2 (actividades)

| Requisitos | Dónde | Pruebas |
|---|---|---|
| RF-057, RN-08 | `shared/actividades.ts` (`prevaleceRegistro`, `encolarRegistro`), `servicios/actividades.ts` (`aplicarRegistros`), app `lib/datos.tsx` | `actividades.test.ts` (shared y server), recorrido en navegador |
| RF-058, RF-059, RF-066, RN-17 | `rutas/actividades.ts`, app `actividad/[id]/index.tsx`, `actividad/[id]/autorizacion.tsx` | `actividades.test.ts` |
| RF-060 a RF-062, RF-064 | `rutas/actividades.ts`, app `actividad/nueva.tsx`, `ui/formulario-actividad.tsx`, `actividad/[id]/inscriptos.tsx` | `actividades.test.ts` |
| RF-063 | `rutas/actividades.ts`, `servicios/grupos.ts`, app `admin/grupo/[grupoId]/tipos-actividad.tsx` | `actividades.test.ts`, `contraste.test.ts` |
| RF-065, RF-067 | `shared/actividades.ts` (`confirmacionesProximas`), `shared/nomina.ts` | `actividades.test.ts`, `nomina.test.ts` |
| RF-069, RF-070 | `servicios/actividades.ts` (`asistenciaDelAnio`), app `actividad/[id]/reporte.tsx`, `actividades-anteriores.tsx` | `actividades.test.ts` |
| RF-071 | app `actividad/[id]/index.tsx`, `shared/actividades.ts` (`totalesActividad`) | `actividades.test.ts`, recorrido en navegador |
| RN-19 | `shared/actividades.ts` (`asignacionVeActividad`) | `actividades.test.ts` |
| RF-072 a RF-074, RF-077 | `shared/calendario.ts` (`eventosPorDia`, `semanasDelMes`, `cumpleaniosEnAnio`), `rutas/calendario.ts`, app `calendario.tsx` | `calendario.test.ts` (shared y server), recorrido en navegador |
| RF-075, RF-076, RI-010, DEP-02 | `servicios/feriados.ts` (ArgentinaDatos), `rutas/calendario.ts`, app `admin/grupo/[grupoId]/feriados.tsx` | `calendario.test.ts` |
| RF-078, RF-079, RN-16 | `shared/calendario.ts` (`momentoAviso`), `servicios/avisos.ts` (`programarAvisos`, `destinatariosDeActividad`), app `ui/formulario-actividad.tsx` | `calendario.test.ts` |
| RF-080, RF-081, RI-011 | `servicios/push.ts` (Expo), app `lib/notificaciones.ts` | `calendario.test.ts` |
| RF-082, RN-14 | `servicios/avisos.ts` (`enviarAviso`), `servicios/mailer.ts` | `calendario.test.ts` |
| RF-083, RN-15 | `servicios/avisos.ts` (`procesarAvisos`, cada minuto desde `main.ts`) | `calendario.test.ts` |
| RF-084 | `shared/calendario.ts` (`recibeAviso`), `rutas/calendario.ts`, app `avisos.tsx` | `calendario.test.ts` |
| RF-085 | `servicios/avisos.ts` (`avisarCambio`, `avisarCancelacion`), `rutas/actividades.ts` | `calendario.test.ts` |
| RF-086, RF-087 | `rutas/calendario.ts`, app `admin/grupo/[grupoId]/avisos.tsx` | `calendario.test.ts` |

Criterios tomados donde el SRS no decide:

- **Conflictos (RN-08):** hay conflicto solo si el valor del servidor ya no es el que el celular veía
  al registrar. Sin conflicto el registro se aplica, así un educador puede corregir su propia marca.
  La hora del dispositivo no puede quedar en el futuro respecto del servidor.
- **Autorizaciones:** son datos sensibles (glosario), así que su estado y su archivo solo se ven con
  ese permiso y no se guardan en el celular de quien no lo tiene. Abrir el archivo queda auditado (RNF-044).
- **"Sin autorización" (RF-071):** cuenta a los que van o están presentes; los que no van no la necesitan.
- **Columna "Va" (RF-067):** muestra la confirmación de la próxima actividad de cada protagonista que
  todavía no empezó, no la próxima de la rama: así una actividad de un equipo no deja en "—" al resto.
- **Sin conexión (RF-054):** se guardan las actividades que terminaron hace hasta 60 días y las futuras.
  Las anteriores se consultan con conexión.
- **Alcance:** no se edita; para otro alcance se cancela la actividad y se crea otra. Al eliminarse un
  equipo (RN-20), sus actividades pasan a la rama para conservar la asistencia.
- **Confirmación (RF-065):** requiere conexión, porque RF-055 solo exceptúa asistencia y autorizaciones.
- **Destinatarios (RF-079, RF-086):** "rama" son los usuarios asignados a esa rama o a sus equipos (no los
  de alcance de grupo); "equipo", los asignados a ese equipo; "rol", los de ese rol (dentro del alcance si es
  de una actividad). Los de una actividad tienen que poder verla (RN-19).
- **Cumpleaños (RF-083):** llega a los educadores con asignación en la rama o en el equipo del protagonista,
  por push y por mail según sus preferencias. El 29/02 se avisa el 28/02 en años no bisiestos.
- **Avisos atrasados:** uno que debía salir hace más de 30 minutos (servidor caído) no se manda y queda
  marcado como omitido; uno cuyo momento ya había pasado al crear la actividad tampoco.
- **Cambios (RF-085):** se avisa si cambian la fecha, la hora o el lugar de una actividad con avisos
  programados; si la fecha se movió, los avisos ya enviados vuelven a programarse.
- **Push:** el celular queda registrado con la sesión; al cerrarla o al desactivar al usuario deja de recibir.
  Los textos de los avisos no llevan datos sensibles, pero el de cumpleaños lleva el nombre del protagonista.

## Trazabilidad de la Parte 3 (Ficha de Actividad)

| Requisitos | Dónde | Pruebas |
|---|---|---|
| RF-068 | `rutas/fichas-actividad.ts`, app `actividad/[id]/ficha.tsx` | `fichas-actividad.test.ts` |
| RF-088, RI-002 | `rutas/fichas-actividad.ts` (cabecera), `servicios/fichas-actividad.ts` (`cabeceraDeRama`), app `admin/rama/[ramaId]/cabecera.tsx` | `fichas-actividad.test.ts` |
| RF-089 a RF-092 | `rutas/fichas-actividad.ts`, `shared/fichaActividad.ts` (`ordenarAreas`, `faltantesVersionFinal`), app `ficha-actividad/[id]/textos.tsx` | `fichaActividad.test.ts` (shared y server) |
| RF-093, RF-094, RF-098 | `shared/fichaActividad.ts` (`ordenarGrilla`, `textoResponsable`, `materialesDeFila`), app `ficha-actividad/[id]/grilla.tsx` | `fichaActividad.test.ts` (shared y server) |
| RF-095 a RF-097, RD-005 | `rutas/fichas-actividad.ts` (anexos, `/yo/anexos-pendientes`), `shared/fichaActividad.ts` (`faltantesAnexo`), app `ficha-actividad/[id]/anexo/[anexoId].tsx`, `ui/desarrollo.tsx`, `anexos-pendientes.tsx` | `fichaActividad.test.ts` (shared y server) |
| RF-099, RN-10 | `shared/fichaActividad.ts` (`listaDeCompras`) | `fichaActividad.test.ts` (shared y server) |
| RF-100 a RF-102, RN-09, RES-04, RI-008 | `servicios/pdf-ficha.ts`, `shared/fichaActividad.ts` (`faltantesVersionFinal`) | `fichas-actividad.test.ts` |
| RF-103, RF-104, RI-009 | `rutas/fichas-actividad.ts` (`/pdf`, `/pdf/enlace`), app `lib/fichaActividad.ts` (`compartirPdf`) | `fichas-actividad.test.ts`, prueba en el celular |
| RF-105 | `rutas/fichas-actividad.ts` (`anexos-reutilizables`, `anexos/copiar`), app `ficha-actividad/[id]/reutilizar.tsx` | `fichas-actividad.test.ts` |
| RNF-004 | `servicios/pdf-ficha.ts` | `fichas-actividad.test.ts` (en el servidor; falta medir en el Moto G22) |

Criterios tomados donde el SRS no decide:

- **Dónde se genera el PDF:** en el servidor. En el celular de referencia no hay que cargar fuentes ni
  armar el PDF, y el archivo queda guardado en la actividad (RF-103) para compartirlo desde cualquier
  celular. Por eso la Ficha de Actividad requiere conexión, como todo lo que no exceptúa RF-055.
- **Fecha, lugar y cabecera:** la ficha no los copia: se leen de la actividad y de la cabecera de la rama
  al mostrarla y al generar el PDF. Si cambian, el próximo PDF sale con los datos nuevos. El equipo de
  educadores de la cabecera va como lista después del diagnóstico.
- **Actividades de grupo:** no tienen rama; la ficha es de la rama desde la que se crea (su cabecera, su
  diagnóstico y sus usuarios). Una actividad tiene una sola ficha (sección 3.3).
- **Permisos:** sobre la rama de la ficha y, si la actividad es de un equipo, sobre ese equipo. Ver alcanza
  para abrir y compartir el PDF; generar el PDF, armar la grilla y crear, asignar o borrar anexos requiere
  editar. El asignado de un anexo lo ve y lo completa aunque su rol no tenga permiso de editar (RF-095).
- **"Usuarios de la rama" (RF-094, RF-095):** los asignados a la rama, a uno de sus equipos o al grupo.
- **Estados (sección 3.3):** cualquier cambio en la ficha o en sus anexos la vuelve a "en carga"; generar la
  versión final la pasa a "final". La app avisa si el PDF guardado es anterior a los últimos cambios.
- **Anexos fuera de la grilla:** RN-09 solo exige completos los que usa la grilla. La versión final lleva
  solo los anexos completos; el borrador, todos, con los faltantes como "Pendiente — asignado a…".
- **Anexo completo:** si después se borra un obligatorio (título, categoría o desarrollo), deja de estarlo.
  Un anexo que usa la grilla no se puede borrar.
- **Materiales (RN-10):** "descripción idéntica" se compara sin mayúsculas, tildes ni espacios de más. La
  cantidad puede faltar (por ejemplo "espacio de lanzamiento"): el ítem va a la lista sin número.
- **Responsable (RF-094):** los usuarios van con su nombre de pila, como en el ejemplo; si dos usuarios de la
  rama comparten nombre de pila, va el nombre completo.
- **Desarrollo (RD-005):** negrita con `**texto**` y listas con líneas que empiezan con "- ". La app tiene
  botones para marcarlas y una vista previa.
- **Reutilizar (RF-105):** se ofrecen los anexos con título de fichas que el usuario puede ver. La copia queda
  asignada a quien la hace; si viene de otra rama, la categoría se busca por nombre en la rama actual y la
  cantidad de equipos vuelve a la de la rama.

## Trazabilidad de la Parte 4 (gráficos, inicio y exportación)

| Requisitos | Dónde | Pruebas |
|---|---|---|
| RF-106 a RF-110, RI-003 | `shared/graficos.ts` (`armarGraficos`), app `graficos.tsx`, `ui/graficos.tsx` | `graficos.test.ts`, `contraste.test.ts`, recorrido en navegador |
| RF-111, RF-112 | `shared/nomina.ts` (`armarNomina`, `describirFiltros`), app `graficos.tsx`, `nomina.tsx` | `graficos.test.ts`, recorrido en navegador |
| RF-113, RF-114 | `shared/inicio.ts` (`cumpleaniosDelMes`, `proximasActividades`, `documentosPendientes`, `cuotasPendientes`, `autorizacionesPendientes`), app `inicio.tsx`, `pendientes.tsx` | `inicio.test.ts`, recorrido en navegador |
| RF-115, RF-116, RI-007, RNF-043 | `rutas/exportacion.ts`, `servicios/exportacion.ts` (`nominaXlsx`), app `lib/exportacion.ts` | `exportacion.test.ts` (servidor) |

Criterios tomados donde el SRS no decide:

- **Protagonistas activos:** los gráficos y el total del inicio cuentan las fichas activas e incompletas;
  las archivadas no llegan al celular.
- **Edades (RF-106):** por años cumplidos. Si entre la edad mínima y la máxima falta alguna, aparece en 0
  para que no se saltee; las fichas sin fecha de nacimiento van en "Sin dato".
- **Valores de catálogo y equipos (RF-107, RF-109):** en el orden del catálogo, los activos aunque estén en 0
  y los desactivados solo si alguien todavía los tiene. Con alcance de equipo, o con un equipo elegido, el
  gráfico de equipos no muestra los demás en 0.
- **Colores (RF-108):** TADA usa tres colores validados para daltonismo y con contraste ≥ 3:1; los demás
  gráficos, el color principal de la app. Cada barra lleva su nombre, su valor y su porcentaje escritos.
- **Religión (RF-110):** con el permiso de datos sensibles, y contando solo las fichas cuyos datos
  sensibles llegaron al celular (con alcance mixto puede no ser toda la rama).
- **Filtro por rama (RF-111):** el selector cambia de rama dentro del grupo, como el selector de contexto;
  las ramas son las que el usuario puede ver. Un campo oculto en la rama (RF-048) saca su gráfico.
- **Desde la nómina (RF-112) y exportación (RF-115):** van los filtros, la vista por equipo y el orden de
  la lista. La búsqueda por texto no: no es un filtro, puede tener el nombre o el DNI de un protagonista y
  los filtros de la exportación quedan en la auditoría (RNF-043, RNF-046). Si hay una búsqueda escrita, la
  app avisa antes de exportar cuántas fichas salen.
- **Inicio (RF-113):** pasa a ser la primera pantalla al entrar a una rama; la nómina se abre desde ahí o
  desde el menú. Muestra hasta 3 próximas actividades y los equipos activos con su logo.
- **Pendientes (RF-114):** "documentos no presentados" cuenta autorizaciones, DDJJ y consentimiento en
  "No presentado" (el PDF adjunto general es opcional y no se reclama; una autorización presentada que no
  autoriza no es un pendiente). "Cuotas adeudadas" son las marcadas "Adeudada"; pagadas, exentas o sin
  dato no cuentan. Las autorizaciones faltantes son las de la próxima actividad que pide autorización
  (no la próxima a secas, que suele ser una reunión), contando a los que van, como en RF-071. Cada
  contador aparece solo si el usuario puede ver ese módulo; los anexos se actualizan con conexión.
- **Columnas del Excel (RF-115, RF-116):** todas las que el usuario puede ver en la rama, no solo las
  visibles en su tabla: las fijas, los campos propios activos, las cuotas y los documentos (con fecha de
  entrega). Sin datos sensibles no se arman DNI, teléfonos, religión ni los documentos sensibles; solo
  queda el PDF adjunto general. La edad va como número. Una segunda hoja indica rama, vista, filtros,
  cantidad, quién exportó y cuándo. Con alcance de equipo se exportan solo las fichas de su equipo.
- **Permiso de Exportación:** la acción "Ver" del módulo Exportación (RF-017).

## Importación de la planilla

Los encabezados se reconocen con una lista de nombres (`apps/server/src/importacion/mapeo.ts`) que
incluye los de la planilla actual, y el resumen informa las columnas que no se reconocieron. La
estructura de la planilla actual (fila de títulos arriba, "Apellido, Nombre" en la columna Nombre,
totales al pie) está cubierta por `importacion.test.ts` con datos ficticios. Antes de importar conviene cargar los equipos y los valores de catálogo de
la rama, y marcar como "adulto" las categorías de miembro de educadores y colaboradores.
Criterios tomados donde el SRS no decide:

- Cuotas: "Pagada/Pagado/Sí" → Pagada; "Debe/Adeuda/No" → Adeudada; "Exenta/Beca" → Exenta; cualquier otro valor (por ejemplo "X", "..." o un monto como "320") queda sin dato y la ficha incompleta (RF-050). La columna única "Cuota social" no se importa: la app la lleva mes por mes y se carga después.
- Documentos: una fecha en la celda es la fecha de entrega; "Sí" cuenta como presentado (y "autoriza" en las autorizaciones) con la fecha de la importación; en las autorizaciones "No" se lee como "no autoriza".
- Un valor no reconocido queda como motivo de la ficha incompleta hasta que se carga ese campo o el usuario marca la ficha como revisada.

## Pendiente fuera de esta parte

- Push en producción: crear el proyecto de EAS y las credenciales de Firebase ([docs/desplegar.md](docs/desplegar.md), paso 7).
- Compartir el PDF (RF-104) usa `expo-sharing`, un módulo nativo nuevo: hay que compilar otro APK o
  *development build* para probarlo en el celular.
- Medir RNF-004 (PDF de 10 páginas en 20 s) en el Moto G22 de referencia.
- Probar en el celular el menú de compartir del Excel (RF-115): usa los mismos módulos que el PDF.
- Alojamiento de producción (RES-01, RES-06): elegido DonWeb + Supabase (ver [docs/desplegar.md](docs/desplegar.md)), todavía sin desplegar. Los backups diarios están armados (RNF-005 a RNF-010); falta medir en producción cuánto tarda una restauración completa.
- Aviso de errores de la app (RNF-034): probado en la web; falta probar un cierre en el celular, que
  necesita un APK nuevo. Los errores de la app se guardan en el dispositivo y se mandan al servidor con
  sesión, que avisa por mail al responsable técnico (como los del servidor, una vez por error y hasta 10
  mails por día, para no agotar el tope de RN-14).
- iOS: Expo SDK 58 pide iOS 16.4 o superior, y RNF-036 dice iOS 16. Hay que corregir el SRS.
- RES-06 / RNF-025: la base en Supabase queda en Brasil y se cubre con el DPA de Supabase, que hay que
  presentar a la AAIP dentro de los 30 días de aceptar los términos (ver
  [docs/desplegar.md](docs/desplegar.md#datos-fuera-de-argentina-ley-25326)).
