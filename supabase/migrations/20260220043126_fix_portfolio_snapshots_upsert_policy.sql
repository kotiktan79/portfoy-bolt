/*
  # Fix portfolio_snapshots RLS for upsert

  The upsert operation (INSERT ... ON CONFLICT DO UPDATE) requires both
  INSERT and UPDATE policies. Adding a permissive UPDATE policy so that
  the analytics service can save/update snapshots without RLS errors.
*/

CREATE POLICY "Enable update for all users"
  ON portfolio_snapshots
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
