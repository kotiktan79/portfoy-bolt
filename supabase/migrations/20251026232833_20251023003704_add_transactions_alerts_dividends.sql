/*
  # Add Transactions, Alerts, and Dividends

  1. New Tables
    - `transactions`
      - `id` (uuid, primary key) - Unique identifier
      - `holding_id` (uuid, foreign key) - Reference to holdings
      - `transaction_type` (text) - Type: 'buy' or 'sell'
      - `quantity` (numeric) - Amount transacted
      - `price` (numeric) - Price per unit
      - `total_amount` (numeric) - Total transaction value
      - `fee` (numeric) - Transaction fee
      - `notes` (text) - Optional notes
      - `transaction_date` (timestamptz) - When transaction occurred
      - `created_at` (timestamptz) - Record creation time

    - `price_alerts`
      - `id` (uuid, primary key) - Unique identifier
      - `symbol` (text) - Asset symbol to monitor
      - `target_price` (numeric) - Alert trigger price
      - `condition` (text) - 'above' or 'below'
      - `is_active` (boolean) - Whether alert is active
      - `triggered_at` (timestamptz) - When alert was triggered
      - `created_at` (timestamptz) - Record creation time

    - `dividends`
      - `id` (uuid, primary key) - Unique identifier
      - `holding_id` (uuid, foreign key) - Reference to holdings
      - `amount` (numeric) - Dividend amount received
      - `payment_date` (date) - When dividend was paid
      - `notes` (text) - Optional notes
      - `created_at` (timestamptz) - Record creation time

  2. Indexes
    - Index on holding_id and transaction_date for transaction history
    - Index on symbol and is_active for active alerts
    - Index on holding_id and payment_date for dividend tracking

  3. Security
    - Enable RLS on all tables
    - Allow all operations for single-user portfolio
*/

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid REFERENCES holdings(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('buy', 'sell')),
  quantity numeric(20, 8) NOT NULL,
  price numeric(20, 4) NOT NULL,
  total_amount numeric(20, 2) NOT NULL,
  fee numeric(20, 2) DEFAULT 0,
  notes text,
  transaction_date timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  target_price numeric(20, 4) NOT NULL,
  condition text NOT NULL CHECK (condition IN ('above', 'below')),
  is_active boolean DEFAULT true,
  triggered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dividends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid REFERENCES holdings(id) ON DELETE CASCADE,
  amount numeric(20, 2) NOT NULL,
  payment_date date NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_holding_date ON transactions(holding_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_price_alerts_symbol_active ON price_alerts(symbol, is_active);
CREATE INDEX IF NOT EXISTS idx_dividends_holding_date ON dividends(holding_id, payment_date DESC);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dividends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on transactions"
  ON transactions
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on price_alerts"
  ON price_alerts
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on dividends"
  ON dividends
  FOR ALL
  USING (true)
  WITH CHECK (true);