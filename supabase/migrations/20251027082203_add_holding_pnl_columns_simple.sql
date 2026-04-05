/*
  # Add Holding-Level PnL Columns

  1. Changes
    - Add cost_basis column for tracking average cost
    - Add unrealized_pnl for current profit/loss
    - Add unrealized_pnl_percent for percentage gain/loss
    - Add total_realized_pnl for completed trades profit

  2. Purpose
    - Track detailed PnL at holding level
    - Enable accurate profit/loss calculations
*/

ALTER TABLE holdings 
  ADD COLUMN IF NOT EXISTS cost_basis numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unrealized_pnl numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unrealized_pnl_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_realized_pnl numeric DEFAULT 0;