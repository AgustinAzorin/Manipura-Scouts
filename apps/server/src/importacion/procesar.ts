import {
  CAMPOS_FICHA,
  DEF_CAMPO,
  DEF_DOCUMENTO,
  calcularEdad,
  esDniValido,
  esFechaISO,
  esTelefonoValido,
  hoyAR,
  interpretarFecha,
  normalizarDni,
  normalizarTelefono,
  normalizarTexto,
  obligatoriosFaltantes,
  tadaEditable,
  type CampoFicha,
  type ConceptoCuota,
  type Cuotas,
  type DatosFicha,
  type EstadoDocumento,
  type ResumenImportacion,
  type TipoDocumento,
} from '@scouttracker/shared';
import { json, type Db } from '../db';
import { COLUMNA, type Rama } from '../servicios/fichas';
import type { Tabla } from './leer';
import {
  destinosDeEncabezados,
  interpretarCordi,
  interpretarCuota,
  interpretarSiNo,
  RE_ADULTO,
  type Destino,
} from './mapeo';

interface DocumentoImportado {
  estado: EstadoDocumento;
  fecha: string | null;
  /** La fecha vino de la planilla (y no es la de la importación). */
  fechaDeLaPlanilla?: boolean;
}

/** Interpreta la celda de un documento (RN-06). Sin fecha en la planilla se usa la de la importación. */
function interpretarDocumento(tipo: TipoDocumento, v: string, hoy: string): DocumentoImportado | null | 'invalido' {
  const t = v.trim();
  if (!t) return null;
  const autorizacion = DEF_DOCUMENTO[tipo].estados.includes('presentadoAutoriza');
  const fecha = interpretarFecha(t, hoy);
  if (fecha) return { estado: autorizacion ? 'presentadoAutoriza' : 'presentado', fecha, fechaDeLaPlanilla: true };
  const n = normalizarTexto(t);
  if (['no autoriza', 'presentado no autoriza', 'no se retira', 'no puede'].includes(n)) {
    return autorizacion ? { estado: 'presentadoNoAutoriza', fecha: hoy } : 'invalido';
  }
  if (['si', 's', 'x', 'ok', 'presentado', 'presentada', 'entregado', 'entregada', 'autoriza', 'presentado autoriza', 'tiene'].includes(n)) {
    return { estado: autorizacion ? 'presentadoAutoriza' : 'presentado', fecha: hoy };
  }
  if (['no', 'n', '-', 'no presentado', 'no presentada', 'falta', 'pendiente'].includes(n)) {
    // En una autorización, "no" se lee como "no autoriza"; en los demás, como no presentado.
    return autorizacion && (n === 'no' || n === 'n') ? { estado: 'presentadoNoAutoriza', fecha: hoy } : { estado: 'noPresentado', fecha: null };
  }
  return 'invalido';
}

/** Combina las dos columnas de retiro de la planilla en un solo documento (RD-003). */
function combinarDocumento(a: DocumentoImportado | undefined, b: DocumentoImportado): DocumentoImportado {
  if (!a || a.estado === 'noPresentado') return b;
  if (b.estado === 'noPresentado') return a;
  // Si una columna dice que autoriza o no, esa decide; la fecha se toma de la que la tenga.
  const estado = b.estado === 'presentadoNoAutoriza' || a.estado === 'presentadoNoAutoriza' ? 'presentadoNoAutoriza' : b.estado;
  const conFecha = a.fechaDeLaPlanilla ? a : b.fechaDeLaPlanilla ? b : a;
  return { estado, fecha: conFecha.fecha, fechaDeLaPlanilla: conFecha.fechaDeLaPlanilla };
}

/** "Apellido, Nombre" (con coma) o, sin coma, según el orden de la columna. */
function separarApellidoYNombre(v: string, orden: 'apellidoPrimero' | 'nombrePrimero'): [string, string] {
  const coma = v.indexOf(',');
  if (coma >= 0) return [v.slice(0, coma), v.slice(coma + 1)];
  const partes = v.split(/\s+/);
  return orden === 'apellidoPrimero' ? [partes[0]!, partes.slice(1).join(' ')] : [partes.at(-1)!, partes.slice(0, -1).join(' ')];
}

/**
 * RF-049 a RF-053: importa las filas de la planilla a la rama. Las filas con faltantes o valores
 * no reconocidos quedan como "Ficha incompleta"; las de DNI repetido y las de adultos se omiten.
 * Las filas sin nombre, DNI ni fecha de nacimiento (totales y recuentos al pie) no se importan.
 */
export async function importarTabla(db: Db, usuarioId: string, rama: Rama, tabla: Tabla, hoy = hoyAR()): Promise<ResumenImportacion> {
  const destinos: (Destino | null)[] = destinosDeEncabezados(tabla.encabezados);
  const columnasIgnoradas = tabla.encabezados.filter((h, i) => h.trim() && destinos[i] === null);
  // En la planilla actual la columna "Nombre" trae "Apellido, Nombre" y no hay columna de apellido.
  const hayApellido = destinos.some((d) => d?.tipo === 'apellidoYNombre' || (d?.tipo === 'campo' && d.campo === 'apellido'));

  const [valores, equipos, existentes] = await Promise.all([
    db.selectFrom('catalogo_valores').select(['id', 'catalogo', 'nombre', 'activo', 'es_adulto']).where('rama_id', '=', rama.id).execute(),
    db.selectFrom('equipos').select(['id', 'nombre', 'activo']).where('rama_id', '=', rama.id).execute(),
    db.selectFrom('fichas').select(['dni', 'equipo_id', 'cordi']).where('grupo_id', '=', rama.grupo_id).execute(),
  ]);
  const dnisUsados = new Map<string, number | 'grupo'>();
  for (const f of existentes) if (f.dni) dnisUsados.set(f.dni, 'grupo');
  const cordisOcupados = new Set(existentes.filter((f) => f.equipo_id && f.cordi).map((f) => `${f.equipo_id}:${f.cordi}`));

  const resumen: ResumenImportacion = {
    filasLeidas: 0,
    creadas: 0,
    incompletas: 0,
    omitidas: [],
    adultos: [],
    detalleIncompletas: [],
    columnasIgnoradas,
  };

  await db.transaction().execute(async (trx) => {
    for (const { numero, celdas } of tabla.filas) {
      if (celdas.every((c) => !c.trim())) continue;
      const motivos: string[] = [];
      const datos: DatosFicha = {};
      const cuotas: Cuotas = {};
      const docs = new Map<TipoDocumento, DocumentoImportado>();
      let categoriaTexto = '';

      // Los motivos los ven todos los que ven la ficha: no se copian valores sensibles.
      const noReconocido = (etiqueta: string, v: string, sensible = false) =>
        motivos.push(sensible ? `Valor no reconocido en ${etiqueta}` : `Valor no reconocido en ${etiqueta}: "${v.trim()}"`);

      destinos.forEach((d, i) => {
        const v = (celdas[i] ?? '').trim();
        if (!d || d.tipo === 'ignorar' || !v) return;
        switch (d.tipo) {
          case 'apellidoYNombre': {
            const [apellido, nombre] = separarApellidoYNombre(v, d.orden);
            datos.apellido ??= apellido.trim() || null;
            datos.nombre ??= nombre.trim() || null;
            return;
          }
          case 'cuota': {
            const c = interpretarCuota(v);
            if (c === 'invalido') {
              cuotas[d.concepto as ConceptoCuota] = null;
              noReconocido(`cuota ${d.concepto}`, v);
            } else cuotas[d.concepto] = c;
            return;
          }
          case 'documento': {
            const r = interpretarDocumento(d.documento, v, hoy);
            if (r === 'invalido') noReconocido(DEF_DOCUMENTO[d.documento].nombre, v, DEF_DOCUMENTO[d.documento].sensible);
            else if (r) docs.set(d.documento, combinarDocumento(docs.get(d.documento), r));
            return;
          }
          case 'campo':
            if (d.campo === 'nombre' && !hayApellido && v.includes(',')) {
              const [apellido, nombre] = separarApellidoYNombre(v, 'apellidoPrimero');
              datos.apellido = apellido.trim() || null;
              datos.nombre = nombre.trim() || null;
            } else asignarCampo(d.campo, v);
        }
      });

      // Sin nombre, DNI ni fecha de nacimiento no es una persona: son los totales y recuentos del pie.
      if (!datos.apellido && !datos.nombre && !datos.dni && !datos.fechaNacimiento) continue;
      resumen.filasLeidas++;

      function asignarCampo(c: CampoFicha, v: string) {
        const def = DEF_CAMPO[c];
        switch (def.tipo) {
          case 'texto':
            datos[c as 'apellido'] = v;
            return;
          case 'dni': {
            const dni = normalizarDni(v);
            if (esDniValido(dni)) datos.dni = dni;
            else noReconocido('DNI', v, true);
            return;
          }
          case 'telefono': {
            const t = normalizarTelefono(v);
            if (esTelefonoValido(t)) datos[c as 'telPropio'] = t;
            else noReconocido(def.etiqueta, v, true);
            return;
          }
          case 'fecha': {
            const f = esFechaISO(v) ? v : interpretarFecha(v, hoy);
            if (!f || f > hoy) noReconocido(def.etiqueta, v);
            else datos[c as 'fechaNacimiento'] = f;
            return;
          }
          case 'booleano': {
            const b = interpretarSiNo(v);
            if (b === 'invalido') noReconocido(def.etiqueta, v);
            else datos.tieneTada = b ?? false;
            return;
          }
          case 'cordi': {
            const k = interpretarCordi(v);
            if (k === 'invalido') noReconocido(def.etiqueta, v);
            else datos.cordi = k;
            return;
          }
          case 'equipo': {
            const e = equipos.find((x) => x.activo && normalizarTexto(x.nombre) === normalizarTexto(v));
            if (e) datos.equipoId = e.id;
            else noReconocido('Equipo', v);
            return;
          }
          case 'catalogo': {
            if (def.catalogo === 'categoriaMiembro') categoriaTexto = v;
            const val = valores.find((x) => x.catalogo === def.catalogo && x.activo && normalizarTexto(x.nombre) === normalizarTexto(v));
            if (val) datos[c as 'etapaId'] = val.id;
            else noReconocido(def.etiqueta, v, def.sensible);
          }
        }
      }

      // Adultos fuera del padrón (RF-049).
      const categoria = valores.find((x) => x.id === datos.categoriaMiembroId);
      if (categoria?.es_adulto || (!categoria && categoriaTexto && RE_ADULTO.test(normalizarTexto(categoriaTexto)))) {
        resumen.adultos.push(numero);
        continue;
      }

      // RF-052: DNI repetido en el grupo o dentro del archivo.
      if (datos.dni) {
        const previo = dnisUsados.get(datos.dni);
        if (previo !== undefined) {
          resumen.omitidas.push({
            fila: numero,
            motivo: previo === 'grupo' ? `El DNI ${datos.dni} ya existe en el grupo` : `El DNI ${datos.dni} se repite (fila ${previo})`,
          });
          continue;
        }
        dnisUsados.set(datos.dni, numero);
      }

      // RF-037 / RN-11
      if (datos.tieneTada && datos.fechaNacimiento && !tadaEditable(calcularEdad(datos.fechaNacimiento, hoy))) {
        datos.tieneTada = false;
        motivos.push('Marcado con TADA pero tiene menos de 16 años');
      }
      if (datos.cordi) {
        const clave = `${datos.equipoId}:${datos.cordi}`;
        if (!datos.equipoId) {
          motivos.push('Marcado como cordi pero no tiene equipo');
          datos.cordi = null;
        } else if (cordisOcupados.has(clave)) {
          motivos.push(`El equipo ya tiene ${datos.cordi}`);
          datos.cordi = null;
        } else cordisOcupados.add(clave);
      }

      const faltan = obligatoriosFaltantes(datos);
      const todos = [...faltan.map((f) => `Falta ${f}`), ...motivos];
      const estado = todos.length > 0 ? 'incompleta' : 'activa';

      const columnas: Record<string, unknown> = {};
      for (const c of CAMPOS_FICHA) columnas[COLUMNA[c]] = datos[c] ?? null;
      columnas.tiene_tada = datos.tieneTada === true;
      const ficha = await trx
        .insertInto('fichas')
        .values({
          ...(columnas as object),
          grupo_id: rama.grupo_id,
          rama_id: rama.id,
          estado,
          incompleta_motivos: todos,
          cuotas: json(cuotas),
        } as never)
        .returning('id')
        .executeTakeFirstOrThrow();
      if (docs.size > 0) {
        await trx
          .insertInto('documentos')
          .values([...docs].map(([tipo, d]) => ({ grupo_id: rama.grupo_id, ficha_id: ficha.id, tipo, estado: d.estado, fecha_entrega: d.fecha })))
          .execute();
      }
      await trx
        .insertInto('historial')
        .values({ grupo_id: rama.grupo_id, ficha_id: ficha.id, usuario_id: usuarioId, campo: '_importacion', valor_anterior: null, valor_nuevo: `Fila ${numero}`, version: 1 })
        .execute();
      resumen.creadas++;
      if (estado === 'incompleta') {
        resumen.incompletas++;
        resumen.detalleIncompletas.push({ fila: numero, motivos: todos });
      }
    }
  });
  return resumen;
}
