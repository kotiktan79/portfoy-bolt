/*
  # Add Premium Features Schema

  1. New Tables
    - `user_preferences`
      - `id` (uuid, primary key)
      - `user_id` (text)
      - `theme` (text) - Theme preference
      - `language` (text) - Language preference
      - `email_alerts` (boolean) - Email alerts enabled
      - `notification_settings` (jsonb) - Notification preferences
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `email_alerts`
      - `id` (uuid, primary key)
      - `user_id` (text)
      - `email` (text)
      - `alert_type` (text) - 'price', 'pnl', 'daily_summary'
      - `frequency` (text) - 'immediate', 'daily', 'weekly'
      - `enabled` (boolean)
      - `created_at` (timestamp)

    - `ai_suggestions`
      - `id` (uuid, primary key)
      - `user_id` (text)
      - `suggestion_type` (text)
      - `title` (text)
      - `description` (text)
      - `priority` (text)
      - `status` (text) - 'active', 'dismissed', 'completed'
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users
*/

CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'default',
  theme text DEFAULT 'light',
  language text DEFAULT 'tr',
  email_alerts boolean DEFAULT false,
  notification_settings jsonb DEFAULT '{
    "priceAlerts": true,
    "pnlUpdates": true,
    "achievements": true,
    "dailySummary": false
  }'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS email_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'default',
  email text NOT NULL,
  alert_type text DEFAULT 'price',
  frequency text DEFAULT 'immediate',
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'default',
  suggestion_type text NOT NULL,
  title text NOT NULL,
  description text,
  priority text DEFAULT 'medium',
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_alerts_user ON email_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_user ON ai_suggestions(user_id, status);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences"
  ON user_preferences
  FOR ALL
  TO authenticated
  USING (user_id = current_user);

CREATE POLICY "Public can read own preferences"
  ON user_preferences
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can manage own email alerts"
  ON email_alerts
  FOR ALL
  TO authenticated
  USING (user_id = current_user);

CREATE POLICY "Users can view own suggestions"
  ON ai_suggestions
  FOR SELECT
  TO authenticated
  USING (user_id = current_user);

CREATE POLICY "System can insert suggestions"
  ON ai_suggestions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
