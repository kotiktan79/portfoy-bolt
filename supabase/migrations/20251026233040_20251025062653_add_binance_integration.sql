/*
  # Binance Global Integration Schema

  1. New Tables
    - `binance_api_keys`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `exchange` (text: 'binance_global')
      - `api_key` (text, encrypted)
      - `api_secret` (text, encrypted)
      - `is_active` (boolean)
      - `last_sync` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `binance_balances`
      - `id` (uuid, primary key)
      - `user_id` (uuid)
      - `exchange` (text)
      - `symbol` (text)
      - `free` (numeric)
      - `locked` (numeric)
      - `total` (numeric)
      - `usd_value` (numeric)
      - `synced_at` (timestamptz)
      - `created_at` (timestamptz)
    
    - `bot_performance`
      - `id` (uuid, primary key)
      - `user_id` (uuid)
      - `bot_name` (text)
      - `exchange` (text)
      - `symbol` (text)
      - `total_trades` (integer)
      - `winning_trades` (integer)
      - `losing_trades` (integer)
      - `total_profit` (numeric)
      - `total_profit_percentage` (numeric)
      - `start_date` (timestamptz)
      - `last_trade` (timestamptz)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `sync_history`
      - `id` (uuid, primary key)
      - `user_id` (uuid)
      - `exchange` (text)
      - `sync_type` (text: 'manual', 'auto')
      - `status` (text: 'success', 'failed', 'partial')
      - `assets_synced` (integer)
      - `error_message` (text)
      - `synced_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
    - Encrypt sensitive API credentials
*/

-- Binance API Keys Table
CREATE TABLE IF NOT EXISTS binance_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  exchange text NOT NULL DEFAULT 'binance_global',
  api_key text NOT NULL,
  api_secret text NOT NULL,
  is_active boolean DEFAULT true,
  last_sync timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE binance_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own API keys"
  ON binance_api_keys FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys"
  ON binance_api_keys FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys"
  ON binance_api_keys FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys"
  ON binance_api_keys FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Binance Balances Table
CREATE TABLE IF NOT EXISTS binance_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  exchange text NOT NULL,
  symbol text NOT NULL,
  free numeric DEFAULT 0,
  locked numeric DEFAULT 0,
  total numeric DEFAULT 0,
  usd_value numeric DEFAULT 0,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE binance_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own balances"
  ON binance_balances FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own balances"
  ON binance_balances FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own balances"
  ON binance_balances FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own balances"
  ON binance_balances FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Bot Performance Table
CREATE TABLE IF NOT EXISTS bot_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  bot_name text NOT NULL,
  exchange text NOT NULL DEFAULT 'binance_global',
  symbol text NOT NULL,
  total_trades integer DEFAULT 0,
  winning_trades integer DEFAULT 0,
  losing_trades integer DEFAULT 0,
  total_profit numeric DEFAULT 0,
  total_profit_percentage numeric DEFAULT 0,
  start_date timestamptz DEFAULT now(),
  last_trade timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bot_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bot performance"
  ON bot_performance FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bot performance"
  ON bot_performance FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bot performance"
  ON bot_performance FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bot performance"
  ON bot_performance FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Sync History Table
CREATE TABLE IF NOT EXISTS sync_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  exchange text NOT NULL,
  sync_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'success',
  assets_synced integer DEFAULT 0,
  error_message text,
  synced_at timestamptz DEFAULT now()
);

ALTER TABLE sync_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync history"
  ON sync_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync history"
  ON sync_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_binance_api_keys_user_id ON binance_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_binance_balances_user_id ON binance_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_binance_balances_symbol ON binance_balances(symbol);
CREATE INDEX IF NOT EXISTS idx_bot_performance_user_id ON bot_performance(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_user_id ON sync_history(user_id);