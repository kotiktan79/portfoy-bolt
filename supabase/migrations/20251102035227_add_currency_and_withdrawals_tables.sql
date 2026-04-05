/*
  # Add currency column and monthly_withdrawals table
  
  1. Changes to holdings table
    - Add currency column (TRY, USD, EUR)
    - Add source column for price tracking source
    
  2. New monthly_withdrawals table
    - Track monthly withdrawal amounts
    - year, month, amount columns
    
  3. Security
    - RLS enabled on monthly_withdrawals
    - Anonymous access allowed
*/

-- Add currency and source columns to holdings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'holdings' AND column_name = 'currency'
  ) THEN
    ALTER TABLE holdings ADD COLUMN currency text DEFAULT 'TRY';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'holdings' AND column_name = 'source'
  ) THEN
    ALTER TABLE holdings ADD COLUMN source text DEFAULT 'manual';
  END IF;
END $$;

-- Create monthly_withdrawals table
CREATE TABLE IF NOT EXISTS monthly_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(year, month)
);

ALTER TABLE monthly_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read withdrawals"
  ON monthly_withdrawals
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert withdrawals"
  ON monthly_withdrawals
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anonymous can insert withdrawals"
  ON monthly_withdrawals
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update withdrawals"
  ON monthly_withdrawals
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anonymous can update withdrawals"
  ON monthly_withdrawals
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_monthly_withdrawals_date
  ON monthly_withdrawals (year DESC, month DESC);
