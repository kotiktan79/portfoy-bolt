/*
  # Add Deposits and Withdrawals Tracking to Portfolio Snapshots

  1. Changes
    - Add `total_deposits` column to track cumulative deposits up to snapshot date
    - Add `total_withdrawals` column to track cumulative withdrawals up to snapshot date
    
  2. Purpose
    - Enable accurate PnL calculation that excludes the effect of deposits/withdrawals
    - Distinguish between portfolio performance and cash flow effects
    - Formula: Adjusted PnL = (current_value + withdrawals - deposits) - (previous_value + previous_withdrawals - previous_deposits)
    
  3. Notes
    - Existing snapshots will have NULL values, which will be treated as 0
    - Future snapshots should include these values from cash_balances table
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'portfolio_snapshots' AND column_name = 'total_deposits'
  ) THEN
    ALTER TABLE portfolio_snapshots ADD COLUMN total_deposits numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'portfolio_snapshots' AND column_name = 'total_withdrawals'
  ) THEN
    ALTER TABLE portfolio_snapshots ADD COLUMN total_withdrawals numeric DEFAULT 0;
  END IF;
END $$;
