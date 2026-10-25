-- Parte 2 — Actividades, asistencia y autorizaciones (RF-057 a RF-071).

-- RF-063: tipos de actividad del grupo, con color y la marca "requiere autorización" (RN-17).
CREATE TABLE tipos_actividad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  requiere_autorizacion boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tipos_actividad_nombre ON tipos_actividad (grupo_id, lower(nombre));

-- Los grupos que ya existen arrancan con los mismos tipos que los nuevos (TIPOS_ACTIVIDAD_INICIALES).
INSERT INTO tipos_actividad (grupo_id, nombre, color, requiere_autorizacion, orden)
SELECT g.id, t.nombre, t.color, t.requiere, t.orden
FROM grupos g
CROSS JOIN (VALUES
  ('Reunión de sábado', '#1F4D2B', false, 0),
  ('Campamento', '#0B4F8A', true, 1),
  ('Raid', '#B03A00', true, 2),
  ('Acantonamiento', '#5B2C83', true, 3)
) AS t (nombre, color, requiere, orden);

-- RF-060 a RF-062. El alcance sigue la forma de las asignaciones (RF-019).
CREATE TABLE actividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  tipo_id uuid NOT NULL REFERENCES tipos_actividad (id),
  nombre text NOT NULL,
  inicio timestamptz NOT NULL,
  fin timestamptz NOT NULL,
  lugar text,
  alcance text NOT NULL CHECK (alcance IN ('grupo', 'rama', 'equipo')),
  rama_id uuid REFERENCES ramas (id) ON DELETE CASCADE,
  -- Al eliminarse un equipo (RN-20) sus actividades pasan a la rama antes de borrarlo.
  equipo_id uuid REFERENCES equipos (id),
  -- RF-062: la actividad cancelada sigue visible.
  cancelada_en timestamptz,
  creado_por uuid REFERENCES usuarios (id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (fin >= inicio),
  CHECK (
    (alcance = 'grupo' AND rama_id IS NULL AND equipo_id IS NULL)
    OR (alcance = 'rama' AND rama_id IS NOT NULL AND equipo_id IS NULL)
    OR (alcance = 'equipo' AND rama_id IS NOT NULL AND equipo_id IS NOT NULL)
  )
);
CREATE INDEX ON actividades (grupo_id, inicio);
CREATE INDEX ON actividades (rama_id, inicio);

-- INSCRIPCION (sección 3.3): confirmación (RF-065), asistencia (RF-058) y autorización (RF-059)
-- de un protagonista en una actividad. Cada campo guarda la hora del dispositivo de su último
-- cambio para resolver conflictos de registros sin conexión (RN-08).
CREATE TABLE inscripciones (
  actividad_id uuid NOT NULL REFERENCES actividades (id) ON DELETE CASCADE,
  ficha_id uuid NOT NULL REFERENCES fichas (id) ON DELETE CASCADE,
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  confirmacion text NOT NULL DEFAULT 'sinRespuesta' CHECK (confirmacion IN ('sinRespuesta', 'va', 'noVa')),
  confirmacion_en timestamptz,
  presente boolean NOT NULL DEFAULT false,
  presente_en timestamptz,
  autorizacion text NOT NULL DEFAULT 'noPresentada' CHECK (autorizacion IN ('noPresentada', 'presentada')),
  autorizacion_fecha date,
  autorizacion_en timestamptz,
  autorizacion_archivo_id uuid REFERENCES archivos (id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actividad_id, ficha_id)
);
CREATE INDEX ON inscripciones (ficha_id);
CREATE INDEX ON inscripciones (grupo_id);
