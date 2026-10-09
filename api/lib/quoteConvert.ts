// KOTASYON PARA BİRİMİ ÇEVRİMİ — 2026-10-09
//
// Tetikleyen olay: XEON (Xtrackers II EUR Overnight Rate Swap) alındı. Eurobond fiyat yolu
// "Yahoo her zaman USD döner" varsayımıyla yazılmıştı ve USD→EUR çevrimi uyguluyordu.
// XEON Xetra'da (XEON.DE) ZATEN EURO kote; o çevrim uygulanırsa fiyat ~%11 EKSİK yazılır.
// Artık kaynağın kendi bildirdiği para birimi kullanılıyor, varsayım yok.
//
// Kur bilinmiyorsa null döner — sabit yedek kur YASAK (bkz. feedback_portfoy_no_hardcoded_fx_fallback).

/** Para biriminin TL karşılığı. TRY her zaman 1. Bilinmiyorsa null. */
export type RatesToTRY = { USD: number | null; EUR: number | null };

export function rateToTRY(ccy: string, rates: RatesToTRY): number | null {
  const c = (ccy || '').toUpperCase();
  if (c === 'TRY' || c === 'TRL') return 1;
  if (c === 'USD') return rates.USD && rates.USD > 0 ? rates.USD : null;
  if (c === 'EUR') return rates.EUR && rates.EUR > 0 ? rates.EUR : null;
  return null;                                   // GBp/CHF vb.: bilinmiyor → fiyat yazılmaz
}

/**
 * Kaynağın verdiği fiyatı, pozisyonun para birimine çevirir.
 * Aynı birimse çevrim YOK (XEON hatasının kökü buydu).
 * Gerekli kur yoksa null → çağıran taraf fiyatı YAZMAZ.
 */
export function convertQuote(
  price: number, quoteCcy: string, holdingCcy: string, rates: RatesToTRY,
): number | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  const q = (quoteCcy || '').toUpperCase(), h = (holdingCcy || '').toUpperCase();
  if (!q || !h) return null;
  if (q === h) return price;                     // çevrim gerekmez
  const rq = rateToTRY(q, rates), rh = rateToTRY(h, rates);
  if (rq == null || rh == null) return null;
  return (price * rq) / rh;
}

/** Yahoo sembolünün kote para birimi — kaynak bildirmezse son çare olarak borsa ekine bakılır. */
export function guessQuoteCcy(symbol: string): string | null {
  const s = (symbol || '').toUpperCase();
  if (s.endsWith('.DE') || s.endsWith('.PA') || s.endsWith('.AS') || s.endsWith('.MI') || s.endsWith('.MC')) return 'EUR';
  if (s.endsWith('.IS')) return 'TRY';
  if (s.endsWith('.L')) return null;             // Londra'da hem USD hem GBp kote var → TAHMİN ETME
  if (!s.includes('.')) return 'USD';            // ABD borsası
  return null;
}
