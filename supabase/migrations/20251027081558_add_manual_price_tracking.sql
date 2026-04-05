/*
  # Add Manual Price Tracking

  1. Changes
    - Add `manual_price` boolean flag to holdings table
    - Add `manual_price_updated_at` timestamp to track when manual price was set
    - Add `price_notes` text field for price source or notes
    
  2. Purpose
    - Track which holdings have manually set prices
    - Prevent automatic price updates for manual entries
    - Allow users to add notes about price sources
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'holdings' AND column_name = 'manual_price'
  ) THEN
    ALTER TABLE holdings ADD COLUMN manual_price boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'holdings' AND column_name = 'manual_price_updated_at'
  ) THEN
    ALTER TABLE holdings ADD COLUMN manual_price_updated_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'holdings' AND column_name = 'price_notes'
  ) THEN
    ALTER TABLE holdings ADD COLUMN price_notes text;
  END IF;
END $$;