/*
  # Create Exchange Rates Table
  
  1. New Tables
    - `exchange_rates`
      - `id` (uuid, primary key)
      - `from_currency` (text) - Source currency code
      - `to_currency` (text) - Target currency code  
      - `rate` (numeric) - Exchange rate
      - `recorded_at` (timestamptz) - When rate was recorded
      - `source` (text) - Source of the rate (api, manual, etc.)
      - `created_at` (timestamptz) - Record creation time
      
  2. Security
    - Enable RLS on `exchange_rates` table
    - Add policy for public read access (exchange rates are public data)
    - Add policy for authenticated and anonymous users to insert rates
    
  3. Indexes
    - Index on (from_currency, to_currency, recorded_at) for fast lookups
*/

CREATE TABLE IF NOT EXISTS exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'api',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read exchange rates"
  ON exchange_rates
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert rates"
  ON exchange_rates
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anonymous can insert rates"
  ON exchange_rates
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup
  ON exchange_rates (from_currency, to_currency, recorded_at DESC);
