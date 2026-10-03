// FİYAT YAZMA KAPISI — 2026-10-03
//
// Bozuk bir kaynak tek satır yazdığında sahte kâr/zarar üretiyor. İki olay:
//   1) 2026-09-24: kur satırına 51/44 gibi rakam yazıldı → on binlerce euro sahte kâr, maaş havuzuna girdi.
//   2) 2026-10-03: altın 5.213 TL/gram yazıldı (gerçek 6.579,57) → ekranda −%20,8, portföy −€3.687.
//
// Kural kaynakta değil YAZMA KAPISINDA durur: kaynak değişse, yenisi eklense de kural ayakta kalır.
// Bant dışı fiyat DB'ye yazılmaz; ekran bayat-ama-gerçek fiyatı gösterir.
//
// Bant sadece gerçekten oynamayan sınıflara konur:
//   currency  %5  — kur günde %5 oynamaz
//   commodity %10 — fiziki altın/gümüş günde %10 oynamaz
// Hisse/kripto/fon BANTSIZ: onlar gerçekten %20 oynayabilir, bant gerçek hareketi bastırır.

export const PRICE_BANDS: Record<string, number> = { currency: 0.05, commodity: 0.10 };

export interface PriceGuardVerdict { blocked: boolean; band?: number; deviation?: number }

/**
 * Yeni fiyat DB'ye yazılabilir mi? Bant yoksa, eski fiyat yoksa veya yeni fiyat yoksa
 * karar verilmez (blocked=false) — "bilmiyorum" ile "bant dışı" karıştırılmaz.
 */
export function priceWriteGuard(assetType: string, oldPrice: number, newPrice: number | null | undefined): PriceGuardVerdict {
  const band = PRICE_BANDS[assetType];
  if (band === undefined) return { blocked: false };
  if (!newPrice || !Number.isFinite(newPrice) || newPrice <= 0) return { blocked: false };
  if (!Number.isFinite(oldPrice) || oldPrice <= 0) return { blocked: false };   // ilk fiyat: kıyas yok
  const deviation = Math.abs(newPrice / oldPrice - 1);
  // EPS: 110/100 - 1 = 0.10000000000000009 → tam bant sınırı float yüzünden bloke oluyordu.
  const EPS = 1e-9;
  return deviation > band + EPS ? { blocked: true, band, deviation } : { blocked: false, band, deviation };
}
