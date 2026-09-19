// DİNAMİK MAAŞ — TEK ÖLÇÜ (2026-09-19, kullanıcı kararı "tutarlı istiyorum")
//
//   bu ayın maaşı = GEÇEN AYIN DOLAR KÂRI × 0,85
//   birikmiş hak  = (Mart 2026'dan geçen aya kadar NET dolar kâr) × 0,85 − çekilenler
//
// Kâr = dolar servetin artışı (yeni para hariç) — Kar/Zarar Geçmişi ile AYNI motor
// (lib/usdPnl.ts + services/usdPnlService.ts). Zarar aylar birikmişten düşer (ana
// paraya dokunulmaz). Kur hareketi kâr sayılmaz. Başka formül eklemeyin.

import { supabase } from '../lib/supabase';
import { getUsdPeriods } from './usdPnlService';

export const SALARY_SAFETY = 0.85;
export const ACCRUAL_START_MONTH = '2026-03';   // günlük kayıt 10 Şubat'ta başlıyor; Şubat kurulum gürültüsü

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const label = (ym: string) => `${MONTHS_TR[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

export interface DynamicSalary {
  month: string; monthLabel: string;
  profitUSD: number;        // geçen ayın dolar kârı
  salaryUSD: number;        // × 0,85, eksi ise 0
  startWealthUSD: number; endWealthUSD: number;
  realizedTRY: number;
}

export interface MonthlySalaryRow {
  month: string; monthLabel: string;
  profitUSD: number; salaryUSD: number;
  startWealthUSD: number; endWealthUSD: number; gapDays: number; realizedTRY: number;
}

export interface SalaryAccrual {
  netProfitUSD: number; earnedUSD: number; withdrawnUSD: number;
  availableUSD: number; deficitUSD: number; months: number; fromLabel: string;
}

export async function getMonthlySalarySeries(months: number = 12): Promise<MonthlySalaryRow[]> {
  const periods = await getUsdPeriods('monthly');
  const thisMonth = new Date().toISOString().slice(0, 7);
  return periods
    .filter(p => p.key < thisMonth)              // bu ay bitmedi
    .map(p => ({
      month: p.key, monthLabel: label(p.key),
      profitUSD: p.gainUSD, salaryUSD: Math.max(0, p.gainUSD * SALARY_SAFETY),
      startWealthUSD: p.startWealthUSD, endWealthUSD: p.endWealthUSD, gapDays: p.gapDays, realizedTRY: p.realizedTRY,
    }))
    .slice(-months).reverse();
}

export async function getDynamicSalary(): Promise<DynamicSalary | null> {
  const rows = await getMonthlySalarySeries(2);
  const r = rows[0]; if (!r) return null;
  return { month: r.month, monthLabel: r.monthLabel, profitUSD: r.profitUSD, salaryUSD: r.salaryUSD, startWealthUSD: r.startWealthUSD, endWealthUSD: r.endWealthUSD, realizedTRY: r.realizedTRY };
}

export async function getSalaryAccrual(): Promise<SalaryAccrual | null> {
  const [series, wdRes] = await Promise.all([getMonthlySalarySeries(36), supabase.from('salary_withdrawals').select('amount_usd')]);
  const rows = series.filter(r => r.month >= ACCRUAL_START_MONTH);
  if (!rows.length) return null;
  const netProfitUSD = rows.reduce((s, r) => s + r.profitUSD, 0);
  const earnedUSD = netProfitUSD * SALARY_SAFETY;
  const withdrawnUSD = (wdRes.data || []).reduce((s, w) => s + (Number(w.amount_usd) || 0), 0);
  const balance = earnedUSD - withdrawnUSD;
  return { netProfitUSD, earnedUSD, withdrawnUSD, availableUSD: Math.max(0, balance), deficitUSD: Math.max(0, -balance), months: rows.length, fromLabel: rows[rows.length - 1].monthLabel };
}
