// EUR bazlı kâr verisi — TEK KAYNAK. Snapshot + exchange_rates(EUR,USD) + realize + döviz maliyet takvimi.
// Tüm K/Z ekranları, Kâr Cüzdanı ve maaş buradan okur. Dayanak: lib/eurPnl.ts başlığı.
import { supabase } from '../lib/supabase';
import { getCachedUSDRate } from './priceService';
import { DEFAULT_USD_TRY_RATE } from '../config';
import { buildEurModel, type MonthRow, type EurModel, type EurDaily } from '../lib/eurPnl';
export type { EurDaily };

export const RELIABLE_FROM = '2026-04-06';       // EUR/USD kur serisinin başladığı gün
export const INFLATION_EUR = 0.02;               // Euro Bölgesi HICP, yıllık, sabit; yılda bir güncelle (kullanıcı kararı 2026-09-19)

let _cache: { ts: number; value: EurModel } | null = null;
const TTL = 5 * 60 * 1000;

const dailyRows = (rows: Array<{ day: string; rate: number }> | null) => (rows || []).map(r => ({ recorded_at: String(r.day), rate: Number(r.rate) }));

async function load(): Promise<EurModel> {
  if (_cache && Date.now() - _cache.ts < TTL) return _cache.value;
  const [snapRes, eurRes, usdRes, txRes, rzCashRes, holdRes] = await Promise.all([
    supabase.from('portfolio_snapshots').select('snapshot_date,total_value,total_investment,created_at').gte('snapshot_date', RELIABLE_FROM)
      .order('snapshot_date', { ascending: true }).order('created_at', { ascending: false }).range(0, 4999),
    // exchange_rates_daily: gün başına son kur (~170 satır) — ham tablo 2.800+ satır, PostgREST max_rows=1000 kesiyordu (2026-09-19)
    supabase.from('exchange_rates_daily').select('day,rate').eq('from_currency', 'EUR').eq('to_currency', 'TRY').eq('source', 'api').order('day', { ascending: true }),
    supabase.from('exchange_rates_daily').select('day,rate').eq('from_currency', 'USD').eq('to_currency', 'TRY').eq('source', 'api').order('day', { ascending: true }),
    supabase.from('transactions').select('transaction_date,transaction_type,quantity,price,total_amount,realized_profit,holding_id').range(0, 4999),
    supabase.from('cash_transactions').select('created_at,currency,notes').eq('transaction_type', 'sell').range(0, 4999),
    supabase.from('holdings').select('id,symbol,currency,quantity,purchase_price,cost_basis,created_at'),
  ]);
  const usdNow = await getCachedUSDRate().catch(() => DEFAULT_USD_TRY_RATE);
  const value = buildEurModel({
    snapshots: snapRes.data || [], eurRates: dailyRows(eurRes.data), usdRates: dailyRows(usdRes.data),
    transactions: txRes.data || [], cashSells: rzCashRes.data || [], holdings: holdRes.data || [],
    usdNow, reliableFrom: RELIABLE_FROM, annualInflation: INFLATION_EUR,
  });
  if (!value.health.ok) console.error(`eurPnl: kur serisi ${value.health.lastEurRateDay}'de bitiyor, snapshot ${value.health.lastSnapDay} — hesap GÜVENİLMEZ`);
  _cache = { ts: Date.now(), value };
  return value;
}

export async function getEurDaily(): Promise<EurDaily[]> { return (await load()).daily; }
export async function getEurMonths(): Promise<MonthRow[]> { return (await load()).months; }
export async function getEurPnlHealth() { return (await load()).health; }
export function invalidateEurPnlCache() { _cache = null; }

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const monthLabel = (ym: string) => `${MONTHS_TR[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Haftalık periyot (Pazartesi başlangıç) — bilgi amaçlı, maaşa girmez */
export async function getEurWeeks(): Promise<Array<{ key: string; label: string; gainEUR: number; startWealthEUR: number; endWealthEUR: number; firstDate: string; lastDate: string }>> {
  const daily = await getEurDaily();
  const keyOf = (d: string) => { const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return dt.toISOString().slice(0, 10); };
  const m = new Map<string, { key: string; label: string; gainEUR: number; startWealthEUR: number; endWealthEUR: number; firstDate: string; lastDate: string }>();
  let prev = daily.length ? daily[0].wealthEUR : 0;
  daily.forEach((d, i) => {
    const k = keyOf(d.date);
    if (!m.has(k)) m.set(k, { key: k, label: `${new Date(k + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} haftası`, gainEUR: 0, startWealthEUR: prev, endWealthEUR: d.wealthEUR, firstDate: d.date, lastDate: d.date });
    const r = m.get(k)!; if (i > 0) r.gainEUR += d.gainEUR; r.endWealthEUR = d.wealthEUR; r.lastDate = d.date; prev = d.wealthEUR;
  });
  return Array.from(m.values()).sort((a, b) => a.key.localeCompare(b.key));
}
