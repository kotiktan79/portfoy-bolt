/*
  # Add Monthly Withdrawals Tracking

  1. New Tables
    - `monthly_withdrawals`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `year` (integer, withdrawal year)
      - `month` (integer, withdrawal month 1-12)
      - `amount` (numeric, withdrawn amount)
      - `withdrawal_date` (timestamptz, when withdrawal happened)
      - `holding_id` (uuid, references holdings)
      - `symbol` (text, asset symbol)
      - `quantity` (numeric, quantity withdrawn)
      - `notes` (text, optional notes)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `monthly_withdrawals` table
    - Add policies for authenticated users to manage their own withdrawals

  3. Indexes
    - Index on (user_id, year, month) for fast monthly queries
*/

CREATE TABLE IF NOT EXISTS monthly_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  amount numeric NOT NULL,
  withdrawal_date timestamptz DEFAULT now(),
  holding_id uuid REFERENCES holdings(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  quantity numeric NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE monthly_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own withdrawals"
  ON monthly_withdrawals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own withdrawals"
  ON monthly_withdrawals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own withdrawals"
  ON monthly_withdrawals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own withdrawals"
  ON monthly_withdrawals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_monthly_withdrawals_user_date 
  ON monthly_withdrawals(user_id, year, month);

CREATE INDEX IF NOT EXISTS idx_monthly_withdrawals_holding 
  ON monthly_withdrawals(holding_id);
