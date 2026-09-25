DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM trip_draft LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing to drop trip_draft while drafts exist';
  END IF;
END $$;

DROP TABLE IF EXISTS trip_draft;
