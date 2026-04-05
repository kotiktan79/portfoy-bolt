/*
  # Fix RLS Policies for Anonymous Access

  1. Changes
    - Add permissive RLS policies for anonymous users
    - Allow SELECT, INSERT, UPDATE, DELETE without authentication
    - This enables the app to work without Supabase Auth

  2. Security
    - TEMPORARY solution for development
    - In production, proper authentication should be implemented
*/

-- Holdings table policies
DROP POLICY IF EXISTS "Enable read access for all users" ON holdings;
DROP POLICY IF EXISTS "Enable insert for all users" ON holdings;
DROP POLICY IF EXISTS "Enable update for all users" ON holdings;
DROP POLICY IF EXISTS "Enable delete for all users" ON holdings;

CREATE POLICY "Enable read access for all users"
  ON holdings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Enable insert for all users"
  ON holdings FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Enable update for all users"
  ON holdings FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable delete for all users"
  ON holdings FOR DELETE
  TO anon, authenticated
  USING (true);

-- Portfolio snapshots policies
DROP POLICY IF EXISTS "Enable read access for all users" ON portfolio_snapshots;
DROP POLICY IF EXISTS "Enable insert for all users" ON portfolio_snapshots;

CREATE POLICY "Enable read access for all users"
  ON portfolio_snapshots FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Enable insert for all users"
  ON portfolio_snapshots FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Price history policies
DROP POLICY IF EXISTS "Enable read access for all users" ON price_history;
DROP POLICY IF EXISTS "Enable insert for all users" ON price_history;

CREATE POLICY "Enable read access for all users"
  ON price_history FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Enable insert for all users"
  ON price_history FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Achievements policies
DROP POLICY IF EXISTS "Enable read access for all users" ON achievements;
DROP POLICY IF EXISTS "Enable insert for all users" ON achievements;

CREATE POLICY "Enable read access for all users"
  ON achievements FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Enable insert for all users"
  ON achievements FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);