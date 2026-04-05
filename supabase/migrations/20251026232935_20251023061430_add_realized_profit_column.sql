/*
  # Add realized_profit column to transactions
  
  1. Changes
    - Add `realized_profit` column to transactions table
      - Stores the profit/loss realized from sell transactions
      - NULL for buy transactions
      - Calculated as: (sell_price - average_buy_price) * quantity - fees
  
  2. Notes
    - This column helps track actual profits/losses from completed trades
    - Only applicable to sell transactions
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'realized_profit'
  ) THEN
    ALTER TABLE transactions ADD COLUMN realized_profit numeric(20, 2);
  END IF;
END $$;