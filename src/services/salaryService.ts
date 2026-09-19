// DİNAMİK MAAŞ — TEK ÖLÇÜ (2026-09-19, kullanıcı kararı, KESİN)
//
//   maaş = GEÇEN AYIN KÂRI × 0,85
//
// Kâr = "Kar/Zarar Geçmişi → Aylık" tablosuyla BİREBİR aynı hesap:
//   Δ(total_value − total_investment) ay sonundan ay sonuna + o ayda realize edilen kâr.
// Yeni para koymak değeri ve maliyeti birlikte artırır → kâr rakamı etkilenmez,
// deposit/withdraw ayıklamaya gerek yok. Eksi ay → maaş 0 (fark yastıktan).
//
// YASAK: havuz/12'ye yayma, kur ayrıştırması, harcama düşümü, taban, yumuşatma,
// yıllıklaştırılmış büyüme. Bunlar 2026-09'da kullanıcıya 5 farklı rakam gösterdi.
// Uygulamadaki HER maaş göstergesi bu servisten okur; başka formül eklemeyin.

import { supabase } from '../lib/supabase';
import { getCachedUSDRate } from './priceService';
import { DEFAULT_USD_TRY_RATE } from '../config';

export const SALARY_SAFETY = 0.85;

export interface DynamicSalary {
  month: string;          // kârın ait olduğu ay, 'YYYY-MM' (geçen tam ay)
  monthLabel: string;     // 'Ağustos 2026'
  profitTRY: number;      // o ayın kârı (TL)
  profitUSD: number;      // o ayın kârı (USD, bugünkü kur)
  salaryUSD: number;      // kâr × 0,85, eksi ise 0
  salaryTRY: number;
  usdRate: number;
  realizedTRY: number;    // dahil edilen satış kârı
}

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

let _cache: { value: DynamicSalary | null; ts: number } | null = null;
const TTL = 10 * 60 * 1000;

export async function getDynamicSalary(): Promise<DynamicSalary | null> {
  if (_cache && Date.now() - _cache.ts < TTL) return _cache.value;
  try {
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    const prevPrev = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const prevPrevMonth = `${prevPrev.getFullYear()}-${String(prevPrev.getMonth() + 1).padStart(2, '0')}`;

    // Geçen ayın son snapshot'ı ve ondan önceki ayın son snapshot'ı
    const [endRes, startRes, rzTxRes, rzCashRes, holdRes] = await Promise.all([
      supabase.from('portfolio_snapshots').select('snapshot_date,total_value,total_investment')
        .gte('snapshot_date', `${prevMonth}-01`).lt('snapshot_date', `${thisMonth}-01`)
        .order('snapshot_date', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('portfolio_snapshots').select('snapshot_date,total_value,total_investment')
        .gte('snapshot_date', `${prevPrevMonth}-01`).lt('snapshot_date', `${prevMonth}-01`)
        .order('snapshot_date', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('transactions').select('transaction_date,realized_profit,holding_id')
        .gte('transaction_date', `${prevPrevMonth}-01`).lt('transaction_date', `${thisMonth}-01`),
      supabase.from('cash_transactions').select('created_at,currency,notes')
        .eq('transaction_type', 'sell').gte('created_at', `${prevPrevMonth}-01`).lt('created_at', `${thisMonth}-01`),
      supabase.from('holdings').select('id,currency'),
    ]);
    const end = endRes.data, start = startRes.data;
    if (!end || !start) { _cache = { value: null, ts: Date.now() }; return null; }

    const usdRate = await getCachedUSDRate().catch(() => DEFAULT_USD_TRY_RATE);
    const eurRate = usdRate * 1.15; // realize EUR satırları için yaklaşık; tutarlar küçük
    const ccyById = new Map<string, string>((holdRes.data || []).map(h => [String(h.id), String(h.currency || 'TRY').toUpperCase()]));
    const toTRY = (amt: number, ccy: string) => amt * (ccy === 'TRY' ? 1 : ccy === 'USD' ? usdRate : ccy === 'EUR' ? eurRate : 0);
    const inWindow = (d: string) => d > start.snapshot_date && d <= end.snapshot_date;

    // Realize kâr: iki kaynak, tarih+tutar anahtarıyla mükerrer elenir (EKGYO iki yerde)
    let realized = 0;
    const seen = new Set<string>();
    for (const c of rzCashRes.data || []) {
      const m = String(c.notes || '').match(/Zarar[:\s]*\+?(-?[\d.]+)/);
      if (!m) continue;
      const d = String(c.created_at).slice(0, 10);
      if (!inWindow(d)) continue;
      const tl = toTRY(Number(m[1]), String(c.currency || 'TRY').toUpperCase());
      if (!Number.isFinite(tl) || tl === 0) continue;
      realized += tl; seen.add(`${d}|${Math.round(tl)}`);
    }
    for (const t of rzTxRes.data || []) {
      const rp = Number(t.realized_profit) || 0;
      if (!rp) continue;
      const d = String(t.transaction_date).slice(0, 10);
      if (!inWindow(d)) continue;
      const tl = toTRY(rp, ccyById.get(String(t.holding_id)) || 'TRY');
      if (!Number.isFinite(tl) || tl === 0 || seen.has(`${d}|${Math.round(tl)}`)) continue;
      realized += tl;
    }

    const pnl = (s: { total_value: number; total_investment: number }) => (Number(s.total_value) || 0) - (Number(s.total_investment) || 0);
    const profitTRY = pnl(end) - pnl(start) + realized;
    const profitUSD = profitTRY / usdRate;
    const salaryUSD = Math.max(0, profitUSD * SALARY_SAFETY);
    const [y, m] = prevMonth.split('-').map(Number);
    const value: DynamicSalary = {
      month: prevMonth, monthLabel: `${MONTHS_TR[m - 1]} ${y}`,
      profitTRY, profitUSD, salaryUSD, salaryTRY: salaryUSD * usdRate, usdRate, realizedTRY: realized,
    };
    _cache = { value, ts: Date.now() };
    return value;
  } catch (e) {
    console.error('getDynamicSalary error:', e);
    return null;
  }
}

// ---- Aylık seri: her ay için kâr ve maaş (Kar/Zarar Geçmişi tablosuyla aynı hesap) ----
export interface MonthlySalaryRow {
  month: string;        // 'YYYY-MM' — kârın ayı
  monthLabel: string;
  profitTRY: number;
  profitUSD: number;
  salaryUSD: number;    // bu kârdan doğan maaş (bir sonraki ay ödenir)
  salaryTRY: number;
  realizedTRY: number;
  gapDays: number;      // ölçüm aralığı (>45 = arada kayıt yok)
}

export async function getMonthlySalarySeries(months: number = 12): Promise<MonthlySalaryRow[]> {
  try {
    const [snapRes, rzTxRes, rzCashRes, holdRes] = await Promise.all([
      supabase.from('portfolio_snapshots').select('snapshot_date,total_value,total_investment,created_at')
        .order('snapshot_date', { ascending: true }).order('created_at', { ascending: false }),
      supabase.from('transactions').select('transaction_date,realized_profit,holding_id'),
      supabase.from('cash_transactions').select('created_at,currency,notes').eq('transaction_type', 'sell'),
      supabase.from('holdings').select('id,currency'),
    ]);
    const raw = snapRes.data || [];
    if (raw.length < 2) return [];
    const usdRate = await getCachedUSDRate().catch(() => DEFAULT_USD_TRY_RATE);
    const eurRate = usdRate * 1.15;
    const ccyById = new Map<string, string>((holdRes.data || []).map(h => [String(h.id), String(h.currency || 'TRY').toUpperCase()]));
    const toTRY = (amt: number, ccy: string) => amt * (ccy === 'TRY' ? 1 : ccy === 'USD' ? usdRate : ccy === 'EUR' ? eurRate : 0);

    // gün → en son satır; ay → son gün
    const byDay = new Map<string, { total_value: number; total_investment: number }>();
    for (const s of raw) if (!byDay.has(s.snapshot_date)) byDay.set(s.snapshot_date, s);
    const days = Array.from(byDay.keys()).sort();
    const lastOfMonth = new Map<string, string>();
    for (const d of days) lastOfMonth.set(d.slice(0, 7), d);

    // realize kâr gün bazında (mükerrer elenir)
    const rz = new Map<string, number>(); const seen = new Set<string>();
    for (const c of rzCashRes.data || []) {
      const m = String(c.notes || '').match(/Zarar[:\s]*\+?(-?[\d.]+)/); if (!m) continue;
      const d = String(c.created_at).slice(0, 10); const tl = toTRY(Number(m[1]), String(c.currency || 'TRY').toUpperCase());
      if (!Number.isFinite(tl) || tl === 0) continue;
      rz.set(d, (rz.get(d) || 0) + tl); seen.add(`${d}|${Math.round(tl)}`);
    }
    for (const t of rzTxRes.data || []) {
      const rp = Number(t.realized_profit) || 0; if (!rp) continue;
      const d = String(t.transaction_date).slice(0, 10); const tl = toTRY(rp, ccyById.get(String(t.holding_id)) || 'TRY');
      if (!Number.isFinite(tl) || tl === 0 || seen.has(`${d}|${Math.round(tl)}`)) continue;
      rz.set(d, (rz.get(d) || 0) + tl);
    }

    const pnl = (d: string) => { const s = byDay.get(d)!; return (Number(s.total_value) || 0) - (Number(s.total_investment) || 0); };
    const monthsSorted = Array.from(lastOfMonth.keys()).sort();
    const out: MonthlySalaryRow[] = [];
    for (let i = 1; i < monthsSorted.length; i++) {
      const mo = monthsSorted[i], start = lastOfMonth.get(monthsSorted[i - 1])!, end = lastOfMonth.get(mo)!;
      let realized = 0;
      for (const [d, tl] of rz) if (d > start && d <= end) realized += tl;
      const profitTRY = pnl(end) - pnl(start) + realized;
      const profitUSD = profitTRY / usdRate;
      const salaryUSD = Math.max(0, profitUSD * SALARY_SAFETY);
      const [y, m] = mo.split('-').map(Number);
      out.push({
        month: mo, monthLabel: `${MONTHS_TR[m - 1]} ${y}`, profitTRY, profitUSD, salaryUSD, salaryTRY: salaryUSD * usdRate, realizedTRY: realized,
        gapDays: Math.round((new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86400000),
      });
    }
    return out.slice(-months).reverse();
  } catch (e) {
    console.error('getMonthlySalarySeries error:', e);
    return [];
  }
}
