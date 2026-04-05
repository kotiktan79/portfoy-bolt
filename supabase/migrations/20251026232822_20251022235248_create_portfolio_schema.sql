/*
  # Portfolio Tracking System

  1. New Tables
    - `holdings`
      - `id` (uuid, primary key) - Unique identifier for each holding
      - `symbol` (text) - Asset symbol/ticker (e.g., AKSEN, BTC, USD)
      - `asset_type` (text) - Type of asset (stock, crypto, currency, fund, eurobond, commodity)
      - `purchase_price` (numeric) - Price at which asset was purchased
      - `quantity` (numeric) - Amount of asset held
      - `current_price` (numeric) - Current market price
      - `created_at` (timestamptz) - Timestamp of record creation
      - `updated_at` (timestamptz) - Timestamp of last update

  2. Security
    - Enable RLS on `holdings` table
    - Since this is a personal portfolio tracker, we'll allow all operations for now
    - In production, this would be restricted to authenticated users only

  3. Indexes
    - Index on symbol for faster lookups
    - Index on asset_type for filtering by type
*/

CREATE TABLE IF NOT EXISTS holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  asset_type text NOT NULL,
  purchase_price numeric(20, 4) NOT NULL,
  quantity numeric(20, 8) NOT NULL,
  current_price numeric(20, 4) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON holdings(symbol);
CREATE INDEX IF NOT EXISTS idx_holdings_asset_type ON holdings(asset_type);

-- Enable RLS
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;

-- Allow all operations (for single-user portfolio)
CREATE POLICY "Allow all operations on holdings"
  ON holdings
  FOR ALL
  USING (true)
  WITH CHECK (true);