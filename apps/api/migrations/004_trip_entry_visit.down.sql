DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trip_entry_visit LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing to drop trip_entry_visit while visits exist';
  END IF;
END $$;

DROP TABLE IF EXISTS trip_entry_visit;
