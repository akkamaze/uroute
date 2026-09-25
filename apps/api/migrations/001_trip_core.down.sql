DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trip_entry LIMIT 1) OR EXISTS (SELECT 1 FROM trip LIMIT 1) THEN
    RAISE EXCEPTION 'Trip migration rollback refused: trip data exists';
  END IF;
END $$;

DROP TABLE trip_entry;
DROP TABLE trip;
