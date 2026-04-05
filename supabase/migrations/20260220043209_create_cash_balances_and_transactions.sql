/*
  # Create cash_balances and cash_transactions tables

  1. New Tables
    - `cash_balances`
      - `id` (uuid, primary key)
      - `user_id` (uuid) - references auth.users
      - `currency` (text) - TRY, USD, EUR, GBP, CHF, RON, RUB
      - `balance` (numeric) - current balance
      - `total_deposits` (numeric)
      - `total_withdrawals` (numeric)
      - `realized_profit` (numeric)
      - `created_at`, `updated_at` (timestamptz)

    - `cash_transactions`
      - `id` (uuid, primary key)
      - `user_id` (uuid)
      - `transaction_type` (text) - deposit, withdrawal, buy, sell, dividend
      - `currency` (text)
      - `amount` (numeric)
      - `balance_before` (numeric)
      - `balance_after` (numeric)
      - `related_holding_id` (uuid, nullable)
      - `notes` (text, nullable)
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on both tables
    - Authenticated users can only access their own rows
*/

CREATE TABLE IF NOT EXISTS cash_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'TRY',
  balance numeric NOT NULL DEFAULT 0,
  total_deposits numeric NOT NULL DEFAULT 0,
  total_withdrawals numeric NOT NULL DEFAULT 0,
  realized_profit numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, currency)
);

CREATE TABLE IF NOT EXISTS cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type text NOT NULL,
  currency text NOT NULL DEFAULT 'TRY',
  amount numeric NOT NULL DEFAULT 0,
  balance_before numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  related_holding_id uuid REFERENCES holdings(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cash_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own cash balances"
  ON cash_balances FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cash balances"
  ON cash_balances FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cash balances"
  ON cash_balances FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own cash balances"
  ON cash_balances FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can select own cash transactions"
  ON cash_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cash transactions"
  ON cash_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own cash transactions"
  ON cash_transactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
