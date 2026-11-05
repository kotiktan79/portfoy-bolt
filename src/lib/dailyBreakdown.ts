// Günlük net değişimin KAYNAĞI: her varlığın dünkü kapanıştan bu yana katkısı (€).
// Kapanış fiyatı = snapshot'la aynı anda (cron 21:00 Bükreş) price_history'ye yazılan fiyat.
// Şema değişikliği yok. Satırlar + kur etkisi + fark = kart toplamı (birebir).
import type { Holding } from './supabase';
import { getFxRatesFromHoldings, fxToTRY, FxRates } from './fx';
import { isClosedHolding } from './openPosition';

export interface BreakdownRow { id: string; symbol: string; eur: number; noPrev?: boolean }
export interface DailyBreakdown {
  rows: BreakdownRow[];   // fiyat etkisi, |€| büyükten küçüğe
  fxEUR: number;          // euro/dolar cinsi varlıkların kur etkisi (TL bazında)
  gapEUR: number;         // fark (kayıt/fiyat zamanı): kapanış fiyatlarıyla kurulan toplam − snapshot
  totalEUR: number;       // = Σrows + fxEUR + gapEUR = şimdi − kapanış
}

const isFxCash = (h: Holding, s: string) => h.asset_type === 'currency' && (h.symbol === s || (s === 'EURO' && h.symbol === 'EUR'));

export function dailyBreakdown(holdings: Holding[], prevPrices: Record<string, number>, snapshotTRY: number): DailyBreakdown | null {
  const now = getFxRatesFromHoldings(holdings);
  if (!(now.eur > 0) || !(snapshotTRY > 0)) return null;
  const pick = (sym: string, cur: number) => {
    const h = holdings.find(x => isFxCash(x, sym));
    const p = h ? Number(prevPrices[String(h.id)]) : NaN;
    return p > 1 ? p : cur;
  };
  const prev: FxRates = { usd: pick('USD', now.usd), eur: pick('EURO', now.eur), gbp: now.gbp };
  const pos = holdings.filter(h => h.asset_type !== 'cash' && !isClosedHolding(h));
  let nowTRY = 0, prevSumTRY = 0, fxTRY = 0;
  const rows: BreakdownRow[] = [];
  for (const h of pos) {
    const q = Number(h.quantity) || 0;
    const pN = Number(h.current_price) || 0;
    const raw = Number(prevPrices[String(h.id)]);
    const noPrev = !(raw > 0);
    const pP = noPrev ? pN : raw;
    nowTRY += fxToTRY(q * pN, h.currency, now);
    prevSumTRY += fxToTRY(q * pP, h.currency, prev);
    fxTRY += fxToTRY(q * pP, h.currency, now) - fxToTRY(q * pP, h.currency, prev);
    rows.push({ id: String(h.id), symbol: h.symbol, eur: fxToTRY(q * (pN - pP), h.currency, now) / now.eur, ...(noPrev ? { noPrev } : {}) });
  }
  rows.sort((a, b) => Math.abs(b.eur) - Math.abs(a.eur));
  return { rows, fxEUR: fxTRY / now.eur, gapEUR: (prevSumTRY - snapshotTRY) / now.eur, totalEUR: (nowTRY - snapshotTRY) / now.eur };
}

/** İlk n satır + kalanların toplamı. */
export function topWithOthers(rows: BreakdownRow[], n = 5): { top: BreakdownRow[]; othersEUR: number; othersCount: number } {
  const rest = rows.slice(n);
  return { top: rows.slice(0, n), othersEUR: rest.reduce((s, r) => s + r.eur, 0), othersCount: rest.length };
}

/** price_history satırlarından, snapshot anına en yakın fiyat (±30 dk). */
export function closePricesAt(rows: { holding_id: string | null; price: number | string; recorded_at: string }[], atISO: string): Record<string, number> {
  const at = Date.parse(atISO); const best: Record<string, { p: number; d: number }> = {};
  for (const r of rows) {
    if (!r.holding_id) continue;
    const d = Math.abs(Date.parse(r.recorded_at) - at);
    if (!(d <= 30 * 60_000)) continue;
    if (!best[r.holding_id] || d < best[r.holding_id].d) best[r.holding_id] = { p: Number(r.price), d };
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.p]));
}
