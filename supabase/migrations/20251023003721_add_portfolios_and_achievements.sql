/*
  # Add Multiple Portfolios and Achievements

  1. New Tables
    - `portfolios`
      - `id` (uuid, primary key) - Unique identifier
      - `name` (text) - Portfolio name
      - `description` (text) - Optional description
      - `is_default` (boolean) - Whether this is the default portfolio
      - `created_at` (timestamptz) - Creation time

    - `achievements`
      - `id` (uuid, primary key) - Unique identifier
      - `achievement_type` (text) - Type of achievement
      - `title` (text) - Achievement title
      - `description` (text) - Achievement description
      - `icon` (text) - Icon identifier
      - `unlocked_at` (timestamptz) - When unlocked
      - `created_at` (timestamptz) - Record creation time

  2. Schema Changes
    - Add portfolio_id to holdings table
    - Add portfolio_id to transactions table
    - Add portfolio_id to portfolio_snapshots table

  3. Indexes
    - Index on portfolio_id for quick filtering
    - Index on achievement_type for grouping

  4. Security
    - Enable RLS on new tables
    - Allow all operations for single-user
*/

CREATE TABLE IF NOT EXISTS portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  unlocked_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'holdings' AND column_name = 'portfolio_id'
  ) THEN
    ALTER TABLE holdings ADD COLUMN portfolio_id uuid REFERENCES portfolios(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'portfolio_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN portfolio_id uuid REFERENCES portfolios(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'portfolio_snapshots' AND column_name = 'portfolio_id'
  ) THEN
    ALTER TABLE portfolio_snapshots ADD COLUMN portfolio_id uuid REFERENCES portfolios(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_holdings_portfolio ON holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_transactions_portfolio ON transactions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_portfolio ON portfolio_snapshots(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_achievements_type ON achievements(achievement_type);

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on portfolios"
  ON portfolios
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on achievements"
  ON achievements
  FOR ALL
  USING (true)
  WITH CHECK (true);

INSERT INTO portfolios (name, description, is_default)
VALUES ('Ana Portföy', 'Varsayılan portföy', true)
ON CONFLICT DO NOTHING;
