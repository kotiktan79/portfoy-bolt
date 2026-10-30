// BUGÜN EN ÇOK YÜKSELEN / DÜŞEN — EURO (2026-10-30).
// Eski DailyGainPanel TL ile hesaplıyordu; TL değer kaybı her şeyi şişiriyordu (2c1e5dd ile kaldırıldı).
// Bu sürüm canlı euro kârıyla (liveEurGain) AYNI tabanı kullanır: taban = son kapanış (son snapshot günü
// price_history fiyatı ve o günün kuru). Pozisyon başına:
//   €değişim = adet × (fiyat_şimdi × kur_şimdi / €_şimdi − kapanış × kur_kapanış / €_kapanış)
// TL varlıkta EUR/TL hareketi de değişime dahildir (uygulama kuralı: kur kâra sayılır).
// Nakit döviz/kasa (asset_type 'cash' / 'currency') listeye girmez. Kapanış fiyatı ya da canlı fiyatı olmayan
// pozisyon 'veri yok' olarak işaretlenir; asla tahmini rakam üretilmez.

export interface MoverHolding {
  symbol?: string; asset_type?: string | null; currency?: string | null;
  quantity: number | string | null; current_price?: number | string | null;
}

export interface DailyMover {
  symbol: string;
  assetType: string;
  /** null → veri yok (kapanış/canlı fiyat ya da kur eksik, ya da şüpheli sıçrama) */
  eurDelta: number | null;
  /** varlığın kendi para birimindeki fiyat değişimi % */
  pricePct: number | null;
  /** €değişimin kur payı (fiyat sabitken kurun etkisi) */
  fxEUR: number | null;
  valueEUR: number | null;
  reason?: 'kapanis-yok' | 'fiyat-yok' | 'kur-yok' | 'supheli';
}

export interface DailyMoversInput {
  holdings: MoverHolding[];
  closePrices: Map<string, number> | null | undefined;
  /** birim → TL kuru (TRY=1). Şimdi ve kapanış anı. */
  rateNow: (ccy: string) => number | null;
  rateClose: (ccy: string) => number | null;
  eurNow: number; eurClose: number;
}

/** Tek günde bundan büyük fiyat sıçraması bayat/bozuk veri sayılır (eski panelle aynı eşik). */
export const MAX_DAILY_MOVE_PCT = 25;

export function isExcludedFromMovers(h: MoverHolding): boolean {
  const t = String(h.asset_type || '').toLowerCase();
  return t === 'cash' || t === 'currency' || !(Number(h.quantity) || 0);
}

export function computeDailyMovers(inp: DailyMoversInput): DailyMover[] {
  const out: DailyMover[] = [];
  for (const h of inp.holdings) {
    if (isExcludedFromMovers(h)) continue;
    const symbol = String(h.symbol || ''); if (!symbol) continue;
    const assetType = String(h.asset_type || 'other');
    const ccy = String(h.currency || 'TRY').toUpperCase();
    const q = Number(h.quantity) || 0;
    const cp = Number(h.current_price) || 0;
    const p0 = inp.closePrices?.get(symbol);
    const fNow = ccy === 'TRY' ? 1 : inp.rateNow(ccy);
    const fThen = ccy === 'TRY' ? 1 : inp.rateClose(ccy);
    const okEur = inp.eurNow > 0 && inp.eurClose > 0;
    const valueEUR = cp > 0 && fNow && okEur ? (q * cp * fNow) / inp.eurNow : null;
    const none = (reason: DailyMover['reason']): DailyMover => ({ symbol, assetType, eurDelta: null, pricePct: null, fxEUR: null, valueEUR, reason });
    if (!(cp > 0)) { out.push(none('fiyat-yok')); continue; }
    if (p0 === undefined || !Number.isFinite(p0) || !(p0 > 0)) { out.push(none('kapanis-yok')); continue; }
    if (!fNow || !fThen || !okEur) { out.push(none('kur-yok')); continue; }
    const pricePct = (cp / p0 - 1) * 100;
    if (Math.abs(pricePct) > MAX_DAILY_MOVE_PCT) { out.push(none('supheli')); continue; }
    const eurDelta = q * (cp * fNow / inp.eurNow - p0 * fThen / inp.eurClose);
    const fxEUR = q * p0 * (fNow / inp.eurNow - fThen / inp.eurClose);
    out.push({ symbol, assetType, eurDelta, pricePct, fxEUR, valueEUR });
  }
  return out;
}

export interface MoversSummary {
  gainers: DailyMover[];   // en çok yükselen (€), en fazla n
  losers: DailyMover[];    // en çok düşen (€), en fazla n
  totalEUR: number;        // verisi olan pozisyonların toplamı
  counted: number;
  noData: DailyMover[];
}

export function summarizeMovers(movers: DailyMover[], n = 3): MoversSummary {
  const ok = movers.filter(m => m.eurDelta !== null) as Array<DailyMover & { eurDelta: number }>;
  const gainers = ok.filter(m => m.eurDelta >= 0.5).sort((a, b) => b.eurDelta - a.eurDelta).slice(0, n);
  const losers = ok.filter(m => m.eurDelta <= -0.5).sort((a, b) => a.eurDelta - b.eurDelta).slice(0, n);
  return {
    gainers, losers,
    totalEUR: ok.reduce((s, m) => s + m.eurDelta, 0),
    counted: ok.length,
    noData: movers.filter(m => m.eurDelta === null),
  };
}

/** Portföy payı % (taban = kapanış serveti). Taban yoksa null. */
export function shareOfPortfolioPct(eur: number, baseEUR: number | null | undefined): number | null {
  return baseEUR && baseEUR > 0 ? (eur / baseEUR) * 100 : null;
}
