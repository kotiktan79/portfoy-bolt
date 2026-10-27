// HAFTALIK ALIM PLANI — 2026-10-27.
// Her hafta EUR nakitten sabit €1.000, tamamı VWCE.
// V3YL ve XEON'daki mevcut pay durur; yeni alım yok.
// XEON'a ancak güvenli taraf hedefin (%14) altına inerse dönülür.
// €7.000 EUR nakit kenarda kalır, plana girmez.
// Ekran, günlük plan, rapor ve AI aynı fonksiyonu okur. Bu oran bir tablo satırı değildir.

import { TARGET_ALLOCATION } from '../config/portfolioPolicy.js';

export const WEEKLY_BUY_EUR = 1_000;
export const EUR_CASH_RESERVE = 7_000;
/** Güvenli taraf hedefi. portfolioPolicy.TARGET_ALLOCATION.safe.target ile aynı sayı; test kilitler. */
export const SAFE_TARGET_PCT = TARGET_ALLOCATION.safe.target;

export const BUY_INSTRUMENTS = {
  VWCE: { label: 'Küresel hisse ETF', isin: 'IE00BK5BQT80', venue: 'Xetra', yahoo: 'VWCE.DE' },
  V3YL: { label: 'Kuzey Amerika hisse ETF', venue: 'Xetra', yahoo: 'V3YL.DE' },
  XEON: { label: 'Para piyasası', venue: 'Xetra', yahoo: 'XEON.DE' },
} as const;

export type WeeklySymbol = 'VWCE' | 'XEON';

export interface WeeklyPlan {
  weeklyEUR: number;
  reserveEUR: number;
  euroCashEUR: number;
  /** EUR nakit − kenarda kalan. Eksi olmaz. */
  investableEUR: number;
  /** investableEUR / haftalık dilim. Yarım haftadan kısaysa metin "1 haftadan az" der. */
  weeks: number;
  destination: WeeklySymbol;
  safePct: number | null;
  safeTargetPct: number;
  safeShort: boolean;
  /** Kartın gösterdiği VWCE tutarı. Plan €1.000'in tamamıdır. */
  vwceEUR: number;
  priceEUR: number | null;
  /** €1.000 / güncel VWCE fiyatı. Fiyat yoksa null. */
  units: number | null;
}

type CashRow = {
  symbol?: string | null;
  asset_type?: string | null;
  currency?: string | null;
  quantity?: number | string | null;
  current_price?: number | string | null;
};

/**
 * EURO / EUR nakit satırının euro adedi.
 * Canlı kayıt: currency TRY, current_price = EUR/TRY, quantity = euro adedi.
 * currency EUR ve fiyat 1 civarıysa tutar adet × fiyattır.
 */
export function euroCashEUR(rows: CashRow[]): number {
  let sum = 0;
  for (const h of rows) {
    if (String(h.asset_type || '') !== 'currency') continue;
    const sym = String(h.symbol || '').toUpperCase();
    if (sym !== 'EURO' && sym !== 'EUR') continue;
    const qty = Number(h.quantity);
    const price = Number(h.current_price);
    if (!(qty > 0)) continue;
    const cur = String(h.currency || 'TRY').toUpperCase();
    if (cur === 'EUR' && price > 0 && price <= 5) sum += qty * price;
    else sum += qty;
  }
  return sum;
}

/** Açık VWCE satırının euro fiyatı. TRY kayıtta kur gerekir. Fiyat yoksa null. */
export function vwcePriceEUR(rows: CashRow[], eurTry?: number | null): number | null {
  const priced = rows.filter(h => String(h.symbol || '').toUpperCase() === 'VWCE' && Number(h.current_price) > 0);
  const h = priced.find(x => Math.abs(Number(x.quantity) || 0) > 1e-8) || priced[0];
  if (!h) return null;
  const price = Number(h.current_price);
  const cur = String(h.currency || '').toUpperCase();
  if (cur === 'EUR') return price;
  if (cur === 'TRY' && eurTry != null && eurTry > 1) return price / eurTry;
  return null;
}

export function formatWeekCount(weeks: number): string {
  if (!(weeks > 0)) return '0 hafta';
  if (weeks < 0.5) return '1 haftadan az';
  const n = Math.round(weeks);
  return `yaklaşık ${n.toLocaleString('tr-TR')} hafta`;
}

export function buildWeeklyPlan(input: {
  euroCashEUR: number;
  safePct?: number | null;
  vwcePriceEUR?: number | null;
}): WeeklyPlan {
  const euroCash = Math.max(0, Number(input.euroCashEUR) || 0);
  const investableEUR = Math.max(0, euroCash - EUR_CASH_RESERVE);
  const weeks = WEEKLY_BUY_EUR > 0 ? investableEUR / WEEKLY_BUY_EUR : 0;
  const safeRaw = input.safePct;
  const safePct = safeRaw == null || !Number.isFinite(Number(safeRaw)) ? null : Number(safeRaw);
  const safeShort = safePct != null && safePct < SAFE_TARGET_PCT;
  const price = input.vwcePriceEUR != null && Number(input.vwcePriceEUR) > 0 ? Number(input.vwcePriceEUR) : null;
  return {
    weeklyEUR: WEEKLY_BUY_EUR,
    reserveEUR: EUR_CASH_RESERVE,
    euroCashEUR: euroCash,
    investableEUR,
    weeks,
    destination: safeShort ? 'XEON' : 'VWCE',
    safePct,
    safeTargetPct: SAFE_TARGET_PCT,
    safeShort,
    vwceEUR: WEEKLY_BUY_EUR,
    priceEUR: price,
    units: price ? WEEKLY_BUY_EUR / price : null,
  };
}

const euro0 = (n: number) => Math.round(n).toLocaleString('de-DE');

export function weeklyPlanCopy(plan: WeeklyPlan): {
  weekLine: string;
  unitsLine: string;
  cashLine: string;
  holdLine: string;
} {
  const pct = plan.safePct == null
    ? ''
    : plan.safePct.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
  const weekLine = plan.safeShort
    ? `Güvenli taraf %${pct}, hedef %${plan.safeTargetPct}. Bu haftaki €${euro0(plan.weeklyEUR)} XEON'a gider. Hedefe dönünce yine tamamı VWCE.`
    : `Bu hafta €${euro0(plan.weeklyEUR)}, tamamı VWCE.`;
  const unitsLine = plan.units == null || plan.priceEUR == null
    ? `€${euro0(plan.vwceEUR)} VWCE. Güncel fiyat yok; adet hesaplanamadı.`
    : `€${euro0(plan.vwceEUR)} VWCE, fiyat €${plan.priceEUR.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — yaklaşık ${plan.units.toLocaleString('de-DE', { maximumFractionDigits: 2 })} adet.`;
  const cashLine = plan.investableEUR <= 0
    ? `EUR nakit €${euro0(plan.euroCashEUR)}. €${euro0(plan.reserveEUR)} kenarda kalır; yatırılacak tutar yok.`
    : `EUR nakit €${euro0(plan.euroCashEUR)}. €${euro0(plan.reserveEUR)} kenarda kalır. Yatırılacak €${euro0(plan.investableEUR)} — ${formatWeekCount(plan.weeks)}.`;
  const holdLine = `V3YL ve XEON'daki mevcut pay durur; yeni alım yok. XEON'a ancak güvenli taraf %${plan.safeTargetPct} hedefinin altına inerse dönülür.`;
  return { weekLine, unitsLine, cashLine, holdLine };
}
