/*
  # Advanced Portfolio Features Migration
  
  1. New Tables
    - `stop_loss_take_profit`: Automated trading rules
      - `id` (uuid, primary key)
      - `holding_id` (uuid, foreign key to holdings)
      - `rule_type` (text: 'stop_loss' or 'take_profit')
      - `trigger_price` (numeric)
      - `trigger_percent` (numeric, optional percentage-based trigger)
      - `is_active` (boolean)
      - `notify_only` (boolean, if true only notify, don't auto-sell)
      - `notes` (text)
      - `triggered_at` (timestamptz)
      - `created_at` (timestamptz)
    
    - `rebalancing_rules`: Automated portfolio rebalancing
      - `id` (uuid, primary key)
      - `portfolio_id` (uuid, foreign key)
      - `rule_name` (text)
      - `target_allocations` (jsonb, asset_type: percentage pairs)
      - `threshold_percent` (numeric, rebalance when drift exceeds this)
      - `schedule_type` (text: 'manual', 'daily', 'weekly', 'monthly', 'quarterly')
      - `next_run_at` (timestamptz)
      - `last_run_at` (timestamptz)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
    
    - `dca_strategies`: Dollar Cost Averaging automation
      - `id` (uuid, primary key)
      - `portfolio_id` (uuid, foreign key)
      - `symbol` (text)
      - `asset_type` (text)
      - `amount_per_period` (numeric)
      - `frequency` (text: 'daily', 'weekly', 'biweekly', 'monthly')
      - `next_purchase_date` (date)
      - `is_active` (boolean)
      - `start_date` (date)
      - `end_date` (date, optional)
      - `created_at` (timestamptz)
    
    - `notification_settings`: User notification preferences
      - `id` (uuid, primary key)
      - `notification_type` (text: 'telegram', 'discord', 'email')
      - `config` (jsonb, stores API keys/webhooks/chat IDs)
      - `enabled` (boolean)
      - `events` (jsonb array, which events to notify: price_alert, stop_loss, take_profit, rebalance, etc.)
      - `created_at` (timestamptz)
    
    - `audit_logs`: Complete activity tracking
      - `id` (uuid, primary key)
      - `action_type` (text: 'buy', 'sell', 'price_update', 'rebalance', 'stop_loss_trigger', etc.)
      - `entity_type` (text: 'holding', 'portfolio', 'transaction', etc.)
      - `entity_id` (uuid)
      - `old_data` (jsonb)
      - `new_data` (jsonb)
      - `ip_address` (text)
      - `user_agent` (text)
      - `created_at` (timestamptz)
    
    - `backups`: Automatic backup tracking
      - `id` (uuid, primary key)
      - `backup_type` (text: 'automatic', 'manual')
      - `data` (jsonb, complete portfolio snapshot)
      - `size_bytes` (bigint)
      - `created_at` (timestamptz)
  
  2. Portfolio Enhancements
    - Add `user_id` to portfolios for multi-user support
    - Add `currency` (default TRY)
    - Add `strategy_type` (text: 'growth', 'income', 'balanced', 'custom')
    - Add `risk_tolerance` (text: 'conservative', 'moderate', 'aggressive')
    - Add `target_return_percent` (numeric)
  
  3. Security
    - Enable RLS on all new tables
    - Add policies for anonymous and authenticated access
  
  4. Indexes
    - Performance indexes for frequent queries
*/

-- Add new columns to portfolios table
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS currency text DEFAULT 'TRY';
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS strategy_type text DEFAULT 'balanced';
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS risk_tolerance text DEFAULT 'moderate';
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS target_return_percent numeric DEFAULT 0;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Stop Loss / Take Profit table
CREATE TABLE IF NOT EXISTS stop_loss_take_profit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid REFERENCES holdings(id) ON DELETE CASCADE,
  rule_type text NOT NULL CHECK (rule_type IN ('stop_loss', 'take_profit')),
  trigger_price numeric(20, 4),
  trigger_percent numeric(10, 2),
  is_active boolean DEFAULT true,
  notify_only boolean DEFAULT false,
  notes text,
  triggered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sl_tp_holding ON stop_loss_take_profit(holding_id);
CREATE INDEX IF NOT EXISTS idx_sl_tp_active ON stop_loss_take_profit(is_active) WHERE is_active = true;

ALTER TABLE stop_loss_take_profit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations on stop_loss_take_profit" 
  ON stop_loss_take_profit FOR ALL TO anon, authenticated 
  USING (true) WITH CHECK (true);

-- Rebalancing Rules table
CREATE TABLE IF NOT EXISTS rebalancing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid REFERENCES portfolios(id) ON DELETE CASCADE,
  rule_name text NOT NULL,
  target_allocations jsonb NOT NULL,
  threshold_percent numeric(5, 2) DEFAULT 5.0,
  schedule_type text DEFAULT 'manual' CHECK (schedule_type IN ('manual', 'daily', 'weekly', 'monthly', 'quarterly')),
  next_run_at timestamptz,
  last_run_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rebalance_portfolio ON rebalancing_rules(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_rebalance_active ON rebalancing_rules(is_active) WHERE is_active = true;

ALTER TABLE rebalancing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations on rebalancing_rules" 
  ON rebalancing_rules FOR ALL TO anon, authenticated 
  USING (true) WITH CHECK (true);

-- DCA Strategies table
CREATE TABLE IF NOT EXISTS dca_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  asset_type text NOT NULL,
  amount_per_period numeric(20, 2) NOT NULL,
  frequency text DEFAULT 'monthly' CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  next_purchase_date date NOT NULL,
  is_active boolean DEFAULT true,
  start_date date DEFAULT CURRENT_DATE,
  end_date date,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dca_portfolio ON dca_strategies(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_dca_next_date ON dca_strategies(next_purchase_date) WHERE is_active = true;

ALTER TABLE dca_strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations on dca_strategies" 
  ON dca_strategies FOR ALL TO anon, authenticated 
  USING (true) WITH CHECK (true);

-- Notification Settings table
CREATE TABLE IF NOT EXISTS notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text NOT NULL CHECK (notification_type IN ('telegram', 'discord', 'email', 'push')),
  config jsonb NOT NULL DEFAULT '{}',
  enabled boolean DEFAULT true,
  events jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_type ON notification_settings(notification_type);
CREATE INDEX IF NOT EXISTS idx_notif_enabled ON notification_settings(enabled) WHERE enabled = true;

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations on notification_settings" 
  ON notification_settings FOR ALL TO anon, authenticated 
  USING (true) WITH CHECK (true);

-- Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations on audit_logs" 
  ON audit_logs FOR ALL TO anon, authenticated 
  USING (true) WITH CHECK (true);

-- Backups table
CREATE TABLE IF NOT EXISTS backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type text DEFAULT 'automatic' CHECK (backup_type IN ('automatic', 'manual')),
  data jsonb NOT NULL,
  size_bytes bigint,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backup_created ON backups(created_at DESC);

ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations on backups" 
  ON backups FOR ALL TO anon, authenticated 
  USING (true) WITH CHECK (true);