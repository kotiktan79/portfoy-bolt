/*
  # Complete Portfolio Tracking System Schema v2

  1. All Tables
    - holdings, price_history, portfolio_snapshots
    - transactions, price_alerts, dividends
    - portfolios, achievements

  2. Security
    - RLS enabled on all tables
    - Anonymous access for core portfolio features

  3. Purpose
    - Complete database schema for portfolio tracking app
*/

-- Portfolios table (create first as it's referenced by others)
CREATE TABLE IF NOT EXISTS portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations on portfolios" ON portfolios FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Holdings table
CREATE TABLE IF NOT EXISTS holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  asset_type text NOT NULL,
  purchase_price numeric(20, 4) NOT NULL,
  quantity numeric(20, 8) NOT NULL,
  current_price numeric(20, 4) DEFAULT 0,
  portfolio_id uuid REFERENCES portfolios(id) ON DELETE CASCADE,
  manual_price boolean DEFAULT false,
  manual_price_updated_at timestamptz,
  price_notes text,
  cost_basis numeric DEFAULT 0,
  unrealized_pnl numeric DEFAULT 0,
  unrealized_pnl_percent numeric DEFAULT 0,
  total_realized_pnl numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON holdings(symbol);
CREATE INDEX IF NOT EXISTS idx_holdings_asset_type ON holdings(asset_type);
CREATE INDEX IF NOT EXISTS idx_holdings_portfolio ON holdings(portfolio_id);

ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON holdings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert for all users" ON holdings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON holdings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for all users" ON holdings FOR DELETE TO anon, authenticated USING (true);

-- Price history table
CREATE TABLE IF NOT EXISTS price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid REFERENCES holdings(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  price numeric(20, 4) NOT NULL,
  recorded_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_history_holding_time ON price_history(holding_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_symbol_time ON price_history(symbol, recorded_at DESC);

ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON price_history FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert for all users" ON price_history FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Portfolio snapshots table
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_value numeric(20, 2) NOT NULL,
  total_investment numeric(20, 2) NOT NULL,
  total_pnl numeric(20, 2) NOT NULL,
  pnl_percentage numeric(10, 4) NOT NULL,
  snapshot_date date NOT NULL,
  portfolio_id uuid REFERENCES portfolios(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_date ON portfolio_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_portfolio ON portfolio_snapshots(portfolio_id);

ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON portfolio_snapshots FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert for all users" ON portfolio_snapshots FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid REFERENCES holdings(id) ON DELETE CASCADE,
  portfolio_id uuid REFERENCES portfolios(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('buy', 'sell')),
  quantity numeric(20, 8) NOT NULL,
  price numeric(20, 4) NOT NULL,
  total_amount numeric(20, 2) NOT NULL,
  fee numeric(20, 2) DEFAULT 0,
  realized_profit numeric(20, 2),
  notes text,
  transaction_date timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_holding_date ON transactions(holding_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_portfolio ON transactions(portfolio_id);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations on transactions" ON transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Price alerts table
CREATE TABLE IF NOT EXISTS price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  target_price numeric(20, 4) NOT NULL,
  condition text NOT NULL CHECK (condition IN ('above', 'below')),
  is_active boolean DEFAULT true,
  triggered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_symbol_active ON price_alerts(symbol, is_active);

ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations on price_alerts" ON price_alerts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Dividends table
CREATE TABLE IF NOT EXISTS dividends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid REFERENCES holdings(id) ON DELETE CASCADE,
  amount numeric(20, 2) NOT NULL,
  payment_date date NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dividends_holding_date ON dividends(holding_id, payment_date DESC);

ALTER TABLE dividends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations on dividends" ON dividends FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Achievements table
CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  unlocked_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_achievements_type ON achievements(achievement_type);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON achievements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert for all users" ON achievements FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Insert default portfolio
INSERT INTO portfolios (name, description, is_default)
VALUES ('Ana Portföy', 'Varsayılan portföy', true)
ON CONFLICT DO NOTHING;