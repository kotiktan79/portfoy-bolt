-- TEMETTÜ/KUPON MUHASEBESİ (2026-09-27)
-- Sorun: temettü ödendiğinde hissenin fiyatı düşer (portföy serveti azalır) ve para broker nakit
-- hesabına = cash_balances = KASA'ya geçer. Kasa kâr ölçümünün DIŞINDA olduğu için motor bu olayı
-- ZARAR olarak kaydediyordu. Doğrusu: değer kaybolmadı, portföyden çıktı → AKIŞ (outflow).
-- Bunu yapabilmek için paranın nereye gittiğini bilmek gerekir; kolon o yüzden eklendi.
--   'kasa'   → portföyden çıktı, akış olarak düşülür (kâr etkisi sıfır, para kasada görünür)
--   'portfoy'→ portföyde kaldı (ör. nakit pozisyonuna geçti) → düzeltme YOK, servet zaten aynı
--   NULL     → belirtilmemiş; motor TEMKİNLİ davranır ve düzeltme YAPMAZ (eski davranış).
alter table public.income_records
  add column if not exists destination text
  check (destination is null or destination in ('kasa', 'portfoy'));

comment on column public.income_records.destination is
  'Paranın nereye geldiği: kasa = portföy dışı (akış olarak düşülür) · portfoy = içinde kaldı (düzeltme yok) · NULL = belirtilmemiş, düzeltme yok';
