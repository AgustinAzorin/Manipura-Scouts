-- Parte 1 — Base: grupos, ramas, equipos, usuarios, roles, padrón, importación.
-- RD-001: toda entidad con datos pertenece a un único grupo (columna grupo_id).

CREATE TABLE grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ramas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  comunidad text,
  -- RF-048: campos de la ficha que la rama no usa.
  campos_ocultos text[] NOT NULL DEFAULT '{}',
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, nombre)
);
CREATE INDEX ON ramas (grupo_id);

-- Archivos guardados en el almacenamiento privado (RNF-022): adjuntos de documentos y logos.
CREATE TABLE archivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  clave text NOT NULL UNIQUE,
  nombre text NOT NULL,
  mime text NOT NULL,
  tamano integer NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE equipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  rama_id uuid NOT NULL REFERENCES ramas (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  -- RN-20: a los 90 días de la desactivación el equipo se elimina.
  desactivado_en timestamptz,
  logo_archivo_id uuid REFERENCES archivos (id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rama_id, nombre)
);
CREATE INDEX ON equipos (grupo_id);

CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  -- RD-006: único en la plataforma. Se guarda en minúsculas.
  email text NOT NULL UNIQUE,
  -- RNF-012: scrypt con sal. Null mientras la invitación no se activa.
  password_hash text,
  es_admin_plataforma boolean NOT NULL DEFAULT false,
  intentos_fallidos integer NOT NULL DEFAULT 0,
  bloqueado_hasta timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- Pertenencia de un usuario a un grupo, con su estado en ese grupo (RF-014, RF-015, RF-016).
-- El estado es por grupo para que un admin no pueda dejar sin acceso a alguien en otro grupo.
CREATE TABLE miembros (
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, grupo_id)
);
CREATE INDEX ON miembros (grupo_id);

-- RN-21: enlaces de invitación (7 días) y de recuperación (1 hora), de un solo uso.
CREATE TABLE enlaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('invitacion', 'recuperacion')),
  token_hash text NOT NULL UNIQUE,
  vence_en timestamptz NOT NULL,
  usado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON enlaces (usuario_id, tipo);

CREATE TABLE sesiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  creado_en timestamptz NOT NULL DEFAULT now(),
  -- RNF-015: 30 días desde el inicio de sesión.
  vence_en timestamptz NOT NULL
);
CREATE INDEX ON sesiones (usuario_id);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  -- RF-017: { modulo: [acciones] }
  permisos jsonb NOT NULL DEFAULT '{}',
  -- RF-020
  ver_sensibles boolean NOT NULL DEFAULT false,
  -- 'adminGrupo' para el rol que crea el sistema con cada grupo; no se puede borrar ni recortar.
  sistema text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, nombre)
);

-- RF-019: asignación de un rol con alcance de grupo, rama o equipo.
CREATE TABLE asignaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  rol_id uuid NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  alcance text NOT NULL CHECK (alcance IN ('grupo', 'rama', 'equipo')),
  rama_id uuid REFERENCES ramas (id) ON DELETE CASCADE,
  equipo_id uuid REFERENCES equipos (id) ON DELETE CASCADE,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (alcance = 'grupo' AND rama_id IS NULL AND equipo_id IS NULL)
    OR (alcance = 'rama' AND rama_id IS NOT NULL AND equipo_id IS NULL)
    OR (alcance = 'equipo' AND rama_id IS NOT NULL AND equipo_id IS NOT NULL)
  )
);
CREATE INDEX ON asignaciones (usuario_id);
CREATE INDEX ON asignaciones (grupo_id);
CREATE UNIQUE INDEX asignaciones_unica ON asignaciones (
  usuario_id, rol_id, alcance, coalesce(rama_id, '00000000-0000-0000-0000-000000000000'), coalesce(equipo_id, '00000000-0000-0000-0000-000000000000')
);

-- RF-044 a RF-047: valores de catálogo por rama.
CREATE TABLE catalogo_valores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  rama_id uuid NOT NULL REFERENCES ramas (id) ON DELETE CASCADE,
  catalogo text NOT NULL,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  logo_archivo_id uuid REFERENCES archivos (id) ON DELETE SET NULL,
  -- Solo en "categoría de miembro": la categoría corresponde a un adulto (RF-049).
  es_adulto boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX catalogo_valores_nombre ON catalogo_valores (rama_id, catalogo, lower(nombre));

-- RF-119 / RF-120: campos propios de una rama.
CREATE TABLE campos_propios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  rama_id uuid NOT NULL REFERENCES ramas (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('texto', 'booleano', 'fecha', 'lista')),
  seccion text NOT NULL,
  sensible boolean NOT NULL DEFAULT false,
  opciones text[] NOT NULL DEFAULT '{}',
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX campos_propios_nombre ON campos_propios (rama_id, lower(nombre));

CREATE TABLE fichas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  rama_id uuid NOT NULL REFERENCES ramas (id),
  equipo_id uuid REFERENCES equipos (id) ON DELETE SET NULL,
  estado text NOT NULL CHECK (estado IN ('activa', 'incompleta', 'archivada', 'anonimizada')),
  incompleta_motivos text[] NOT NULL DEFAULT '{}',
  apellido text,
  nombre text,
  dni text,
  fecha_nacimiento date,
  religion_id uuid REFERENCES catalogo_valores (id),
  categoria_miembro_id uuid REFERENCES catalogo_valores (id),
  tel_emergencia_1 text,
  tel_emergencia_2 text,
  tel_propio text,
  promesa_id uuid REFERENCES catalogo_valores (id),
  etapa_id uuid REFERENCES catalogo_valores (id),
  elemento_id uuid REFERENCES catalogo_valores (id),
  raid_id uuid REFERENCES catalogo_valores (id),
  cordi text CHECK (cordi IN ('coordinador', 'subcoordinador')),
  guardian_id uuid REFERENCES catalogo_valores (id),
  rol_comunidad text,
  tiene_tada boolean NOT NULL DEFAULT false,
  mistica text,
  ingreso_movimiento_id uuid REFERENCES catalogo_valores (id),
  fecha_revision_diario date,
  -- RN-05: { concepto: 'pagada' | 'adeudada' | 'exenta' | null }. Sin montos.
  cuotas jsonb NOT NULL DEFAULT '{}',
  -- RF-119: { campoPropioId: valor }
  campos_propios jsonb NOT NULL DEFAULT '{}',
  -- Datos que conserva la anonimización (RN-12).
  anio_nacimiento integer,
  estado_tada_final text,
  -- RF-025: control de edición simultánea.
  version integer NOT NULL DEFAULT 1,
  archivada_en timestamptz,
  anonimizada_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON fichas (grupo_id);
CREATE INDEX ON fichas (rama_id, estado);
-- RN-03: DNI único dentro del grupo, entre fichas activas y archivadas.
CREATE UNIQUE INDEX fichas_dni_grupo ON fichas (grupo_id, dni) WHERE dni IS NOT NULL;
-- RN-11: un coordinador y un subcoordinador por equipo.
CREATE UNIQUE INDEX fichas_cordi_equipo ON fichas (equipo_id, cordi) WHERE cordi IS NOT NULL AND equipo_id IS NOT NULL;

-- RD-003 / RN-06
CREATE TABLE documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  ficha_id uuid NOT NULL REFERENCES fichas (id) ON DELETE CASCADE,
  tipo text NOT NULL,
  estado text NOT NULL,
  fecha_entrega date,
  archivo_id uuid REFERENCES archivos (id) ON DELETE SET NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ficha_id, tipo)
);

-- RF-026: historial de cambios de la ficha.
CREATE TABLE historial (
  id bigserial PRIMARY KEY,
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  ficha_id uuid NOT NULL REFERENCES fichas (id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES usuarios (id) ON DELETE SET NULL,
  campo text NOT NULL,
  valor_anterior text,
  valor_nuevo text,
  -- Versión de la ficha que resultó del cambio (RF-025).
  version integer NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON historial (ficha_id, version);

-- RNF-044 a RNF-046: registros de auditoría. Sin datos personales de protagonistas:
-- se refieren a la ficha solo por su id y no tienen clave foránea, para sobrevivir a la supresión.
CREATE TABLE auditoria (
  id bigserial PRIMARY KEY,
  grupo_id uuid,
  usuario_id uuid,
  accion text NOT NULL,
  ficha_id uuid,
  detalle jsonb NOT NULL DEFAULT '{}',
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON auditoria (grupo_id, creado_en);

-- RN-14: registro de mails enviados para el tope diario (sin destinatarios ni contenido).
CREATE TABLE mails (
  id bigserial PRIMARY KEY,
  tipo text NOT NULL,
  enviado boolean NOT NULL,
  detalle text,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON mails (creado_en);

-- RNF-034: errores del servidor ya notificados (para avisar una vez por error nuevo).
CREATE TABLE errores_notificados (
  firma text PRIMARY KEY,
  primera_vez timestamptz NOT NULL DEFAULT now(),
  ultima_vez timestamptz NOT NULL DEFAULT now(),
  cantidad integer NOT NULL DEFAULT 1
);
