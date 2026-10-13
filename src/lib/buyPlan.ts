// ESNEK ALIM PLANI — sabit haftalık takvim yok (2026-10-13).
// Kullanıcı parayı kendi zamanında yatırır. Plan yalnız oranı, kalanı ve hızı gösterir.
// VWCE %76 / V3YL %16 / XEON %8. Hedef €52.000, 31 Mart 2027.

export const BUY_PLAN_START = '2026-10-13';
export const BUY_TARGET_EUR = 52_000;
export const BUY_TARGET_DATE = '2027-03-31';

export const BUY_WEIGHTS = { VWCE: 0.76, V3YL: 0.16, XEON: 0.08 } as const;
export type BuySymbol = keyof typeof BUY_WEIGHTS;

export const BUY_INSTRUMENTS: Record<BuySymbol, { label: string; isin?: string; venue: string; yahoo: string }> = {
  VWCE: { label: 'Küresel hisse ETF', isin: 'IE00BK5BQT80', venue: 'Xetra', yahoo: 'VWCE.DE' },
  V3YL: { label: 'Kuzey Amerika hisse ETF', venue: 'Xetra', yahoo: 'V3YL.DE' },
  XEON: { label: 'Para piyasası', venue: 'Xetra', yahoo: 'XEON.DE' },
};

export interface BuySplit {
  VWCE: number;
  V3YL: number;
  XEON: number;
  dipped: boolean;
}

/** Girilen tutarı 76/16/8 böler. VWCE son 7 günde %10'dan fazla düştüyse XEON diliminin yarısı VWCE'ye eklenir. */
export function splitBuy(amountEUR: number, vwceDropPct?: number | null): BuySplit {
  const a = Math.max(0, Number(amountEUR) || 0);
  let vwce = a * BUY_WEIGHTS.VWCE;
  const v3yl = a * BUY_WEIGHTS.V3YL;
  let xeon = a * BUY_WEIGHTS.XEON;
  const dipped = vwceDropPct != null && Number.isFinite(vwceDropPct) && vwceDropPct <= -10;
  if (dipped) {
    const half = xeon / 2;
    xeon -= half;
    vwce += half;
  }
  return { VWCE: vwce, V3YL: v3yl, XEON: xeon, dipped };
}

export function priceDropPct(oldPrice: number, newPrice: number): number | null {
  if (!(oldPrice > 0) || !(newPrice > 0)) return null;
  return (newPrice / oldPrice - 1) * 100;
}

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375;

export function monthsUntil(today: Date, targetISO = BUY_TARGET_DATE): number {
  const target = new Date(targetISO + 'T00:00:00Z');
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, (target.getTime() - t) / MS_PER_MONTH);
}

export interface BuyPace {
  monthsLeft: number;
  perMonthEUR: number;
  pastDue: boolean;
}

/** Kalan tutar / kalan ay. Tarihi geçtiyse uyarı değil, nazik bilgi (pastDue). */
export function pacePerMonth(remainingEUR: number, today: Date, targetISO = BUY_TARGET_DATE): BuyPace {
  const left = Math.max(0, Number(remainingEUR) || 0);
  const monthsLeft = monthsUntil(today, targetISO);
  const pastDue = monthsLeft <= 0 && left > 0;
  const perMonthEUR = monthsLeft > 0.05 ? left / monthsLeft : left;
  return { monthsLeft, perMonthEUR, pastDue };
}

export function sumInvestedEUR(
  buys: Array<{ symbol: string; amountEUR: number; date: string }>,
  start = BUY_PLAN_START,
): number {
  const ok = new Set<string>(Object.keys(BUY_WEIGHTS));
  let s = 0;
  for (const b of buys) {
    if (!ok.has(String(b.symbol || '').toUpperCase())) continue;
    if (String(b.date || '').slice(0, 10) < start) continue;
    s += Math.max(0, Number(b.amountEUR) || 0);
  }
  return s;
}

export function buyProgress(investedEUR: number, target = BUY_TARGET_EUR): { investedEUR: number; remainingEUR: number; pct: number } {
  const invested = Math.max(0, Number(investedEUR) || 0);
  const remaining = Math.max(0, target - invested);
  const pct = target > 0 ? Math.min(100, (invested / target) * 100) : 0;
  return { investedEUR: invested, remainingEUR: remaining, pct };
}

/** Kaynak sırası: önce EURO nakit, sonra USD → EUR. */
export function fundingHint(euroCashEUR: number, usdCashEUR: number): string {
  const euro = Math.max(0, Number(euroCashEUR) || 0);
  const usd = Math.max(0, Number(usdCashEUR) || 0);
  const euroTxt = euro >= 1 ? `önce EURO nakit (€${Math.round(euro).toLocaleString('de-DE')})` : 'EURO nakit görünmüyor';
  const usdTxt = usd >= 1 ? `sonra USD → EUR (€${Math.round(usd).toLocaleString('de-DE')} karşılığı)` : 'USD nakit yok';
  return `${euroTxt}, ${usdTxt}.`;
}
