/*
  # Convert Existing TRY Prices to Correct Currency

  1. Purpose
    - Existing holdings have TRY-based prices but now have USD/EUR currency
    - Need to convert these prices to their actual currency values
    - Only affects holdings added before currency support

  2. Strategy
    - Use approximate exchange rate at time of entry (conservative estimate)
    - Crypto: TRY price / 34.5 = USD price
    - Commodity (Gold): TRY price / 34.5 = USD price  
    - Eurobond: TRY price / 34.5 = USD price
    - EUR currency: TRY price / 37.2 = EUR price

  3. Safety
    - Only update non-TRY currency holdings
    - Keep original values in case of rollback needed
*/

-- Create backup of original prices (just in case)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'holdings' AND column_name = 'original_try_price') THEN
    ALTER TABLE holdings ADD COLUMN original_try_price numeric(20, 4);
    ALTER TABLE holdings ADD COLUMN original_try_current_price numeric(20, 4);
  END IF;
END $$;

-- Backup original TRY prices for crypto
UPDATE holdings
SET 
  original_try_price = purchase_price,
  original_try_current_price = current_price
WHERE asset_type = 'crypto' AND currency = 'USD' AND original_try_price IS NULL;

-- Convert crypto prices from TRY to USD (using average rate 34.5)
UPDATE holdings
SET 
  purchase_price = purchase_price / 34.5,
  current_price = current_price / 34.5
WHERE asset_type = 'crypto' AND currency = 'USD' AND purchase_price > 100;

-- Backup and convert commodity prices
UPDATE holdings
SET 
  original_try_price = purchase_price,
  original_try_current_price = current_price
WHERE asset_type = 'commodity' AND currency = 'USD' AND original_try_price IS NULL;

UPDATE holdings
SET 
  purchase_price = purchase_price / 34.5,
  current_price = current_price / 34.5
WHERE asset_type = 'commodity' AND currency = 'USD' AND purchase_price > 100;

-- Backup and convert eurobond prices  
UPDATE holdings
SET 
  original_try_price = purchase_price,
  original_try_current_price = current_price
WHERE asset_type = 'eurobond' AND currency = 'USD' AND original_try_price IS NULL;

UPDATE holdings
SET 
  purchase_price = purchase_price / 34.5,
  current_price = current_price / 34.5
WHERE asset_type = 'eurobond' AND currency = 'USD' AND purchase_price > 1000;

-- Convert EUR currency from TRY to EUR
UPDATE holdings
SET 
  original_try_price = purchase_price,
  original_try_current_price = current_price
WHERE asset_type = 'currency' AND currency = 'EUR' AND original_try_price IS NULL;

UPDATE holdings
SET 
  purchase_price = purchase_price / 37.2,
  current_price = current_price / 37.2
WHERE asset_type = 'currency' AND currency = 'EUR' AND purchase_price > 10;

-- Convert USD currency (already should be small, but double check)
UPDATE holdings
SET 
  original_try_price = purchase_price,
  original_try_current_price = current_price
WHERE asset_type = 'currency' AND currency = 'USD' AND symbol = 'USD' AND original_try_price IS NULL;

UPDATE holdings
SET 
  purchase_price = 1.0,
  current_price = 1.0
WHERE asset_type = 'currency' AND currency = 'USD' AND symbol = 'USD' AND purchase_price > 10;
