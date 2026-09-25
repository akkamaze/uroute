DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trip_source_place LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing to drop trip_source_place while map pins exist';
  END IF;
END $$;

DROP TABLE IF EXISTS trip_source_place;
