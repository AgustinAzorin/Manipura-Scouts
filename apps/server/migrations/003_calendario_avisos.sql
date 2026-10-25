-- Parte 2 — Calendario y avisos (RF-072 a RF-087).

-- RF-079: destinatarios de los avisos de la actividad ({ "tipo": "alcance" | "rama" | "equipo" | "rol", "id"? }).
ALTER TABLE actividades ADD COLUMN destino_avisos jsonb NOT NULL DEFAULT '{"tipo":"alcance"}';

-- RF-078 / RN-16: hasta 2 avisos programados por actividad.
CREATE TABLE avisos_actividad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  actividad_id uuid NOT NULL REFERENCES actividades (id) ON DELETE CASCADE,
  antelacion text NOT NULL CHECK (antelacion IN ('0m', '1h', '1d', '1w')),
  enviar_en timestamptz NOT NULL,
  enviado_en timestamptz,
  -- El servidor estuvo caído cuando tocaba enviarlo y ya no tiene sentido (se registra igual).
  omitido boolean NOT NULL DEFAULT false,
  -- RF-062: al cancelar la actividad se anulan los pendientes.
  anulado_en timestamptz,
  UNIQUE (actividad_id, antelacion)
);
CREATE INDEX avisos_actividad_pendientes ON avisos_actividad (enviar_en) WHERE enviado_en IS NULL AND anulado_en IS NULL;

-- RF-075 / RF-076: feriados nacionales (grupo_id nulo, de la fuente pública) y los que carga cada grupo.
CREATE TABLE feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid REFERENCES grupos (id) ON DELETE CASCADE,
  fecha date NOT NULL,
  nombre text NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON feriados (fecha);
CREATE UNIQUE INDEX feriados_nacionales ON feriados (fecha, nombre) WHERE grupo_id IS NULL;
CREATE UNIQUE INDEX feriados_de_grupo ON feriados (grupo_id, fecha, nombre) WHERE grupo_id IS NOT NULL;

-- RF-077: recordatorios personales, que solo ve quien los crea.
CREATE TABLE recordatorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  fecha date NOT NULL,
  hora text CHECK (hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  titulo text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON recordatorios (usuario_id, fecha);

-- RF-080: dispositivos que reciben push. Van atados a la sesión: al cerrarla o al desactivar al
-- usuario (que borra sus sesiones, RNF-021) el celular deja de recibir avisos.
CREATE TABLE dispositivos (
  token text PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  sesion_id uuid NOT NULL REFERENCES sesiones (id) ON DELETE CASCADE,
  plataforma text NOT NULL CHECK (plataforma IN ('android', 'ios')),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON dispositivos (usuario_id);

-- RF-084: canales desactivados por tipo de aviso. Lo que no figura está activo.
CREATE TABLE preferencias_avisos (
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('actividades', 'cumpleanios', 'manuales')),
  canal text NOT NULL CHECK (canal IN ('push', 'mail')),
  activo boolean NOT NULL,
  PRIMARY KEY (usuario_id, tipo, canal)
);

-- RF-086 / RF-087: avisos manuales del admin de grupo y su historial.
CREATE TABLE avisos_manuales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  remitente_id uuid REFERENCES usuarios (id) ON DELETE SET NULL,
  remitente_nombre text NOT NULL,
  destino jsonb NOT NULL,
  destino_nombre text NOT NULL,
  canales text[] NOT NULL,
  importante boolean NOT NULL DEFAULT false,
  titulo text NOT NULL,
  texto text NOT NULL,
  destinatarios integer NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON avisos_manuales (grupo_id, creado_en);

-- RF-083: cumpleaños ya avisados, para no repetir el aviso del día.
CREATE TABLE cumpleanios_avisados (
  ficha_id uuid NOT NULL REFERENCES fichas (id) ON DELETE CASCADE,
  fecha date NOT NULL,
  PRIMARY KEY (ficha_id, fecha)
);
