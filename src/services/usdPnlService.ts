// Dolar bazlı kâr verisi — tek kaynak. Snapshot + exchange_rates(USD) + realize.
// Bütün K/Z ekranları (günlük/haftalık/aylık, Kâr Cüzdanı, maaş) buradan okur.
import { supabase } from '../lib/supabase';
import { getCachedUSDRate } from './priceService';
import { DEFAULT_USD_TRY_RATE } from '../config';
import { makeRateSeries, dailyUsdGains, periodUsdGains, type SnapPoint } from '../lib/usdPnl';

export interface UsdDaily { date: string; gainUSD: number; wealthUSD: number; totalValueTRY: number; pnlTRY: number; usdRate: number }
export interface UsdPeriod { key: string; label: string; gainUSD: number; startWealthUSD: number; endWealthUSD: number; firstDate: string; lastDate: string; gapDays: number; realizedTRY: number }

let _cache: { ts: number; value: { daily: UsdDaily[]; realizedByDay: Map<string, number>; usdNow: number } } | null = null;
const TTL = 5 * 60 * 1000;

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

async function load() {
  if (_cache && Date.now() - _cache.ts < TTL) return _cache.value;
  const [snapRes, fxRes, rzTxRes, rzCashRes, holdRes] = await Promise.all([
    supabase.from('portfolio_snapshots').select('snapshot_date,total_value,total_investment,created_at')
      .order('snapshot_date', { ascending: true }).order('created_at', { ascending: false }),
    supabase.from('exchange_rates').select('recorded_at,rate').eq('from_currency', 'USD').eq('to_currency', 'TRY').order('recorded_at', { ascending: true }),
    supabase.from('transactions').select('transaction_date,realized_profit,holding_id'),
    supabase.from('cash_transactions').select('created_at,currency,notes').eq('transaction_type', 'sell'),
    supabase.from('holdings').select('id,currency'),
  ]);
  const usdNow = await getCachedUSDRate().catch(() => DEFAULT_USD_TRY_RATE);
  const eurNow = usdNow * 1.15;

  // gün → en son snapshot
  const byDay = new Map<string, SnapPoint>();
  for (const s of snapRes.data || []) {
    if (!byDay.has(s.snapshot_date) && Number(s.total_value) > 0)
      byDay.set(s.snapshot_date, { date: s.snapshot_date, totalValue: Number(s.total_value), totalInvestment: Number(s.total_investment) || 0 });
  }
  const snaps = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));

  // gün → en son kur (Nisan-2026 öncesi kur yok → seri ilk değere düşer; panelle aynı varsayım)
  const rateByDay = new Map<string, number>();
  for (const r of fxRes.data || []) rateByDay.set(String(r.recorded_at).slice(0, 10), Number(r.rate));
  const rates = makeRateSeries(Array.from(rateByDay, ([date, rate]) => ({ date, rate })), usdNow);

  // realize (TL), mükerrer elenir
  const ccyById = new Map<string, string>((holdRes.data || []).map(h => [String(h.id), String(h.currency || 'TRY').toUpperCase()]));
  const toTRY = (amt: number, ccy: string) => amt * (ccy === 'TRY' ? 1 : ccy === 'USD' ? usdNow : ccy === 'EUR' ? eurNow : 0);
  const realizedByDay = new Map<string, number>(); const seen = new Set<string>();
  for (const c of rzCashRes.data || []) {
    const m = String(c.notes || '').match(/Zarar[:\s]*\+?(-?[\d.]+)/); if (!m) continue;
    const d = String(c.created_at).slice(0, 10); const tl = toTRY(Number(m[1]), String(c.currency || 'TRY').toUpperCase());
    if (!Number.isFinite(tl) || tl === 0) continue;
    realizedByDay.set(d, (realizedByDay.get(d) || 0) + tl); seen.add(`${d}|${Math.round(tl)}`);
  }
  for (const t of rzTxRes.data || []) {
    const rp = Number(t.realized_profit) || 0; if (!rp) continue;
    const d = String(t.transaction_date).slice(0, 10); const tl = toTRY(rp, ccyById.get(String(t.holding_id)) || 'TRY');
    if (!Number.isFinite(tl) || tl === 0 || seen.has(`${d}|${Math.round(tl)}`)) continue;
    realizedByDay.set(d, (realizedByDay.get(d) || 0) + tl);
  }
  // realize gününü en yakın snapshot gününe hizala (snapshot olmayan günde satış olabilir)
  const snapDays = snaps.map(s => s.date);
  const aligned = new Map<string, number>();
  for (const [d, tl] of realizedByDay) {
    const target = snapDays.find(x => x >= d) || snapDays[snapDays.length - 1];
    aligned.set(target, (aligned.get(target) || 0) + tl);
  }

  const dailyRaw = dailyUsdGains(snaps, rates, aligned);
  const daily: UsdDaily[] = dailyRaw.map((d, i) => ({
    ...d, totalValueTRY: snaps[i].totalValue, pnlTRY: snaps[i].totalValue - snaps[i].totalInvestment, usdRate: rates.rateAt(d.date),
  }));
  const value = { daily, realizedByDay: aligned, usdNow };
  _cache = { ts: Date.now(), value };
  return value;
}

export async function getUsdDaily(): Promise<UsdDaily[]> { return (await load()).daily; }

function gap(a: string, b: string) { return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000); }

export async function getUsdPeriods(kind: 'monthly' | 'weekly'): Promise<UsdPeriod[]> {
  const { daily, realizedByDay } = await load();
  const keyFn = kind === 'monthly'
    ? (d: string) => d.slice(0, 7)
    : (d: string) => { const dt = new Date(d + 'T00:00:00'); const day = (dt.getDay() + 6) % 7; dt.setDate(dt.getDate() - day); return dt.toISOString().slice(0, 10); };
  const periods = periodUsdGains(daily, keyFn);
  // önceki periyodun son gününü başlangıç olarak kullan (gap ölçümü için)
  const out: UsdPeriod[] = [];
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i]; const prevLast = i > 0 ? periods[i - 1].lastDate : p.firstDate;
    let realized = 0; for (const [d, tl] of realizedByDay) if (d > prevLast && d <= p.lastDate) realized += tl;
    const label = kind === 'monthly'
      ? `${MONTHS_TR[Number(p.key.slice(5, 7)) - 1]} ${p.key.slice(0, 4)}`
      : `${new Date(p.key + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} haftası`;
    out.push({ ...p, label, gapDays: gap(prevLast, p.lastDate), realizedTRY: realized });
  }
  return out;
}

export function invalidateUsdPnlCache() { _cache = null; }
