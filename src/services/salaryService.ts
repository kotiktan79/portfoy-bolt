// DİNAMİK MAAŞ — TEK ÖLÇÜ, EUR (2026-09-19 gece, standart araştırması + kullanıcı kararı "tek euro")
//
//   bu ayın maaşı = geçen ayın ÇEKİLEBİLİR reel EUR kârı × 0,85
//   çekilebilir   = max(0, devreden açık + (nominal kâr − enflasyon payı))
//   nominal kâr   = euro servet artışı − dış akış (lib/eurPnl.ts; 4 bağımsız denetçi ±€40 içinde doğruladı)
//
// Dayanak: GIPS (dönem kârı = servet farkı − akış), IAS 21 §9 (fonksiyonel para = harcanan para = EUR),
// IAS 29 (TL hiperenflasyonist), CF 8.7 (enflasyonu aşan kısım kârdır). Zarar devri: ana paraya dokunulmaz.
// Başka formül EKLEMEYİN. Değiştirmek gerekirse önce kullanıcıya tek cümleyle sorun.

import { supabase } from '../lib/supabase';
import { getEurMonths, monthLabel, RELIABLE_FROM, INFLATION_EUR } from './eurPnlService';
import type { MonthRow } from '../lib/eurPnl';
export { SALARY_SAFETY } from '../lib/eurPnl';
export const ACCRUAL_START_MONTH = RELIABLE_FROM.slice(0, 7);
export { INFLATION_EUR };

export interface DynamicSalary {
  month: string; monthLabel: string;
  profitEUR: number;          // geçen ayın nominal kârı
  inflationEUR: number;       // sermaye koruma payı
  realGainEUR: number;
  carryInEUR: number;         // devreden açık (≤0)
  withdrawableEUR: number;
  salaryEUR: number;          // × 0,85
  startWealthEUR: number; endWealthEUR: number;
}
export type MonthlySalaryRow = DynamicSalary & { gapDays: number };

export interface SalaryAccrual {
  months: number; fromLabel: string;
  nominalEUR: number; inflationEUR: number; realEUR: number;
  withdrawnEUR: number; availableEUR: number; deficitEUR: number;
}

const toRow = (r: MonthRow): DynamicSalary => ({
  month: r.month, monthLabel: monthLabel(r.month), profitEUR: r.gainEUR, inflationEUR: r.inflationEUR, realGainEUR: r.realGainEUR,
  carryInEUR: r.carryInEUR, withdrawableEUR: r.withdrawableEUR, salaryEUR: r.salaryEUR, startWealthEUR: r.startWealthEUR, endWealthEUR: r.endWealthEUR,
});

/** İçinde bulunulan ay, Europe/Bucharest yerel takvimine göre (UTC ayın 1'inde saat farkıyla bir ay geri atıyordu) */
export function currentYM(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit' }).format(now).slice(0, 7);
}
function prevYM(now = new Date()): string {
  const ym = currentYM(now); const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export async function getMonthlySalarySeries(months = 12): Promise<MonthlySalaryRow[]> {
  const rows = await getEurMonths();
  const thisMonth = currentYM();
  return rows.filter(r => r.month < thisMonth).map(r => ({
    ...toRow(r),
    gapDays: Math.round((new Date(r.lastDate + 'T00:00:00').getTime() - new Date(r.firstDate + 'T00:00:00').getTime()) / 86400000),
  })).slice(-months).reverse();
}

export async function getDynamicSalary(): Promise<DynamicSalary | null> {
  // KESİN önceki takvim ayı (cron summarizeEur.lastFull ile aynı kural); o ayda snapshot yoksa maaş yok
  const rows = await getEurMonths();
  const p = prevYM();
  const r = rows.find(x => x.month === p);
  return r ? toRow(r) : null;
}

export async function getSalaryAccrual(): Promise<SalaryAccrual | null> {
  const [rows, wdRes] = await Promise.all([getMonthlySalarySeries(36), supabase.from('salary_withdrawals').select('amount_usd,withdrawn_at')]);
  if (!rows.length) return null;
  const nominalEUR = rows.reduce((s, r) => s + r.profitEUR, 0);
  const inflationEUR = rows.reduce((s, r) => s + r.inflationEUR, 0);
  const realEUR = nominalEUR - inflationEUR;
  // salary_withdrawals USD tutuyor (eski şema); EUR'ya yaklaşık 1,15 ile — çekim yoksa 0
  const withdrawnEUR = (wdRes.data || []).reduce((s, w) => s + (Number(w.amount_usd) || 0) / 1.15, 0);
  const last = rows[0];                                      // en yeni ay (reverse edilmiş)
  const available = last.withdrawableEUR * 1 - Math.max(0, withdrawnEUR - 0); // çekilebilir: son ayın devir-sonrası bakiyesi
  return { months: rows.length, fromLabel: rows[rows.length - 1].monthLabel, nominalEUR, inflationEUR, realEUR, withdrawnEUR, availableEUR: Math.max(0, available), deficitEUR: Math.max(0, -last.carryInEUR - Math.max(0, last.realGainEUR)) };
}

/** Bu ay şimdiye kadar (MTD): nominal kâr, enflasyon payı, devreden açık ve gelecek ay maaş ön izlemesi. */
export interface MonthToDate { month: string; monthLabel: string; gainEUR: number; inflationEUR: number; realGainEUR: number; carryInEUR: number; projectedWithdrawableEUR: number; projectedSalaryEUR: number; asOf: string }
export async function getMonthToDate(): Promise<MonthToDate | null> {
  const rows = await getEurMonths();
  const r = rows.find(x => x.month === currentYM()); if (!r) return null;
  return { month: r.month, monthLabel: monthLabel(r.month), gainEUR: r.gainEUR, inflationEUR: r.inflationEUR, realGainEUR: r.realGainEUR, carryInEUR: r.carryInEUR, projectedWithdrawableEUR: r.withdrawableEUR, projectedSalaryEUR: r.salaryEUR, asOf: r.lastDate };
}
