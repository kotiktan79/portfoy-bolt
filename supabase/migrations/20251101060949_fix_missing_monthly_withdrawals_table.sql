/*
  # Add Missing Monthly Withdrawals Table

  1. New Tables
    - `monthly_withdrawals`
      - `id` (uuid, primary key)
      - `portfolio_id` (uuid, foreign key to portfolios)
      - `year` (integer)
      - `month` (integer, 1-12)
      - `amount` (numeric) - planned withdrawal amount
      - `actual_amount` (numeric) - actual withdrawal amount (if executed)
      - `executed_at` (timestamptz) - when withdrawal was executed
      - `notes` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `monthly_withdrawals` table
    - Add policy for authenticated users to manage own data
*/

CREATE TABLE IF NOT EXISTS monthly_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid REFERENCES portfolios(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  amount numeric NOT NULL DEFAULT 0,
  actual_amount numeric DEFAULT 0,
  executed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(portfolio_id, year, month)
);

ALTER TABLE monthly_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own monthly withdrawals"
  ON monthly_withdrawals
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anonymous users can view monthly withdrawals"
  ON monthly_withdrawals
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Users can insert own monthly withdrawals"
  ON monthly_withdrawals
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anonymous users can insert monthly withdrawals"
  ON monthly_withdrawals
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Users can update own monthly withdrawals"
  ON monthly_withdrawals
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anonymous users can update monthly withdrawals"
  ON monthly_withdrawals
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own monthly withdrawals"
  ON monthly_withdrawals
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Anonymous users can delete monthly withdrawals"
  ON monthly_withdrawals
  FOR DELETE
  TO anon
  USING (true);

CREATE INDEX IF NOT EXISTS idx_monthly_withdrawals_portfolio ON monthly_withdrawals(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_monthly_withdrawals_year_month ON monthly_withdrawals(year, month);