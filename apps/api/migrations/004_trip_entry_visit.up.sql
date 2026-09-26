CREATE TABLE IF NOT EXISTS trip_entry_visit (
  trip_id uuid NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  visited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, source_key)
);
