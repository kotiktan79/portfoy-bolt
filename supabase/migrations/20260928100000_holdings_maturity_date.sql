-- TAHVİL VADESİ (2026-09-28)
-- Gerekçe: US900123CJ75 14.04.2026'da itfa oldu ama kayıtta 5,5 ay CANLI durdu (€1.685 hayalet servet).
-- Kimse fark etmedi çünkü sistemde "bu tahvilin vadesi geçti" diyecek bir veri yoktu; tek koruma elle
-- yazılmış bir sembol kontrolüydü (yalnız o tahvili tanıyordu). Artık vade veriye giriyor ve anomali
-- kuralı hem GEÇMİŞ vadeyi hem 30 gün içinde YAKLAŞAN vadeyi kendiliğinden bildiriyor.
alter table public.holdings
  add column if not exists maturity_date date;

comment on column public.holdings.maturity_date is
  'Tahvil/eurobond itfa tarihi. Dolduysa: vade geçmişse "itfa olmuş ama pozisyon açık", 30 gün içindeyse "vade yaklaşıyor" anomalisi üretilir. ETF/hisse için NULL.';
