CREATE TABLE IF NOT EXISTS trip_source_place (
  trip_id uuid NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  name text NOT NULL,
  latitude double precision,
  longitude double precision,
  category text,
  image_url text,
  notes text,
  PRIMARY KEY (trip_id, source_key),
  CONSTRAINT trip_source_place_latitude CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT trip_source_place_longitude CHECK (longitude BETWEEN -180 AND 180)
);
