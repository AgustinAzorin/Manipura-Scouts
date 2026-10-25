import { cargarArchivoEnv, leerConfig } from '../config';
import { crearDb } from '../db';
import { AlmacenamientoDisco } from '../servicios/almacenamiento';
import { FuenteArgentinaDatos } from '../servicios/feriados';
import { Mailer, TransporteConsola } from '../servicios/mailer';
import { TransportePushConsola } from '../servicios/push';
import { ejecutarTareas } from '../servicios/tareas';

cargarArchivoEnv();
const config = leerConfig();
const db = crearDb(config.databaseUrl);
const r = await ejecutarTareas({
  db,
  config,
  mailer: new Mailer(db, new TransporteConsola()),
  almacenamiento: new AlmacenamientoDisco(config.dirAlmacenamiento),
  push: new TransportePushConsola(),
  feriados: new FuenteArgentinaDatos(),
  ahora: () => new Date(),
});
console.log(r);
await db.destroy();
