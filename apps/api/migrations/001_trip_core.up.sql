CREATE TABLE IF NOT EXISTS trip (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT trip_date_range CHECK (end_date >= start_date AND end_date - start_date <= 59),
  CONSTRAINT trip_name_nonempty CHECK (length(btrim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS trip_owner_active_start_idx
  ON trip (owner_id, start_date DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS trip_entry (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  day date NOT NULL,
  variant char(1) NOT NULL DEFAULT 'A',
  position integer NOT NULL,
  kind varchar(16) NOT NULL,
  title text NOT NULL,
  time_label varchar(80) NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  area varchar(160) NOT NULL DEFAULT '',
  place_id text,
  source_key text,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_entry_variant CHECK (variant ~ '^[A-Z]$'),
  CONSTRAINT trip_entry_position CHECK (position >= 0),
  CONSTRAINT trip_entry_kind CHECK (kind IN ('place', 'transport', 'note')),
  CONSTRAINT trip_entry_title_nonempty CHECK (length(btrim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS trip_entry_day_order_idx
  ON trip_entry (trip_id, day, variant, position, id);
CREATE INDEX IF NOT EXISTS trip_entry_place_idx
  ON trip_entry (trip_id, place_id)
  WHERE place_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS trip_entry_source_idx
  ON trip_entry (trip_id, source_key)
  WHERE source_key IS NOT NULL;
