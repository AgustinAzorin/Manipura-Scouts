import { construirApp, type Dependencias } from './app';
import { cargarArchivoEnv, leerConfig } from './config';
import { crearDb } from './db';
import { migrar } from './migrar';
import { AlmacenamientoDisco } from './servicios/almacenamiento';
import { Mailer, TransporteConsola, TransporteResend } from './servicios/mailer';
import { notificarError } from './servicios/monitoreo';
import { ejecutarTareas } from './servicios/tareas';

cargarArchivoEnv();
const config = leerConfig();
const db = crearDb(config.databaseUrl);
await migrar(db);

const deps: Dependencias = {
  db,
  config,
  mailer: new Mailer(db, config.resendApiKey ? new TransporteResend(config.resendApiKey, config.mailRemitente) : new TransporteConsola()),
  almacenamiento: new AlmacenamientoDisco(config.dirAlmacenamiento),
  ahora: () => new Date(),
};

const app = await construirApp(deps);
await app.listen({ port: config.puerto, host: '0.0.0.0' });

// Tareas diarias (RF-008, RF-117): son idempotentes, así que alcanza con correrlas cada hora.
const correrTareas = () =>
  ejecutarTareas(deps)
    .then((r) => app.log.info(r, 'tareas ejecutadas'))
    .catch((e) => notificarError(deps, e, 'tareas').catch(() => app.log.error(e)));
void correrTareas();
setInterval(correrTareas, 60 * 60 * 1000).unref();

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, async () => {
    await app.close();
    await db.destroy();
    process.exit(0);
  });
}
