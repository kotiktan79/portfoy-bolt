/*
  # Add Automation and Social Features

  1. New Tables
    - `automation_settings`
      - `id` (uuid, primary key)
      - `user_id` (text)
      - `auto_rebalance` (jsonb) - Auto-rebalance settings
      - `dca` (jsonb) - DCA settings
      - `take_profit` (jsonb) - Take-profit settings
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `portfolio_shares`
      - `id` (uuid, primary key)
      - `share_code` (text, unique) - Public share URL code
      - `user_id` (text)
      - `portfolio_name` (text)
      - `is_anonymous` (boolean)
      - `total_value` (numeric)
      - `total_pnl` (numeric)
      - `total_pnl_percent` (numeric)
      - `created_at` (timestamp)

    - `leaderboard`
      - `id` (uuid, primary key)
      - `user_id` (text)
      - `username` (text)
      - `total_value` (numeric)
      - `pnl_percent` (numeric)
      - `rank` (integer)
      - `period` (text) - 'daily', 'weekly', 'monthly', 'all_time'
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users
*/

CREATE TABLE IF NOT EXISTS automation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'default',
  auto_rebalance jsonb DEFAULT '{"enabled": false, "frequency": "weekly", "threshold": 5}'::jsonb,
  dca jsonb DEFAULT '{"enabled": false, "symbol": "", "amount": 1000, "frequency": "monthly"}'::jsonb,
  take_profit jsonb DEFAULT '{"enabled": false, "symbol": "", "targetPrice": 0, "sellPercentage": 50}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS portfolio_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_code text UNIQUE NOT NULL,
  user_id text NOT NULL DEFAULT 'default',
  portfolio_name text DEFAULT 'My Portfolio',
  is_anonymous boolean DEFAULT true,
  total_value numeric DEFAULT 0,
  total_pnl numeric DEFAULT 0,
  total_pnl_percent numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'default',
  username text DEFAULT 'Anonymous',
  total_value numeric DEFAULT 0,
  pnl_percent numeric DEFAULT 0,
  rank integer DEFAULT 0,
  period text DEFAULT 'all_time',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, period)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_period_rank ON leaderboard(period, rank);
CREATE INDEX IF NOT EXISTS idx_portfolio_shares_code ON portfolio_shares(share_code);

ALTER TABLE automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own automation settings"
  ON automation_settings
  FOR ALL
  TO authenticated
  USING (user_id = current_user);

CREATE POLICY "Public can view shared portfolios"
  ON portfolio_shares
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can manage own shares"
  ON portfolio_shares
  FOR ALL
  TO authenticated
  USING (user_id = current_user);

CREATE POLICY "Public can view leaderboard"
  ON leaderboard
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can update own leaderboard entry"
  ON leaderboard
  FOR ALL
  TO authenticated
  USING (user_id = current_user);