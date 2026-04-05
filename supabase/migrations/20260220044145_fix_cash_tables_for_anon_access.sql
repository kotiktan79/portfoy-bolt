/*
  # Fix cash_balances and cash_transactions for anonymous access

  The app operates without authentication (anon role).
  Drop existing authenticated-only policies and replace with
  permissive policies that allow anon access, matching the
  pattern used by other tables (holdings, portfolio_snapshots, etc.).
*/

DROP POLICY IF EXISTS "Users can select own cash balances" ON cash_balances;
DROP POLICY IF EXISTS "Users can insert own cash balances" ON cash_balances;
DROP POLICY IF EXISTS "Users can update own cash balances" ON cash_balances;
DROP POLICY IF EXISTS "Users can delete own cash balances" ON cash_balances;

DROP POLICY IF EXISTS "Users can select own cash transactions" ON cash_transactions;
DROP POLICY IF EXISTS "Users can insert own cash transactions" ON cash_transactions;
DROP POLICY IF EXISTS "Users can delete own cash transactions" ON cash_transactions;

CREATE POLICY "Enable read access for all users"
  ON cash_balances FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Enable insert for all users"
  ON cash_balances FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Enable update for all users"
  ON cash_balances FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable delete for all users"
  ON cash_balances FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Enable read access for all users"
  ON cash_transactions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Enable insert for all users"
  ON cash_transactions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Enable delete for all users"
  ON cash_transactions FOR DELETE
  TO anon, authenticated
  USING (true);
