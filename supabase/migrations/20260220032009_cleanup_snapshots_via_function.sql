
/*
  # Cleanup duplicate snapshots using a security definer function

  Creates a temporary function with elevated privileges to delete duplicates,
  then drops it. Also adds unique constraint on snapshot_date.
*/

CREATE OR REPLACE FUNCTION cleanup_duplicate_snapshots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM portfolio_snapshots
  WHERE id NOT IN (
    SELECT DISTINCT ON (snapshot_date) id
    FROM portfolio_snapshots
    ORDER BY snapshot_date, id DESC
  );
END;
$$;

SELECT cleanup_duplicate_snapshots();

DROP FUNCTION cleanup_duplicate_snapshots();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'portfolio_snapshots_snapshot_date_key'
  ) THEN
    ALTER TABLE portfolio_snapshots ADD CONSTRAINT portfolio_snapshots_snapshot_date_key UNIQUE (snapshot_date);
  END IF;
END $$;
