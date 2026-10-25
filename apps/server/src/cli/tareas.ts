import { cargarArchivoEnv, leerConfig } from '../config';
import { crearDb } from '../db';
import { AlmacenamientoDisco } from '../servicios/almacenamiento';
import { Mailer, TransporteConsola } from '../servicios/mailer';
import { ejecutarTareas } from '../servicios/tareas';

cargarArchivoEnv();
const config = leerConfig();
const db = crearDb(config.databaseUrl);
const r = await ejecutarTareas({
  db,
  config,
  mailer: new Mailer(db, new TransporteConsola()),
  almacenamiento: new AlmacenamientoDisco(config.dirAlmacenamiento),
  ahora: () => new Date(),
});
console.log(r);
await db.destroy();
