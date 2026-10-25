-- Parte 3 — Ficha de Actividad en PDF (RF-068, RF-088 a RF-105).

-- RF-088: cabecera de la Ficha de Actividad de cada rama. Sin fila, la portada usa el nombre del
-- grupo y la comunidad de la rama.
CREATE TABLE cabeceras_ficha (
  rama_id uuid PRIMARY KEY REFERENCES ramas (id) ON DELETE CASCADE,
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  nombre_grupo text,
  nombre_comunidad text,
  logo_archivo_id uuid REFERENCES archivos (id) ON DELETE SET NULL,
  -- [{ "nombre", "cargo", "formacion" }]
  educadores jsonb NOT NULL DEFAULT '[]',
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- RF-068: una actividad tiene a lo sumo una ficha. Las actividades de grupo no tienen rama: la
-- ficha es de la rama desde la que se crea (cabecera y diagnóstico de esa rama).
CREATE TABLE fichas_actividad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  rama_id uuid NOT NULL REFERENCES ramas (id) ON DELETE CASCADE,
  actividad_id uuid NOT NULL UNIQUE REFERENCES actividades (id) ON DELETE CASCADE,
  -- Estados de la sección 3.3: EnCarga ⇄ Final.
  estado text NOT NULL DEFAULT 'enCarga' CHECK (estado IN ('enCarga', 'final')),
  diagnostico text NOT NULL DEFAULT '',
  -- RF-090
  por_que text NOT NULL DEFAULT '',
  a_que_responde text NOT NULL DEFAULT '',
  donde_necesidad text NOT NULL DEFAULT '',
  por_que_lugar text NOT NULL DEFAULT '',
  -- RF-091
  objetivos_educativos text[] NOT NULL DEFAULT '{}',
  objetivos_dirigente text[] NOT NULL DEFAULT '{}',
  -- RF-092: [{ "area", "descripcion" }]
  areas jsonb NOT NULL DEFAULT '[]',
  -- RF-093 / RF-094: [{ "hora", "nombre", "responsable", "observaciones", "anexo" }]
  grilla jsonb NOT NULL DEFAULT '[]',
  -- RF-103: solo el último PDF generado.
  pdf_archivo_id uuid REFERENCES archivos (id) ON DELETE SET NULL,
  pdf_final boolean NOT NULL DEFAULT false,
  pdf_generado_en timestamptz,
  creado_por uuid REFERENCES usuarios (id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON fichas_actividad (grupo_id);
CREATE INDEX ON fichas_actividad (rama_id, creado_en);

-- RD-005 / RF-095 a RF-097
CREATE TABLE anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  ficha_actividad_id uuid NOT NULL REFERENCES fichas_actividad (id) ON DELETE CASCADE,
  numero integer NOT NULL CHECK (numero > 0),
  asignado_a uuid REFERENCES usuarios (id) ON DELETE SET NULL,
  titulo text NOT NULL DEFAULT '',
  categoria_id uuid REFERENCES catalogo_valores (id) ON DELETE SET NULL,
  edad_desde integer,
  edad_hasta integer,
  participantes integer,
  duracion_minutos integer,
  espacio text NOT NULL DEFAULT '',
  -- Un número o "todos".
  educadores text NOT NULL DEFAULT '',
  -- RN-10: sin valor se usan los equipos activos de la rama.
  equipos integer,
  motivacion text NOT NULL DEFAULT '',
  objetivos text NOT NULL DEFAULT '',
  areas text NOT NULL DEFAULT '',
  -- RF-097: [{ "cantidad", "descripcion", "porEquipo" }]
  materiales jsonb NOT NULL DEFAULT '[]',
  -- Texto con **negrita** y listas (líneas que empiezan con "- ").
  desarrollo text NOT NULL DEFAULT '',
  completo boolean NOT NULL DEFAULT false,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ficha_actividad_id, numero)
);
CREATE INDEX ON anexos (asignado_a) WHERE NOT completo;
CREATE INDEX ON anexos (grupo_id);
