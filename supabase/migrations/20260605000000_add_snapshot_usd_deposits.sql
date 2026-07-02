/*
  # Add USD-denominated deposits/withdrawals to portfolio snapshots

  1. Changes
    - Add `total_deposits_usd` — cumulative deposits valued in USD AT SNAPSHOT TIME
    - Add `total_withdrawals_usd` — cumulative withdrawals valued in USD AT SNAPSHOT TIME

  2. Purpose
    - The existing `total_deposits` (TRY) is re-valued at each day's FX rate. Taking
      the TRY delta between two snapshots and converting at TODAY's rate produces
      phantom "deposits" when TRY depreciates (no new money, yet delta > 0), which
      distorts the Kâr Cüzdanı reservoir (principal vs profit split).
    - Storing the USD value captured at snapshot time makes the cross-snapshot delta
      a clean "real new money in USD" figure, stable across TRY moves.

  3. Notes
    - Existing snapshots have NULL — consumers must fall back to the legacy TRY path
      when either endpoint is NULL.
    - Future snapshots populate these from cash_balances at write time (daily-snapshot.ts).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'portfolio_snapshots' AND column_name = 'total_deposits_usd'
  ) THEN
    ALTER TABLE portfolio_snapshots ADD COLUMN total_deposits_usd numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'portfolio_snapshots' AND column_name = 'total_withdrawals_usd'
  ) THEN
    ALTER TABLE portfolio_snapshots ADD COLUMN total_withdrawals_usd numeric;
  END IF;
END $$;
