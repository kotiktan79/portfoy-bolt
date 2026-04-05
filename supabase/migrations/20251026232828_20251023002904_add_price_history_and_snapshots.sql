/*
  # Add Price History and Portfolio Snapshots

  1. New Tables
    - `price_history`
      - `id` (uuid, primary key) - Unique identifier
      - `holding_id` (uuid, foreign key) - Reference to holdings table
      - `symbol` (text) - Asset symbol for quick lookup
      - `price` (numeric) - Historical price at snapshot time
      - `recorded_at` (timestamptz) - Timestamp of price recording
    
    - `portfolio_snapshots`
      - `id` (uuid, primary key) - Unique identifier
      - `total_value` (numeric) - Total portfolio value at snapshot time
      - `total_investment` (numeric) - Total investment amount
      - `total_pnl` (numeric) - Profit/loss amount
      - `pnl_percentage` (numeric) - Profit/loss percentage
      - `snapshot_date` (date) - Date of snapshot (for daily aggregation)
      - `created_at` (timestamptz) - Timestamp of snapshot creation

  2. Indexes
    - Index on holding_id and recorded_at for efficient historical queries
    - Index on symbol and recorded_at for price lookups
    - Index on snapshot_date for time-based queries

  3. Security
    - Enable RLS on both tables
    - Allow all operations (for single-user portfolio)
*/

CREATE TABLE IF NOT EXISTS price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid REFERENCES holdings(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  price numeric(20, 4) NOT NULL,
  recorded_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_value numeric(20, 2) NOT NULL,
  total_investment numeric(20, 2) NOT NULL,
  total_pnl numeric(20, 2) NOT NULL,
  pnl_percentage numeric(10, 4) NOT NULL,
  snapshot_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_price_history_holding_time ON price_history(holding_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_symbol_time ON price_history(symbol, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_date ON portfolio_snapshots(snapshot_date DESC);

-- Enable RLS
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow all operations
CREATE POLICY "Allow all operations on price_history"
  ON price_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on portfolio_snapshots"
  ON portfolio_snapshots
  FOR ALL
  USING (true)
  WITH CHECK (true);