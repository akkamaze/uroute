CREATE TABLE IF NOT EXISTS trip_draft (
  trip_id uuid NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  day date NOT NULL,
  variant char(1) NOT NULL,
  base_version bigint NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  visits jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, day, variant),
  CONSTRAINT trip_draft_variant CHECK (variant ~ '^[A-Z]$'),
  CONSTRAINT trip_draft_visits_array CHECK (jsonb_typeof(visits) = 'array'),
  CONSTRAINT trip_draft_revision_positive CHECK (revision > 0)
);
