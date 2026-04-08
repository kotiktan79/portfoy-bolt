-- Fix: portfolio_snapshots tablosunda snapshot_date UNIQUE constraint eksik
-- Bu migration duplicate kayıtları temizler ve constraint ekler

-- 1. Duplicate'ları temizle (en son eklenen kaydı koru)
DELETE FROM portfolio_snapshots
WHERE id NOT IN (
  SELECT DISTINCT ON (snapshot_date) id
  FROM portfolio_snapshots
  ORDER BY snapshot_date, id DESC
);

-- 2. UNIQUE constraint ekle (yoksa)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'portfolio_snapshots_snapshot_date_key'
  ) THEN
    ALTER TABLE portfolio_snapshots
    ADD CONSTRAINT portfolio_snapshots_snapshot_date_key UNIQUE (snapshot_date);
  END IF;
END $$;
