// KURULUŞTAN BUGÜNE KÂR — EURO (2026-09-19 gece)
// Her pozisyon: euro maliyet = maliyet_native ÷ ALIŞ GÜNÜ kuru (exchange_rates: api ≥ 6 Nis 2026, ecb backfill öncesi);
// euro değer = değer_native ÷ BUGÜNKÜ kur. Kâr = fark. Satılmış pozisyonlar: realize kâr ÷ satış günü kuru.
// Alış günü = holdings.created_at (22 Eki 2025 toplu giriş; gerçek alış daha eski olabilir → kullanıcıya not).
import { supabase } from '../lib/supabase';
import { makeRateSeries, type RateSeries } from '../lib/eurPnl';

export interface InceptionRow {
  symbol: string; assetType: string; currency: string; boughtOn: string;
  costEUR: number; valueEUR: number; gainEUR: number; gainPct: number; gainTRY: number;
}
export interface InceptionSummary {
  rows: InceptionRow[]; realizedEUR: number; realizedTRY: number;
  totalCostEUR: number; totalValueEUR: number; totalGainEUR: number; totalGainPct: number; totalGainTRY: number;
  eurTryToday: number; eurTryInception: string; asOf: string;
}

let _cache: { ts: number; value: InceptionSummary | null } | null = null;

export async function getInceptionPnl(): Promise<InceptionSummary | null> {
  if (_cache && Date.now() - _cache.ts < 5 * 60 * 1000) return _cache.value;
  const [holdRes, eurRes, usdRes, txRes, cashRes] = await Promise.all([
    supabase.from('holdings').select('symbol,asset_type,currency,quantity,purchase_price,current_price,created_at'),
    // exchange_rates_daily: gün başına son kur — ham tablo PostgREST max_rows=1000'de kesiliyordu, bugünkü kur 3 Haz'da donuyordu (2026-09-19)
    supabase.from('exchange_rates_daily').select('day,rate,source').eq('from_currency', 'EUR').eq('to_currency', 'TRY').in('source', ['api', 'ecb']).order('day', { ascending: true }),
    supabase.from('exchange_rates_daily').select('day,rate,source').eq('from_currency', 'USD').eq('to_currency', 'TRY').in('source', ['api', 'ecb']).order('day', { ascending: true }),
    supabase.from('transactions').select('transaction_date,realized_profit,holding_id'),
    supabase.from('cash_transactions').select('created_at,currency,notes').eq('transaction_type', 'sell'),
  ]);
  const holds = holdRes.data || [];
  if (!holds.length) { _cache = { ts: Date.now(), value: null }; return null; }
  const series = (rows: Array<{ day: string; rate: number; source: string }> | null): RateSeries => {
    const m = new Map<string, number>();
    for (const r of rows || []) { const d = String(r.day).slice(0, 10); if (r.source === 'api' || !m.has(d)) m.set(d, Number(r.rate)); }  // api > ecb
    return makeRateSeries(Array.from(m, ([date, rate]) => ({ date, rate })), 50);
  };
  const eur = series(eurRes.data), usd = series(usdRes.data);
  const today = new Date().toISOString().slice(0, 10);
  const eurToday = eur.rateAt(today), usdToday = usd.rateAt(today);
  const toEurAt = (amt: number, ccy: string, d: string) => ccy === 'TRY' ? amt / eur.rateAt(d) : ccy === 'USD' ? (amt * usd.rateAt(d)) / eur.rateAt(d) : amt;
  const toTryToday = (amt: number, ccy: string) => amt * (ccy === 'TRY' ? 1 : ccy === 'USD' ? usdToday : eurToday);

  const rows: InceptionRow[] = holds.map(h => {
    const c = String(h.currency || 'TRY').toUpperCase(); const d = String(h.created_at).slice(0, 10);
    const q = Number(h.quantity) || 0, pp = Number(h.purchase_price) || 0, cp = Number(h.current_price) || pp;
    const costEUR = toEurAt(q * pp, c, d), valueEUR = toEurAt(q * cp, c, today);
    return { symbol: h.symbol, assetType: h.asset_type, currency: c, boughtOn: d, costEUR, valueEUR, gainEUR: valueEUR - costEUR, gainPct: costEUR ? (100 * (valueEUR - costEUR)) / costEUR : 0, gainTRY: toTryToday(q * (cp - pp), c) };
  }).sort((a, b) => b.gainEUR - a.gainEUR);

  // realize: iki kaynak, mükerrer (EKGYO) elenir
  const ccyById = new Map<string, string>();
  const idRes = await supabase.from('holdings').select('id,currency'); for (const h of idRes.data || []) ccyById.set(String(h.id), String(h.currency || 'TRY').toUpperCase());
  let realizedEUR = 0, realizedTRY = 0; const seen = new Set<string>();
  for (const cst of cashRes.data || []) {
    const m = String(cst.notes || '').match(/Zarar[:\s]*\+?(-?[\d.]+)/) || String(cst.notes || '').match(/K\/Z\s*\+?(-?[\d.]+)/); if (!m) continue;
    const d = String(cst.created_at).slice(0, 10); const v = Number(m[1]); const c = String(cst.currency || 'TRY').toUpperCase();
    const tl = toTryToday(v, c); if (!tl) continue;
    realizedTRY += tl; realizedEUR += toEurAt(v, c, d); seen.add(`${d}|${Math.round(tl)}`);
  }
  for (const t of txRes.data || []) {
    const v = Number(t.realized_profit) || 0; if (!v) continue;
    const d = String(t.transaction_date).slice(0, 10); const c = ccyById.get(String(t.holding_id)) || 'TRY';
    const tl = toTryToday(v, c); if (!tl || seen.has(`${d}|${Math.round(tl)}`)) continue;
    realizedTRY += tl; realizedEUR += toEurAt(v, c, d);
  }
  const totalCostEUR = rows.reduce((s, r) => s + r.costEUR, 0), totalValueEUR = rows.reduce((s, r) => s + r.valueEUR, 0);
  const totalGainEUR = totalValueEUR - totalCostEUR + realizedEUR;
  const value: InceptionSummary = {
    rows, realizedEUR, realizedTRY, totalCostEUR, totalValueEUR, totalGainEUR,
    totalGainPct: totalCostEUR ? (100 * totalGainEUR) / totalCostEUR : 0,
    totalGainTRY: rows.reduce((s, r) => s + r.gainTRY, 0) + realizedTRY,
    eurTryToday: eurToday, eurTryInception: rows.length ? [...rows].sort((a, b) => a.boughtOn.localeCompare(b.boughtOn))[0].boughtOn : '', asOf: today,
  };
  _cache = { ts: Date.now(), value };
  return value;
}
