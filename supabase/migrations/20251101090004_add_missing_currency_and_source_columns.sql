/*
  # Add Missing Columns to Tables

  1. Changes to `exchange_rates` table
    - Add `source` column (text) - Source of the exchange rate (api, manual, etc)
  
  2. Changes to `holdings` table
    - Add `currency` column (text) - Currency of the holding price
    - Add `purchase_currency` column (text) - Currency of the purchase price

  3. Notes
    - Using IF NOT EXISTS pattern for safe migrations
    - Setting default values for existing data
*/

-- Add source column to exchange_rates if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exchange_rates' AND column_name = 'source'
  ) THEN
    ALTER TABLE exchange_rates ADD COLUMN source text DEFAULT 'api';
  END IF;
END $$;

-- Add currency column to holdings if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'holdings' AND column_name = 'currency'
  ) THEN
    ALTER TABLE holdings ADD COLUMN currency text DEFAULT 'TRY';
  END IF;
END $$;

-- Add purchase_currency column to holdings if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'holdings' AND column_name = 'purchase_currency'
  ) THEN
    ALTER TABLE holdings ADD COLUMN purchase_currency text DEFAULT 'TRY';
  END IF;
END $$;