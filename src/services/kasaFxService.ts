// KASA'NIN KUR ETKİSİ — 2026-09-27 (kullanıcı: "farklı para birimlerimiz var, bir şeyler eksik gibi")
//
// Kasa (cash_balances) kilitli kural gereği PORTFÖY DIŞI: kâr ölçümüne ve maaş hesabına GİRMEZ.
// Gerekçe doğru (yastığın kur oynaklığı maaşı sürüklemesin), ama sonucu şuydu: servetin ~%16'sı
// hiçbir ekranda ölçülmüyordu. Atıl ruble beklerken euro değeri eriyor ve bu görünmüyordu.
//
// Bu servis SADECE GÖSTERİM üretir; maaş/havuz/kâr rakamlarına dokunmaz. Yöntem:
//   kasa_EUR(gün) = Σ bakiye_BUGÜN × kur_ccy_TL(gün) / kur_EUR_TL(gün)
// Bakiye bugünkü bakiye olarak SABİT tutulur → ölçülen şey yalnız KURUN yaptığıdır (para yatırma/çekme karışmaz).
// Ekranda da böyle yazılır: "aynı bakiye, N gün önceki kurla". İki pencere birlikte verilir, çünkü tek pencere
// yanıltıyor: 27 Eylül'de son 30 gün +€979 iken seri başından beri −€739 (ruble önce düştü, sonra toparladı).
import { supabase } from '../lib/supabase';
import { fetchAll } from './eurPnlService';
import { makeRateSeries, MIN_RATE_MINOR, RELIABLE_FROM, type RateSeries } from '../lib/eurPnl';

export interface KasaRow { currency: string; balance: number; eurNow: number; eurThen: number; fxDeltaEUR: number }
export interface KasaWindow { label: string; sinceDay: string; fxDeltaEUR: number }
export interface KasaFx {
  asOf: string;
  totalEurNow: number;
  shortWindow: KasaWindow;     // son 30 gün
  longWindow: KasaWindow;      // ölçülen serinin başından beri (motorun başlangıcıyla aynı gün)
  rows: KasaRow[];             // uzun pencereye göre kırılım, etkisi büyükten küçüğe
  missingCcy: string[];        // kuru bulunamayan birim — hesaba KATILMADI
}

const TTL = 5 * 60 * 1000;
const SHORT_DAYS = 30;
let _cache: { ts: number; value: KasaFx | null } | null = null;

export interface KasaBalance { currency: string; balance: number }
export interface KasaRateRow { day: string; from_currency: string; rate: number }

/** SAF çekirdek (test edilir): bakiyeler + kur satırları → kasa euro değeri ve kur etkisi. IO yok. */
export function computeKasaFx(balances: KasaBalance[], rateRows: KasaRateRow[], shortDays = SHORT_DAYS): KasaFx | null {
  if (!balances.length || !rateRows.length) return null;
  // Aynı birimden birden fazla satır gelirse (UNIQUE yalnız user_id+currency) kırılım mükerrer görünüyordu → birleştir
  const merged = new Map<string, number>();
  for (const b of balances) {
    const c = String(b.currency || '').toUpperCase(); const v = Number(b.balance) || 0;
    if (!c || !v) continue;
    merged.set(c, (merged.get(c) || 0) + v);
  }
  balances = Array.from(merged, ([currency, balance]) => ({ currency, balance }));
  if (!balances.length) return null;
  const byCcy = new Map<string, Array<{ date: string; rate: number }>>();
  for (const r of rateRows) {
    const c = String(r.from_currency).toUpperCase();
    if (!byCcy.has(c)) byCcy.set(c, []);
    byCcy.get(c)!.push({ date: String(r.day).slice(0, 10), rate: Number(r.rate) });
  }
  const series = new Map<string, RateSeries>();
  // EUR/USD/TRY kurları 1'in üstünde; RUB gibi birimler altında → alt sınır birime göre (yoksa seri sessizce silinir)
  for (const [c, pts] of byCcy) series.set(c, makeRateSeries(pts, NaN, c === 'EUR' || c === 'USD' ? 1 : MIN_RATE_MINOR));

  const eurPts = (byCcy.get('EUR') || []).map(p => p.date).sort();
  const eurSer = series.get('EUR');
  if (!eurSer || !eurPts.length) return null;
  const asOf = eurPts[eurPts.length - 1];
  const firstDay = eurPts[0];

  const back = (days: number) => {
    const d = new Date(asOf + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - days);
    const s2 = d.toISOString().slice(0, 10);
    return s2 < firstDay ? firstDay : s2;
  };

  /** Bugünkü bakiyelerin, verilen günün kurlarıyla euro karşılığı. */
  const valueAt = (day: string): { total: number; perCcy: Map<string, number>; missing: string[] } => {
    const e = eurSer.rateAt(day);
    const perCcy = new Map<string, number>(); const missing: string[] = [];
    if (!Number.isFinite(e) || e <= 0) return { total: 0, perCcy, missing };
    let total = 0;
    for (const b of balances) {
      const c = String(b.currency || '').toUpperCase(); const bal = Number(b.balance) || 0;
      if (!bal) continue;
      const r = c === 'TRY' ? 1 : series.get(c)?.rateAt(day);
      if (r === undefined || !Number.isFinite(r) || r <= 0) { missing.push(c); continue; }
      const v = (bal * r) / e;
      perCcy.set(c, v); total += v;
    }
    return { total, perCcy, missing };
  };

  const now = valueAt(asOf);
  if (!now.total) return null;
  const shortDay = back(shortDays), longDay = firstDay;
  const shortV = valueAt(shortDay), longV = valueAt(longDay);

  const rows: KasaRow[] = [];
  for (const b of balances) {
    const c = String(b.currency || '').toUpperCase();
    const eurNow = now.perCcy.get(c), eurThen = longV.perCcy.get(c);
    if (eurNow === undefined || eurThen === undefined) continue;
    rows.push({ currency: c, balance: Number(b.balance) || 0, eurNow, eurThen, fxDeltaEUR: eurNow - eurThen });
  }
  rows.sort((a, b) => Math.abs(b.fxDeltaEUR) - Math.abs(a.fxDeltaEUR));

  return {
    asOf,
    totalEurNow: now.total,
    shortWindow: {
      label: shortDay === longDay ? 'serinin tamamı' : `${shortDays} gün`,   // kırpıldıysa '30 gün' demek yanlış olur
      sinceDay: shortDay, fxDeltaEUR: now.total - shortV.total,
    },
    longWindow: { label: 'ölçüm başından', sinceDay: longDay, fxDeltaEUR: now.total - longV.total },
    rows,
    missingCcy: Array.from(new Set(now.missing)).sort(),
  };
}

export async function getKasaFx(): Promise<KasaFx | null> {
  if (_cache && Date.now() - _cache.ts < TTL) return _cache.value;

  const [balances, rateRows] = await Promise.all([
    fetchAll<{ currency: string; balance: number }>('kasa', () => supabase
      .from('cash_balances').select('currency,balance').gt('balance', 0).order('currency', { ascending: true })),
    fetchAll<{ day: string; from_currency: string; rate: number }>('kasaRates', () => supabase
      .from('exchange_rates_daily').select('day,from_currency,rate')
      .eq('to_currency', 'TRY').eq('source', 'api').gte('day', RELIABLE_FROM)     // motorla AYNI başlangıç (hakem 2026-09-27)
      .order('day', { ascending: true })),
  ]);
  const value = computeKasaFx(balances, rateRows);
  _cache = { ts: Date.now(), value };
  return value;
}

export function invalidateKasaFxCache() { _cache = null; }
