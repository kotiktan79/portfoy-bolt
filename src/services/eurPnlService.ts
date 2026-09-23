// EUR bazlı kâr verisi — TEK KAYNAK. Snapshot + exchange_rates(EUR,USD) + realize + döviz maliyet takvimi.
// Tüm K/Z ekranları, Kâr Cüzdanı ve maaş buradan okur. Dayanak: lib/eurPnl.ts başlığı.
import { supabase } from '../lib/supabase';
import { getCachedUSDRate } from './priceService';
import { DEFAULT_USD_TRY_RATE } from '../config';
import { buildEurModel, withdrawnMap, RELIABLE_FROM, INFLATION_EUR, ROW_CAP, type MonthRow, type EurModel, type EurDaily } from '../lib/eurPnl';
export type { EurDaily };
export { RELIABLE_FROM, INFLATION_EUR };

let _cache: { ts: number; value: EurModel } | null = null;
const TTL = 5 * 60 * 1000;

const dailyRows = (rows: Array<{ day: string; rate: number }> | null) => (rows || []).map(r => ({ recorded_at: String(r.day), rate: Number(r.rate) }));

/** PostgREST max_rows=1000 tavanını sayfalayarak aşar (.range tek başına YETMEZ — tavan sunucuda).
 *  Hata fırlatır: sessizce yarım seriyle yanlış kâr hesaplamaktansa ekran boş kalsın (çağıranlar catch eder). */
export async function fetchAll<T>(name: string, build: () => any): Promise<T[]> {
  // Sunucu max_rows'u ROW_CAP'ten KÜÇÜK olabilir → 'kısa sayfa = bitti' varsayımı seriyi sessizce yarım bırakır.
  // Bu yüzden boş sayfa görene kadar devam edilir (fazladan tek istek, karşılığında kesilme riski yok).
  const out: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await build().range(from, from + ROW_CAP - 1);
    if (error) throw new Error(`eurPnl ${name}: ${error.message}`);
    const rows = (data || []) as T[];
    if (rows.length === 0) return out;
    out.push(...rows);
    from += rows.length;
    if (out.length > 200_000) throw new Error(`eurPnl ${name}: beklenmedik satır sayısı`);
  }
}

async function load(): Promise<EurModel> {
  if (_cache && Date.now() - _cache.ts < TTL) return _cache.value;
  const rateQ = (ccy: 'EUR' | 'USD') => () => supabase.from('exchange_rates_daily').select('day,rate')
    .eq('from_currency', ccy).eq('to_currency', 'TRY').eq('source', 'api').gte('day', RELIABLE_FROM).order('day', { ascending: true });
  const [snaps, eurRates, usdRates, txs, cashSells, holds, withdrawals] = await Promise.all([
    fetchAll<{ snapshot_date: string; total_value: number; total_investment: number }>('snapshots', () => supabase
      .from('portfolio_snapshots').select('snapshot_date,total_value,total_investment,created_at').gte('snapshot_date', RELIABLE_FROM)
      .order('snapshot_date', { ascending: true }).order('created_at', { ascending: false }).order('id', { ascending: true })),
    // exchange_rates_daily: gün başına son kur (~170 satır) — ham tablo 2.800+ satır, tavanda kesiliyordu (2026-09-19)
    fetchAll<{ day: string; rate: number }>('eur', rateQ('EUR')),
    fetchAll<{ day: string; rate: number }>('usd', rateQ('USD')),
    fetchAll<any>('tx', () => supabase.from('transactions').select('transaction_date,transaction_type,quantity,price,total_amount,realized_profit,holding_id').order('transaction_date', { ascending: true }).order('id', { ascending: true })),
    fetchAll<any>('cashSells', () => supabase.from('cash_transactions').select('created_at,currency,notes').eq('transaction_type', 'sell').order('created_at', { ascending: true }).order('id', { ascending: true })),
    fetchAll<any>('holdings', () => supabase.from('holdings').select('id,symbol,currency,quantity,purchase_price,cost_basis,created_at').order('id', { ascending: true })),
    fetchAll<any>('withdrawals', () => supabase.from('salary_withdrawals').select('withdrawn_at,amount_usd').order('withdrawn_at', { ascending: true })),
  ]);
  const usdNow = await getCachedUSDRate().catch(() => DEFAULT_USD_TRY_RATE);
  const value = buildEurModel({
    snapshots: snaps, eurRates: dailyRows(eurRates), usdRates: dailyRows(usdRates),
    transactions: txs, cashSells, holdings: holds,
    usdNow, reliableFrom: RELIABLE_FROM, annualInflation: INFLATION_EUR,
    withdrawnByMonth: withdrawnMap(withdrawals, dailyRows(eurRates), dailyRows(usdRates)),
  });
  if (!value.health.ok) console.error(`eurPnl: kur serisi ${value.health.lastEurRateDay}'de bitiyor, snapshot ${value.health.lastSnapDay} — hesap GÜVENİLMEZ`);
  _cache = { ts: Date.now(), value };
  return value;
}

export async function getEurDaily(): Promise<EurDaily[]> { return (await load()).daily; }
export async function getEurMonths(): Promise<MonthRow[]> { return (await load()).months; }
export async function getEurPnlHealth() { return (await load()).health; }
export function invalidateEurPnlCache() { _cache = null; _rzCache = null; _cpCache.clear(); }

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const monthLabel = (ym: string) => `${MONTHS_TR[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Haftalık periyot (Pazartesi başlangıç) — bilgi amaçlı, maaşa girmez */
export async function getEurWeeks(): Promise<Array<{ key: string; label: string; gainEUR: number; startWealthEUR: number; endWealthEUR: number; firstDate: string; lastDate: string }>> {
  const daily = await getEurDaily();
  // UTC anahtar: yerel gece yarısı → toISOString Bükreş'te bir gün geri kayıyordu (hakem bulgusu 2026-09-19)
  const keyOf = (d: string) => { const dt = new Date(d + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); return dt.toISOString().slice(0, 10); };
  const m = new Map<string, { key: string; label: string; gainEUR: number; startWealthEUR: number; endWealthEUR: number; firstDate: string; lastDate: string }>();
  let prev = daily.length ? daily[0].wealthEUR : 0;
  daily.forEach((d, i) => {
    const k = keyOf(d.date);
    if (!m.has(k)) m.set(k, { key: k, label: `${new Date(k + 'T00:00:00Z').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })} haftası`, gainEUR: 0, startWealthEUR: prev, endWealthEUR: d.wealthEUR, firstDate: d.date, lastDate: d.date });
    const r = m.get(k)!; if (i > 0) r.gainEUR += d.gainEUR; r.endWealthEUR = d.wealthEUR; r.lastDate = d.date; prev = d.wealthEUR;
  });
  return Array.from(m.values()).sort((a, b) => a.key.localeCompare(b.key));
}

/** CANLI (gün içi) kâr: son snapshot'tan şu ana, motorla aynı formül; fiyatlar güncel holdings'ten.
 *  Realize (bugünkü satışlar) küçük bir sorguyla eklenir; 2 dk önbellek. */
import { liveEurGain, type LiveGain } from '../lib/eurPnl';
import { getFxRatesFromHoldings } from '../lib/fx';
import type { Holding } from '../lib/supabase';
let _rzCache: { ts: number; since: string; tl: number } | null = null;
/** Son snapshot'ın ZAMAN DAMGASINDAN sonraki satışların realize'ı (TL). Sınır iki sorguda da aynı (hakem 2026-09-22:
 *  tarih sınırı snapshot ÖNCESİ satışları da alıp realize'ı iki kez sayıyordu). */
async function realizedSince(sinceTs: string, usdNow: number, eurNow: number, ccyById: Map<string, string>): Promise<number> {
  if (_rzCache && _rzCache.since === sinceTs && Date.now() - _rzCache.ts < 2 * 60 * 1000) return _rzCache.tl;
  const [c, t] = await Promise.all([
    supabase.from('cash_transactions').select('created_at,currency,notes').eq('transaction_type', 'sell').gt('created_at', sinceTs),
    supabase.from('transactions').select('transaction_date,realized_profit,holding_id').gt('transaction_date', sinceTs),
  ]);
  const toTRY = (amt: number, ccy: string) => amt * (ccy === 'TRY' ? 1 : ccy === 'USD' ? usdNow : ccy === 'EUR' ? eurNow : 0);
  let tl = 0; const seen = new Set<string>();
  for (const x of c.data || []) {
    const m = String(x.notes || '').match(/Zarar[:\s]*\+?(-?[\d.]+)/) || String(x.notes || '').match(/K\/Z\s*\+?(-?[\d.]+)/); if (!m) continue;
    const v = toTRY(Number(m[1]), String(x.currency || 'TRY').toUpperCase()); if (!Number.isFinite(v) || !v) continue;
    tl += v; seen.add(`${String(x.created_at).slice(0, 10)}|${Math.round(v)}`);
  }
  for (const x of t.data || []) {
    const rp = Number(x.realized_profit) || 0; if (!rp) continue;
    const v = toTRY(rp, ccyById.get(String(x.holding_id)) || 'TRY');   // motorla aynı: holding para biriminden TL'ye
    const k = `${String(x.transaction_date).slice(0, 10)}|${Math.round(v)}`; if (seen.has(k)) continue;
    tl += v;
  }
  _rzCache = { ts: Date.now(), since: sinceTs, tl };
  return tl;
}
export async function getLiveEurGain(holdings: Holding[]): Promise<LiveGain | null> {
  if (!holdings.length) return null;
  const model = await load();
  if (!model.lastSnapshot) return null;
  const fx = getFxRatesFromHoldings(holdings);
  const eurNow = fx.eur;
  const sinceTs = model.lastSnapshot.createdAt || (model.lastSnapshot.date + 'T18:00:00Z');   // cron 18:00 UTC; created_at yoksa yaklaşık
  const ccyById = new Map<string, string>(holdings.map(h => [String(h.id), String(h.currency || 'TRY').toUpperCase()]));
  const realizedTodayTRY = await realizedSince(sinceTs, fx.usd, eurNow, ccyById).catch(() => 0);
  const closePrices = await closePricesOn(model.lastSnapshot.date).catch(() => null);
  return liveEurGain(model, { holdings, usdNow: fx.usd, eurNow, realizedTodayTRY, closePrices });
}

/** Son snapshot GÜNÜNÜN fiyatları (price_history, sembol başına o günün son kaydı) — günlük kırılım için.
 *  Cron her gün her pozisyona satır yazar; yoksa o pozisyon kırılımda 'diğer'e düşer, toplam yine doğru kalır. */
const _cpCache = new Map<string, Map<string, number>>();
async function closePricesOn(day: string): Promise<Map<string, number> | null> {
  const hit = _cpCache.get(day); if (hit) return hit;
  const rows = await fetchAll<{ symbol: string; price: number; recorded_at: string }>('closePrices', () => supabase
    .from('price_history').select('symbol,price,recorded_at')
    .gte('recorded_at', `${day}T00:00:00`).lt('recorded_at', `${day}T23:59:59.999`)
    .order('recorded_at', { ascending: true }).order('id', { ascending: true }));
  if (!rows.length) return null;
  const m = new Map<string, number>();
  for (const r of rows) { const v = Number(r.price); if (isFinite(v) && v > 0) m.set(r.symbol, v); }   // son kayıt kazanır
  _cpCache.set(day, m);
  return m;
}
