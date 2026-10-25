# ScoutTracker

App móvil (Android e iOS) para el padrón, las actividades y la documentación de ramas scout.
Este repositorio implementa la **Parte 1 — Base** del SRS v1.4 (grupos, ramas, equipos, usuarios,
roles, padrón, importación y consulta sin conexión) y, de la **Parte 2**, las actividades, la
asistencia y las autorizaciones con registro sin conexión (RF-057 a RF-071, salvo RF-068).

## Estructura

| Carpeta | Contenido |
|---|---|
| `packages/shared` | Reglas de negocio compartidas: edad (RN-01), TADA (RN-02), DNI y teléfonos (RN-03, RD-009), fechas (RN-04), cuotas (RN-05), documentos (RN-06), permisos por rol y alcance (RF-017 a RF-020), definición de la ficha (RD-002), lógica de la nómina (RF-029 a RF-034) y tipos de la API. |
| `apps/server` | API HTTP (Fastify + PostgreSQL con Kysely). Migraciones SQL en `migrations/`. |
| `apps/mobile` | App Expo SDK 58 (React Native, Expo Router). |

## Stack y decisiones

- **TypeScript en todo el monorepo** (npm workspaces): las reglas de negocio se escriben y se prueban una sola vez y las usan el servidor y la app.
- **Servidor:** Node 22, Fastify 5, PostgreSQL 16, Kysely (consultas tipadas, migraciones SQL a mano). Contraseñas con scrypt de Node (sin dependencias nativas). Sesiones con token opaco guardado como hash, 30 días desde el inicio de sesión (RNF-015); al desactivar un usuario se borran sus sesiones (RNF-021).
- **Multi-grupo:** toda tabla con datos tiene `grupo_id` y cada operación se autoriza contra las asignaciones del usuario (rol + alcance de grupo, rama o equipo). El estado activo/inactivo de un usuario es **por grupo**, para que el admin de un grupo no pueda dejar sin acceso a alguien en otro.
- **Sin conexión:** la app descarga la nómina de la rama (sin campos sensibles si el usuario no tiene ese permiso, RNF-018) y la guarda cifrada con AES-256-GCM; la clave vive en el llavero del sistema (SecureStore). Sin conexión todo es de solo lectura (RF-055). Los datos se borran al cerrar sesión, si pasan 7 días sin sincronizar o si el usuario pierde el acceso (RF-013, RNF-019, RNF-020).
- **Bloqueo:** se pide huella, rostro o PIN del celular al abrir la app y tras 5 minutos sin uso (RNF-016).
- **Archivos:** almacenamiento privado; se abren solo con enlaces firmados de 10 minutos (RNF-022). El tipo se valida por los bytes del archivo, no por el nombre.
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

Para probar rápido en la compu, `npx expo start --web` funciona sin biometría y con el servidor
arrancado con `ORIGENES_CORS=http://localhost:8081`.

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
cd apps/mobile && npx expo lint
```

Las pruebas de integración usan `TEST_DATABASE_URL` (por defecto
`postgres://scout:scout@localhost:5432/scouttracker_test`) y **borran esa base** en cada archivo.
Usan solo datos ficticios (sección 4 del SRS). La CI (`.github/workflows/ci.yml`) corre todo lo
anterior en cada push (RNF-033).

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
| RNF-034 (servidor) | `servicios/monitoreo.ts` | `privacidad.test.ts` |

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
| RD-001, RNF-011 | todas las rutas nuevas | `aislamiento.test.ts` |

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

- Resto de la Parte 2: calendario y avisos por push y mail (RF-072 a RF-087). Al editar o cancelar una actividad todavía no se reprograman ni se anulan avisos (RF-061, RF-062 y RF-085 lo piden cuando existan).
- Asociar la Ficha de Actividad (RF-068): depende del generador de PDF de la Parte 3.
- Alojamiento de producción (RES-01, RES-06): elegido DonWeb + Supabase (ver [docs/desplegar.md](docs/desplegar.md)), todavía sin desplegar. Los backups diarios están armados (RNF-005 a RNF-010); falta medir en producción cuánto tarda una restauración completa.
- Aviso de errores de la app móvil (RNF-034 del lado del celular): requiere elegir un servicio de reporte de cierres.
