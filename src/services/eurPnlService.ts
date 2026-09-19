// EUR bazlı kâr verisi — TEK KAYNAK. Snapshot + exchange_rates(EUR,USD) + realize + döviz maliyet takvimi.
// Tüm K/Z ekranları, Kâr Cüzdanı ve maaş buradan okur. Dayanak: lib/eurPnl.ts başlığı.
import { supabase } from '../lib/supabase';
import { getCachedUSDRate } from './priceService';
import { DEFAULT_USD_TRY_RATE } from '../config';
import { makeRateSeries, dailyEurGains, monthlyRows, fxDriftTRY, type SnapPoint, type MonthRow, type DailyGain, type ForeignCost } from '../lib/eurPnl';

export const RELIABLE_FROM = '2026-04-06';       // EUR/USD kur serisinin başladığı gün
export const INFLATION_EUR = 0.02;               // Euro Bölgesi HICP, yıllık, sabit; yılda bir güncelle (kullanıcı kararı 2026-09-19)

export interface EurDaily extends DailyGain { totalValueTRY: number; eurRate: number; usdRate: number }

let _cache: { ts: number; value: { daily: EurDaily[]; months: MonthRow[]; health: { ok: boolean; lastEurRateDay: string; lastSnapDay: string } } } | null = null;
const TTL = 5 * 60 * 1000;

async function load() {
  if (_cache && Date.now() - _cache.ts < TTL) return _cache.value;
  const [snapRes, eurRes, usdRes, rzTxRes, rzCashRes, holdRes, txRes] = await Promise.all([
    supabase.from('portfolio_snapshots').select('snapshot_date,total_value,total_investment,created_at').gte('snapshot_date', RELIABLE_FROM)
      .order('snapshot_date', { ascending: true }).order('created_at', { ascending: false }).range(0, 4999),
    supabase.from('exchange_rates').select('recorded_at,rate').eq('from_currency', 'EUR').eq('to_currency', 'TRY').eq('source', 'api').order('recorded_at', { ascending: true }).range(0, 4999),
    supabase.from('exchange_rates').select('recorded_at,rate').eq('from_currency', 'USD').eq('to_currency', 'TRY').eq('source', 'api').order('recorded_at', { ascending: true }).range(0, 4999),
    supabase.from('transactions').select('transaction_date,transaction_type,quantity,price,total_amount,realized_profit,holding_id').range(0, 4999),
    supabase.from('cash_transactions').select('created_at,currency,notes').eq('transaction_type', 'sell').range(0, 4999),
    supabase.from('holdings').select('id,symbol,currency,quantity,purchase_price,cost_basis,created_at'),
    supabase.from('transactions').select('transaction_date,transaction_type,quantity,price,total_amount,holding_id').range(0, 4999),
  ]);
  const usdNow = await getCachedUSDRate().catch(() => DEFAULT_USD_TRY_RATE);

  // gün → en son snapshot
  const byDay = new Map<string, SnapPoint>();
  for (const s of snapRes.data || []) if (!byDay.has(s.snapshot_date) && Number(s.total_value) > 0)
    byDay.set(s.snapshot_date, { date: s.snapshot_date, totalValue: Number(s.total_value), totalInvestment: Number(s.total_investment) || 0 });
  const snaps = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
  const snapDays = snaps.map(s => s.date);

  // kur serileri (gün → son kayıt)
  const toSeries = (rows: Array<{ recorded_at: string; rate: number }> | null, fb: number) => {
    const m = new Map<string, number>(); for (const r of rows || []) m.set(String(r.recorded_at).slice(0, 10), Number(r.rate));
    return { series: makeRateSeries(Array.from(m, ([date, rate]) => ({ date, rate })), fb), lastDay: Array.from(m.keys()).sort().pop() || '' };
  };
  const E = toSeries(eurRes.data, usdNow * 1.15), U = toSeries(usdRes.data, usdNow);
  const eur = E.series, usd = U.series;

  // realize (TL, holding para birimine göre çevrilmiş), mükerrer elenir, snapshot gününe hizalanır
  const holds = holdRes.data || [];
  const ccyById = new Map<string, string>(holds.map(h => [String(h.id), String(h.currency || 'TRY').toUpperCase()]));
  const toTRY = (amt: number, ccy: string, d: string) => amt * (ccy === 'TRY' ? 1 : ccy === 'USD' ? usd.rateAt(d) : ccy === 'EUR' ? eur.rateAt(d) : 0);
  const align = (d: string) => snapDays.find(x => x >= d) || snapDays[snapDays.length - 1];
  const realizedByDay = new Map<string, number>(); const seen = new Set<string>();
  for (const c of rzCashRes.data || []) {
    // iki not formatı: "(Kar/Zarar: 11161.92 ₺)" ve "(K/Z +272.95)"
    const m = String(c.notes || '').match(/Zarar[:\s]*\+?(-?[\d.]+)/) || String(c.notes || '').match(/K\/Z\s*\+?(-?[\d.]+)/); if (!m) continue;
    const d = String(c.created_at).slice(0, 10); const tl = toTRY(Number(m[1]), String(c.currency || 'TRY').toUpperCase(), d);
    if (!Number.isFinite(tl) || tl === 0 || d < RELIABLE_FROM) continue;
    const k = align(d); realizedByDay.set(k, (realizedByDay.get(k) || 0) + tl); seen.add(`${d}|${Math.round(tl)}`);
  }
  for (const t of rzTxRes.data || []) {
    const rp = Number(t.realized_profit) || 0; if (!rp) continue;
    const d = String(t.transaction_date).slice(0, 10); const tl = toTRY(rp, ccyById.get(String(t.holding_id)) || 'TRY', d);
    if (!Number.isFinite(tl) || tl === 0 || d < RELIABLE_FROM || seen.has(`${d}|${Math.round(tl)}`)) continue;
    const k = align(d); realizedByDay.set(k, (realizedByDay.get(k) || 0) + tl);
  }

  // DÖVİZ MALİYET TAKVİMİ: her snapshot günü için USD/EUR cinsi pozisyonların native maliyeti.
  // Bugünkü cost_basis'ten geriye, o pozisyonun sonraki alım/satışlarını sararak.
  // (transactions tablosu ilk alımları içermeyebilir → holdings.created_at öncesi maliyet 0 sayılır.)
  const foreign = holds.filter(h => ['USD', 'EUR'].includes(String(h.currency || '').toUpperCase()));
  const txByHolding = new Map<string, Array<{ d: string; dCost: number }>>();
  for (const t of txRes.data || []) {
    const h = foreign.find(x => String(x.id) === String(t.holding_id)); if (!h) continue;
    const d = String(t.transaction_date).slice(0, 10);
    const q = Number(t.quantity) || 0, amt = Number(t.total_amount) || 0;
    // alım: maliyet += tutar; satış: maliyet −= q × ortalama maliyet (yaklaşık: bugünkü purchase_price)
    const dCost = t.transaction_type === 'buy' ? amt : -(q * (Number(h.purchase_price) || 0));
    if (!txByHolding.has(String(h.id))) txByHolding.set(String(h.id), []);
    txByHolding.get(String(h.id))!.push({ d, dCost });
  }
  // Drift tabanı = quantity × purchase_price: snapshot total_investment BU tabanla kurulur
  // (daily-snapshot.ts tryValueOf(h,'purchase_price')). cost_basis bazı pozisyonlarda bayat
  // (JNJ 1.097 vs q×pp 2.897 USD) → drift eksik kalıyordu (hakem bulgusu 2026-09-19).
  const costsOn = (date: string): ForeignCost[] => foreign.map(h => {
    let c = (Number(h.quantity) || 0) * (Number(h.purchase_price) || 0);
    for (const t of txByHolding.get(String(h.id)) || []) if (t.d > date) c -= t.dCost;
    if (String(h.created_at).slice(0, 10) > date) c = 0;
    return { currency: String(h.currency).toUpperCase() as 'USD' | 'EUR', costNative: Math.max(0, c) };
  });
  const driftByDay = new Map<string, number>();
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1].date, cur = snaps[i].date;
    driftByDay.set(cur, fxDriftTRY(costsOn(prev), prev, cur, usd, eur));
  }

  const dailyRaw = dailyEurGains(snaps, eur, realizedByDay, driftByDay);
  const daily: EurDaily[] = dailyRaw.map((d, i) => ({ ...d, totalValueTRY: snaps[i].totalValue, eurRate: eur.rateAt(d.date), usdRate: usd.rateAt(d.date) }));
  const months = monthlyRows(daily, INFLATION_EUR);
  const lastSnapDay = snapDays[snapDays.length - 1] || '';
  const health = { ok: E.lastDay >= lastSnapDay && U.lastDay >= lastSnapDay, lastEurRateDay: E.lastDay, lastSnapDay };
  if (!health.ok) console.error(`eurPnl: kur serisi ${E.lastDay}/${U.lastDay}'de bitiyor, snapshot ${lastSnapDay} — hesap GÜVENİLMEZ`);
  const value = { daily, months, health };
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
