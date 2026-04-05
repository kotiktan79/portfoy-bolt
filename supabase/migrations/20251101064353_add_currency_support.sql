/*
  # Add Currency Support to Portfolio System

  1. Changes
    - Add currency column to holdings table
    - Add currency column to transactions table
    - Add currency column to price_history table
    - Create exchange_rates table for currency conversion
    - Add indexes for performance

  2. Purpose
    - Support multi-currency portfolios
    - Accurate PnL calculations across different currencies
    - Handle USD gold prices, EUR stocks, etc.
*/

-- Add currency column to holdings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'holdings' AND column_name = 'currency'
  ) THEN
    ALTER TABLE holdings ADD COLUMN currency text DEFAULT 'TRY';
    ALTER TABLE holdings ADD COLUMN purchase_currency text DEFAULT 'TRY';
  END IF;
END $$;

-- Add currency column to transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'currency'
  ) THEN
    ALTER TABLE transactions ADD COLUMN currency text DEFAULT 'TRY';
  END IF;
END $$;

-- Add currency column to price_history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'price_history' AND column_name = 'currency'
  ) THEN
    ALTER TABLE price_history ADD COLUMN currency text DEFAULT 'TRY';
  END IF;
END $$;

-- Create exchange_rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric(20, 8) NOT NULL,
  recorded_at timestamptz DEFAULT now(),
  source text DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies ON exchange_rates(from_currency, to_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_time ON exchange_rates(recorded_at DESC);

ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" 
  ON exchange_rates FOR SELECT 
  TO anon, authenticated 
  USING (true);

CREATE POLICY "Enable insert for all users" 
  ON exchange_rates FOR INSERT 
  TO anon, authenticated 
  WITH CHECK (true);

-- Insert common exchange rates (will be updated by service)
INSERT INTO exchange_rates (from_currency, to_currency, rate, source)
VALUES 
  ('USD', 'TRY', 34.50, 'initial'),
  ('EUR', 'TRY', 37.20, 'initial'),
  ('GBP', 'TRY', 43.50, 'initial'),
  ('TRY', 'USD', 0.029, 'initial'),
  ('TRY', 'EUR', 0.027, 'initial'),
  ('TRY', 'GBP', 0.023, 'initial'),
  ('USD', 'EUR', 0.92, 'initial'),
  ('EUR', 'USD', 1.09, 'initial')
ON CONFLICT DO NOTHING;
