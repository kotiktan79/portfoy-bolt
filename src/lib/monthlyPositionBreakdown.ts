// Aylık pozisyon dökümü — ekran hesabı. Kâr motoruna (eurPnl) girmez.
//
// Katkı = bitiş değeri − başlangıç değeri − alışlar + satışlar  (hepsi euro)
// Başlangıç = önceki ayın kapanışında eldeki adet × o kapanış fiyatı.
// Bitiş = dönem sonundaki adet × güncel fiyat (açık ay) veya ay sonu kapanışı.
// Satış hasılatı işlem gününün kuruyla eklenir, alış maliyeti düşülür.
// Pozisyonlar arası nakit toplamda sıfırlanır. Satıştan sonraki fiyat düşüşü yazılmaz.

import { dayInTZ, SNAPSHOT_FX_GRACE_MS } from './eurPnl';
import { QTY_EPSILON } from './openPosition';

const SPLIT_RATIOS = [2, 3, 4, 5, 10];
const CLOSE_UTC = 'T18:00:00.000Z';

export interface FxQuote { day: string; rate: number }
export interface FxBook { eur: FxQuote[]; usd: FxQuote[]; rub: FxQuote[]; ron: FxQuote[] }

export interface BreakdownPrice {
  holding_id: string;
  symbol?: string;
  price: number;
  recorded_at: string;
}

export interface BreakdownTx {
  holding_id: string;
  transaction_date: string;
  transaction_type: string;
  quantity: number | string | null;
  price?: number | string | null;
  total_amount?: number | string | null;
  fee?: number | string | null;
  currency?: string | null;
}

export interface BreakdownHolding {
  id: string;
  symbol: string;
  asset_type: string;
  currency?: string | null;
  quantity: number | string | null;
  current_price?: number | string | null;
}

export interface PositionLine {
  id: string;
  symbol: string;
  type: string;
  currency: string;
  qtyStart: number;
  qtyEnd: number;
  gainEUR: number;
  pct: number;
  sold: boolean;
  splitAdjusted?: number;
}

export interface MonthlyBreakdownInput {
  holdings: BreakdownHolding[];
  prices: BreakdownPrice[];
  transactions: BreakdownTx[];
  startDay: string;
  /** Kapanış anı. Bu andan sonraki işlem başlangıç adedine girmez. */
  startAt: string;
  endDay: string;
  endAt: string;
  /** Açık ay: en son fiyat. Kapalı ay: ay sonu kapanışı. */
  endMode: 'close' | 'latest';
  snapshotAtByDay?: Record<string, string | undefined>;
  fx: FxBook;
}

interface FxSnap { eur: number; usd: number; rub: number; ron: number }

export function emptyFxBook(): FxBook {
  return { eur: [], usd: [], rub: [], ron: [] };
}

/** Günlük kur: o gün veya daha önceki son kayıt. */
export function rateOn(quotes: FxQuote[], day: string): number {
  let bestDay = '';
  let best = 0;
  for (const q of quotes) {
    const d = String(q.day).slice(0, 10);
    const rate = Number(q.rate);
    if (!(rate > 0) || d > day) continue;
    if (d >= bestDay) { bestDay = d; best = rate; }
  }
  return best;
}

export function bookFromRows(rows: Array<{ day: string; rate: number | string; from_currency: string }>): FxBook {
  const book = emptyFxBook();
  const slot = (ccy: string): FxQuote[] | null => {
    if (ccy === 'EUR') return book.eur;
    if (ccy === 'USD') return book.usd;
    if (ccy === 'RUB') return book.rub;
    if (ccy === 'RON') return book.ron;
    return null;
  };
  for (const r of rows) {
    const list = slot(String(r.from_currency || '').toUpperCase());
    const day = String(r.day).slice(0, 10);
    const rate = Number(r.rate);
    if (!list || !day || !(rate > 0)) continue;
    const i = list.findIndex(q => q.day === day);
    if (i >= 0) list[i] = { day, rate };
    else list.push({ day, rate });
  }
  return book;
}

/** Snapshot penceresindeki son fiyat: gün başı (UTC) … kapanış + 10 dk. Gece yazılan fiyat kapanış sayılmaz. */
export function closePrice(
  points: Array<{ price: number | string; recorded_at: string }>,
  day: string,
  snapshotAt?: string | null,
): number | null {
  const start = new Date(`${day}T00:00:00.000Z`).getTime();
  const anchor = snapshotAt ? new Date(snapshotAt).getTime() : new Date(`${day}${CLOSE_UTC}`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(anchor)) return null;
  const until = anchor + SNAPSHOT_FX_GRACE_MS;
  let bestT = -Infinity;
  let best: number | null = null;
  for (const p of points) {
    const t = new Date(p.recorded_at).getTime();
    const px = Number(p.price);
    if (!Number.isFinite(t) || !(px > 0) || t < start || t > until) continue;
    if (t >= bestT) { bestT = t; best = px; }
  }
  return best;
}

export function amountToEur(amount: number, ccy: string | null | undefined, fx: FxSnap): number | null {
  if (!Number.isFinite(amount)) return null;
  const c = String(ccy || 'TRY').toUpperCase();
  if (c === 'EUR') return amount;
  if (!(fx.eur > 0)) return null;
  if (c === 'TRY') return amount / fx.eur;
  if (c === 'USD') return fx.usd > 0 ? (amount * fx.usd) / fx.eur : null;
  if (c === 'RUB') return fx.rub > 0 ? (amount * fx.rub) / fx.eur : null;
  if (c === 'RON') return fx.ron > 0 ? (amount * fx.ron) / fx.eur : null;
  return null;
}

export function sumPositionGains(rows: Array<{ gainEUR: number }>): number {
  return rows.reduce((s, r) => s + (Number(r.gainEUR) || 0), 0);
}

export const APPROX_NOTE =
  'Bu döküm yaklaşıktır: ay başı kapanışından bugüne bakılır, satış fiyatından sonrası yazılmaz. Ayın resmi sonucu Kar/Zarar Geçmişi bölümündeki resmi ay kârıdır.';

function detectSplitRatio(start: number, end: number): number | null {
  if (!start || !end || end >= start * 0.95) return null;
  const ratio = start / end;
  for (const r of SPLIT_RATIOS) {
    if (Math.abs(ratio - r) / r < 0.05) return r;
  }
  return null;
}

function qtyAt(currentQty: number, txs: BreakdownTx[], atIso: string): number {
  const at = new Date(atIso).getTime();
  let q = currentQty;
  if (!Number.isFinite(at)) return Math.max(0, q);
  for (const t of txs) {
    const ts = new Date(t.transaction_date).getTime();
    if (!Number.isFinite(ts) || ts <= at) continue;
    const n = Number(t.quantity) || 0;
    const type = String(t.transaction_type || '').toLowerCase();
    if (type === 'buy') q -= n;
    else if (type === 'sell') q += n;
  }
  return Math.max(0, q);
}

function lastOnDay(points: BreakdownPrice[], day: string): number | null {
  let bestT = -Infinity;
  let best: number | null = null;
  for (const p of points) {
    if (String(p.recorded_at).slice(0, 10) !== day) continue;
    const t = new Date(p.recorded_at).getTime();
    const px = Number(p.price);
    if (!Number.isFinite(t) || !(px > 0)) continue;
    if (t >= bestT) { bestT = t; best = px; }
  }
  return best;
}

function lastOnOrBefore(points: BreakdownPrice[], day: string): number | null {
  let bestT = -Infinity;
  let best: number | null = null;
  for (const p of points) {
    if (String(p.recorded_at).slice(0, 10) > day) continue;
    const t = new Date(p.recorded_at).getTime();
    const px = Number(p.price);
    if (!Number.isFinite(t) || !(px > 0)) continue;
    if (t >= bestT) { bestT = t; best = px; }
  }
  return best;
}

function latestPrice(points: BreakdownPrice[], afterDay: string, untilIso: string): number | null {
  const until = new Date(untilIso).getTime();
  if (!Number.isFinite(until)) return null;
  let bestT = -Infinity;
  let best: number | null = null;
  for (const p of points) {
    if (String(p.recorded_at).slice(0, 10) <= afterDay) continue;
    const t = new Date(p.recorded_at).getTime();
    const px = Number(p.price);
    if (!Number.isFinite(t) || t > until || !(px > 0)) continue;
    if (t >= bestT) { bestT = t; best = px; }
  }
  return best;
}

function snapFrom(
  fx: FxBook,
  day: string,
  eurOverride: number | null,
  usdOverride: number | null,
): FxSnap {
  return {
    eur: eurOverride != null && eurOverride > 1 ? eurOverride : rateOn(fx.eur, day),
    usd: usdOverride != null && usdOverride > 1 ? usdOverride : rateOn(fx.usd, day),
    rub: rateOn(fx.rub, day),
    ron: rateOn(fx.ron, day),
  };
}

function pricesFor(all: BreakdownPrice[], symbols: string[]): BreakdownPrice[] {
  const want = new Set(symbols);
  return all.filter(p => want.has(String(p.symbol || '').toUpperCase()));
}

function cashNative(t: BreakdownTx): number | null {
  const qty = Number(t.quantity) || 0;
  const px = Number(t.price) || 0;
  const gross = Number(t.total_amount);
  const base = gross > 0 ? gross : (qty > 0 && px > 0 ? qty * px : 0);
  if (!(base > 0)) return null;
  const fee = Number(t.fee) || 0;
  const type = String(t.transaction_type || '').toLowerCase();
  if (type === 'buy') return base + (fee > 0 ? fee : 0);
  if (type === 'sell') return Math.max(0, base - (fee > 0 ? fee : 0));
  return null;
}

function tradeDay(ts: string): string {
  return dayInTZ(ts) || String(ts).slice(0, 10);
}

export function buildPositionLines(inp: MonthlyBreakdownInput): PositionLine[] {
  const startMs = new Date(inp.startAt).getTime();
  const endMs = new Date(inp.endAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];

  const byHold = new Map<string, BreakdownPrice[]>();
  for (const p of inp.prices) {
    const id = String(p.holding_id);
    const list = byHold.get(id);
    if (list) list.push(p);
    else byHold.set(id, [p]);
  }
  const txByHold = new Map<string, BreakdownTx[]>();
  for (const t of inp.transactions) {
    const id = String(t.holding_id);
    const list = txByHold.get(id);
    if (list) list.push(t);
    else txByHold.set(id, [t]);
  }

  const eurPts = pricesFor(inp.prices, ['EURO', 'EUR']);
  const usdPts = pricesFor(inp.prices, ['USD']);
  const snapAt = inp.snapshotAtByDay || {};

  const closeFx = (day: string) => snapFrom(
    inp.fx,
    day,
    closePrice(eurPts, day, snapAt[day]),
    closePrice(usdPts, day, snapAt[day]),
  );
  const tradeFx = (day: string) => snapFrom(inp.fx, day, null, null);
  const latestFx = () => snapFrom(
    inp.fx,
    inp.endDay,
    latestPrice(eurPts, inp.startDay, inp.endAt),
    latestPrice(usdPts, inp.startDay, inp.endAt),
  );

  const lines: PositionLine[] = [];
  for (const h of inp.holdings) {
    if (String(h.asset_type) === 'cash' || !h.symbol) continue;
    const id = String(h.id);
    const txs = txByHold.get(id) || [];
    const points = byHold.get(id) || [];
    const current = Number(h.quantity) || 0;
    const qtyStart = qtyAt(current, txs, inp.startAt);
    const qtyEnd = qtyAt(current, txs, inp.endAt);

    const periodTx = txs.filter(t => {
      const ts = new Date(t.transaction_date).getTime();
      return Number.isFinite(ts) && ts > startMs && ts <= endMs;
    });
    const heldAtStart = qtyStart > QTY_EPSILON;
    const heldAtEnd = qtyEnd > QTY_EPSILON;
    if (!heldAtStart && !heldAtEnd && periodTx.length === 0) continue;

    const rawStart = heldAtStart
      ? (closePrice(points, inp.startDay, snapAt[inp.startDay]) ?? lastOnOrBefore(points, inp.startDay))
      : null;
    let endPx: number | null = null;
    if (heldAtEnd) {
      if (inp.endMode === 'latest') {
        endPx = latestPrice(points, inp.startDay, inp.endAt);
        if (endPx == null) {
          const live = Number(h.current_price);
          if (live > 0) endPx = live;
        }
      } else {
        endPx = closePrice(points, inp.endDay, snapAt[inp.endDay])
          ?? latestPrice(points, inp.startDay, inp.endAt)
          ?? lastOnDay(points, inp.endDay);
      }
    }
    if (heldAtStart && !(rawStart != null && rawStart > 0)) continue;
    if (heldAtEnd && !(endPx != null && endPx > 0)) continue;

    let startPx = rawStart || 0;
    let splitAdjusted: number | undefined;
    if (heldAtEnd && startPx > 0 && endPx != null) {
      const ratio = detectSplitRatio(startPx, endPx);
      if (ratio) { startPx = startPx / ratio; splitAdjusted = ratio; }
    }

    const ccy = String(h.currency || 'TRY').toUpperCase();
    const startFx = closeFx(inp.startDay);
    const endFx = inp.endMode === 'latest' ? latestFx() : closeFx(inp.endDay);
    const startEUR = heldAtStart ? amountToEur(qtyStart * startPx, ccy, startFx) : 0;
    const endEUR = heldAtEnd && endPx != null ? amountToEur(qtyEnd * endPx, ccy, endFx) : 0;
    if (startEUR == null || endEUR == null) continue;

    let buyEUR = 0;
    let sellEUR = 0;
    let priced = true;
    for (const t of periodTx) {
      const type = String(t.transaction_type || '').toLowerCase();
      if (type !== 'buy' && type !== 'sell') continue;
      const native = cashNative(t);
      const eurAmt = native == null ? null : amountToEur(native, t.currency || ccy, tradeFx(tradeDay(t.transaction_date)));
      if (eurAmt == null) { priced = false; break; }
      if (type === 'buy') buyEUR += eurAmt;
      else sellEUR += eurAmt;
    }
    if (!priced) continue;

    const gainEUR = endEUR - startEUR - buyEUR + sellEUR;
    const base = startEUR > 0.005 ? startEUR : buyEUR;
    const pct = base > 0 ? (gainEUR / base) * 100 : 0;
    lines.push({
      id,
      symbol: h.symbol,
      type: h.asset_type,
      currency: ccy,
      qtyStart,
      qtyEnd,
      gainEUR,
      pct,
      sold: !heldAtEnd && (heldAtStart || sellEUR > 0),
      splitAdjusted,
    });
  }

  lines.sort((a, b) => b.gainEUR - a.gainEUR || a.symbol.localeCompare(b.symbol, 'tr'));
  return lines;
}
