/*
  # Import Portfolio Data
  
  1. Purpose
    - Create complete database schema
    - Import 24 holdings from portfolio backup
    
  2. Tables Created
    - portfolios, holdings, price_history
    - portfolio_snapshots, transactions, price_alerts
    - dividends, achievements
    
  3. Security
    - RLS enabled on all tables
    - Anonymous access allowed for portfolio features
*/

-- Portfolios table
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

-- Insert holdings data
INSERT INTO holdings (id, symbol, asset_type, purchase_price, quantity, current_price, manual_price, cost_basis, unrealized_pnl, unrealized_pnl_percent, total_realized_pnl, created_at, updated_at) VALUES
('a1699390-6441-442b-8ac0-daa4fcb34dae', 'BIMAS', 'stock', 466.9, 136, 565, false, 0, 13341.600000000006, 21.010923109873648, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('0ac63c53-8c6a-4503-bd9a-c51e94a7b9f3', 'ALTIN', 'commodity', 4191, 150, 3584.4235, false, 0, 197314.84961499507, 31.387075417958332, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:32:25.848+00:00'),
('032b9b9c-dafb-4f62-8c7e-447f363c7635', 'GPA', 'fund', 16.2, 4036, 19.5636, true, 0, 0, 0, 0, '2025-10-22T23:56:47.888155+00:00', '2025-10-31T22:45:03.566+00:00'),
('65784535-4fe8-4a0e-b485-f07f6a6e54fa', 'EREGL', 'stock', 27.86, 1269, 28.5, false, 0, 812.1600000000035, 2.297200287150046, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('af2dd2fa-e452-4646-8e8e-dd1e216b3c1e', 'BTC', 'crypto', 3983062.1124, 0.0189, 4638248.0647, false, 0, 16340.67753192001, 21.706568675100144, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('94fb6456-1188-4220-bf2e-d622d5eac179', 'ETH', 'crypto', 91089.4349, 0.4241, 162450.3849, false, 0, 35674.26453292999, 92.34614024375728, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('c4c4af6b-bada-4c7e-9f06-2757c93d0fd4', 'ASELS', 'stock', 184.29, 322, 215.4, false, 0, 10017.420000000006, 16.881002767377513, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('18703753-dc0c-42b6-a850-d0859e0b49a0', 'EKGYO', 'stock', 14.3799, 4139, 20.15, false, 0, 23882.44389999999, 40.1261483042302, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('eb1a015e-7375-4ff3-9204-6874d29cbbdf', 'SAHOL', 'stock', 84.98, 548, 82.1, false, 0, -1578.2400000000052, -3.389032713579677, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('8821851f-c225-45f3-acd6-8a3eef0257ff', 'LINK', 'crypto', 617.41, 18.8934, 724.0417, false, 0, 3149.212370880001, 26.997165578788824, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('f20c88b5-b693-4366-ace7-3543b4f93a15', 'SISE', 'stock', 34.6268, 2301, 36.2, false, 0, 3619.9331999999995, 4.543301720054985, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('5f36f4e6-baf4-44f0-9a43-a2a3c42ef3c2', 'TOASO', 'stock', 192, 384, 275.8, false, 0, 32179.20000000001, 43.64583333333335, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('67059c1d-493c-451e-96e6-0851a94095f7', 'XRP', 'crypto', 120, 108, 105.6445, false, 0, -1050.5067119999985, -8.105761666666655, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('0183b39d-7875-446b-897c-78d498a8ed03', 'CCOLA', 'stock', 50.05, 700, 55.3, false, 0, 3675, 10.48951048951049, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('dbd2be15-08eb-4835-9e73-42a9a349656f', 'ENKAI', 'stock', 52.1827, 500, 78.2, false, 0, 13008.650000000001, 49.858094732545474, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('83521190-155c-4a45-a28d-da6073c32950', 'AKSEN', 'stock', 43.36, 1690, 51.2, false, 0, 13249.600000000006, 18.081180811808128, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('3d747e87-975c-443b-9444-9553fa46867b', 'TUPRS', 'stock', 124.38, 367, 195.4, false, 0, 26064.340000000004, 57.09921209197621, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('7456fe50-724a-41bb-95aa-7a0603c8c3f2', 'SOL', 'crypto', 6966, 2.7932, 7851.7083, false, 0, 4081.1752452000037, 20.97489233419468, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('a3975e2a-6218-4bf1-8fb2-13582d861073', 'TCELL', 'stock', 92.45, 335, 102.3, false, 0, 3299.75, 10.65440778799351, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('58099c2e-3f40-4ab0-8cad-115e45d2507b', 'THYAO', 'stock', 277.0084, 295, 305.5, false, 0, 8405.021999999997, 10.285464267509575, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T05:50:23.452+00:00'),
('c656d257-27ed-4dee-a180-20cb9d89aa25', 'EURO', 'currency', 47.63, 46800, 48.5403, false, 0, 0, 0, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T03:04:13.164+00:00'),
('fc571f25-f855-4432-8765-a5bcc60795cf', 'USD', 'currency', 38.2, 34000, 42.07, false, 0, 0, 0, 0, '2025-10-22T23:56:47.888155+00:00', '2025-11-01T03:59:05.894+00:00'),
('e6cac640-1d58-4f4c-9a29-03c572218ec8', 'IPV', 'fund', 56.8, 1971, 65.3328, true, 0, 0, 0, 0, '2025-10-22T23:56:47.888155+00:00', '2025-10-28T22:44:26.757+00:00'),
('cffea94e-53e9-4b1f-82d8-2192ac0891b6', 'US900123CJ75', 'eurobond', 37500, 2, 42496, false, 0, 0, 0, 0, '2025-10-22T23:56:47.888155+00:00', '2025-10-23T00:45:15.419+00:00')
ON CONFLICT (id) DO NOTHING;
