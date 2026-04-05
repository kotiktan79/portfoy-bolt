/*
  # Add Missing Tables - Exchange Rates and Monthly Withdrawals

  1. New Tables
    - `exchange_rates`: Currency exchange rates tracking
      - `id` (uuid, primary key)
      - `from_currency` (text) - Source currency code
      - `to_currency` (text) - Target currency code
      - `rate` (numeric) - Exchange rate
      - `recorded_at` (timestamptz) - When the rate was recorded
      - `created_at` (timestamptz)

    - `monthly_withdrawals`: Monthly withdrawal tracking
      - `id` (uuid, primary key)
      - `year` (integer) - Year
      - `month` (integer) - Month (1-12)
      - `amount` (numeric) - Withdrawal amount
      - `notes` (text) - Optional notes
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Allow anonymous and authenticated access for all operations

  3. Indexes
    - Index on exchange_rates for quick lookups by currency pair
    - Index on monthly_withdrawals for quick lookups by year/month
*/

-- Exchange rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric(20, 8) NOT NULL,
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies_time ON exchange_rates(from_currency, to_currency, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_time ON exchange_rates(recorded_at DESC);

ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON exchange_rates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert for all users" ON exchange_rates FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON exchange_rates FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for all users" ON exchange_rates FOR DELETE TO anon, authenticated USING (true);

-- Monthly withdrawals table
CREATE TABLE IF NOT EXISTS monthly_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  amount numeric(20, 2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(year, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_withdrawals_year_month ON monthly_withdrawals(year DESC, month DESC);

ALTER TABLE monthly_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON monthly_withdrawals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert for all users" ON monthly_withdrawals FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON monthly_withdrawals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for all users" ON monthly_withdrawals FOR DELETE TO anon, authenticated USING (true);