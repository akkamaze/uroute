CREATE TABLE IF NOT EXISTS trip_cover (
  trip_id uuid PRIMARY KEY REFERENCES trip(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  data bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_cover_content_type CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT trip_cover_size CHECK (octet_length(data) BETWEEN 1 AND 2097152)
);
