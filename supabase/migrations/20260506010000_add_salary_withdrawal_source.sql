-- Çekim kaynağı bilgisi: hangi pozisyondan ne kadar düşüldü
ALTER TABLE salary_withdrawals
  ADD COLUMN IF NOT EXISTS source_symbol text,
  ADD COLUMN IF NOT EXISTS source_quantity_deducted numeric(14,4);
