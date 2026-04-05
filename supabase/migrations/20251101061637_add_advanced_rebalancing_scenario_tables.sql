/*
  # Advanced Rebalancing & Scenario Analysis Tables

  1. New Tables
    - `rebalancing_strategies`
      - `id` (uuid, primary key)
      - `portfolio_id` (uuid, foreign key)
      - `name` (text) - Strategy name (Conservative, Balanced, Aggressive, Custom)
      - `target_allocations` (jsonb) - {"stock": 40, "crypto": 20, ...}
      - `deviation_threshold` (numeric) - Alert when deviation exceeds %
      - `is_active` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `rebalancing_simulations`
      - `id` (uuid, primary key)
      - `portfolio_id` (uuid, foreign key)
      - `strategy_id` (uuid, foreign key)
      - `current_allocations` (jsonb)
      - `target_allocations` (jsonb)
      - `suggested_trades` (jsonb) - Array of {symbol, action, amount, shares}
      - `expected_cost` (numeric) - Total fees
      - `deviation_before` (numeric)
      - `deviation_after` (numeric)
      - `status` (text) - pending, executed, cancelled
      - `executed_at` (timestamptz)
      - `created_at` (timestamptz)

    - `scenario_analyses`
      - `id` (uuid, primary key)
      - `portfolio_id` (uuid, foreign key)
      - `scenario_name` (text) - Crisis, Boom, Inflation, Custom
      - `scenario_type` (text) - preset, custom, monte_carlo
      - `price_changes` (jsonb) - {"BTC": -30, "GARAN": -20, ...}
      - `result_current_value` (numeric)
      - `result_projected_value` (numeric)
      - `result_pnl_change` (numeric)
      - `confidence_level` (numeric) - For Monte Carlo (95, 99)
      - `iterations` (integer) - Number of Monte Carlo runs
      - `created_at` (timestamptz)

    - `rebalancing_history`
      - `id` (uuid, primary key)
      - `portfolio_id` (uuid, foreign key)
      - `simulation_id` (uuid, foreign key)
      - `trades_executed` (jsonb)
      - `total_cost` (numeric)
      - `portfolio_value_before` (numeric)
      - `portfolio_value_after` (numeric)
      - `notes` (text)
      - `executed_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated and anonymous users
*/

-- Rebalancing Strategies
CREATE TABLE IF NOT EXISTS rebalancing_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid REFERENCES portfolios(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_allocations jsonb NOT NULL DEFAULT '{}'::jsonb,
  deviation_threshold numeric DEFAULT 10.0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE rebalancing_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for rebalancing_strategies"
  ON rebalancing_strategies FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rebalancing_strategies_portfolio ON rebalancing_strategies(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_rebalancing_strategies_active ON rebalancing_strategies(is_active);

-- Rebalancing Simulations
CREATE TABLE IF NOT EXISTS rebalancing_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid REFERENCES portfolios(id) ON DELETE CASCADE,
  strategy_id uuid REFERENCES rebalancing_strategies(id) ON DELETE SET NULL,
  current_allocations jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_allocations jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_trades jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_cost numeric DEFAULT 0,
  deviation_before numeric DEFAULT 0,
  deviation_after numeric DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled')),
  executed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rebalancing_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for rebalancing_simulations"
  ON rebalancing_simulations FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rebalancing_simulations_portfolio ON rebalancing_simulations(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_rebalancing_simulations_status ON rebalancing_simulations(status);

-- Scenario Analyses
CREATE TABLE IF NOT EXISTS scenario_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid REFERENCES portfolios(id) ON DELETE CASCADE,
  scenario_name text NOT NULL,
  scenario_type text DEFAULT 'preset' CHECK (scenario_type IN ('preset', 'custom', 'monte_carlo')),
  price_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_current_value numeric DEFAULT 0,
  result_projected_value numeric DEFAULT 0,
  result_pnl_change numeric DEFAULT 0,
  confidence_level numeric,
  iterations integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scenario_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for scenario_analyses"
  ON scenario_analyses FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_scenario_analyses_portfolio ON scenario_analyses(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_scenario_analyses_type ON scenario_analyses(scenario_type);

-- Rebalancing History
CREATE TABLE IF NOT EXISTS rebalancing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid REFERENCES portfolios(id) ON DELETE CASCADE,
  simulation_id uuid REFERENCES rebalancing_simulations(id) ON DELETE SET NULL,
  trades_executed jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_cost numeric DEFAULT 0,
  portfolio_value_before numeric DEFAULT 0,
  portfolio_value_after numeric DEFAULT 0,
  notes text,
  executed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rebalancing_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for rebalancing_history"
  ON rebalancing_history FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rebalancing_history_portfolio ON rebalancing_history(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_rebalancing_history_executed ON rebalancing_history(executed_at);