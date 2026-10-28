// Kâr Cüzdanı'nın okuduğu aynı kaynaklar. Yazmaz. Hesabı planSalary yapar.

import { supabase } from '../lib/supabase';
import { makeRateSeries, RELIABLE_FROM, type RateSeries } from '../lib/eurPnl';
import { kasaOutstandingEUR } from '../lib/salaryPlan';
import { currentYM, getDynamicSalary } from './salaryService';
import { getKasaFx } from './kasaFxService';
import { withdrawnThisMonthEUR, type MonthSalaryInputs } from '../lib/monthSalaryCard';

function numOrUndef(v: unknown): number | undefined {
  return v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v);
}

export interface SalaryPolicyRow {
  floor_eur?: unknown;
  cap_eur?: unknown;
  kasa_floor_eur?: unknown;
  kasa_refill_ratio?: unknown;
  kasa_start_eur?: unknown;
  salary_start_month?: unknown;
}

export interface SalaryWithdrawalRow {
  withdrawn_at: string;
  amount_usd?: number | string | null;
  amount_eur?: number | string | null;
}

/** Kâr Cüzdanı loadPolicy + loadAll ile aynı alanlar. Kur yoksa eski USD satırı 0 sayılır, o da cüzdanla aynı. */
export function assembleMonthSalaryInputs(args: {
  asOfMonth: string;
  poolEUR: number;
  realGainEUR: number;
  kasaEUR: number;
  policy: SalaryPolicyRow | null;
  moves: Array<{ kind: string; amount_eur: number | string | null }>;
  withdrawals: SalaryWithdrawalRow[];
  eurRates: Array<{ recorded_at: string; rate: number }>;
  usdRates: Array<{ recorded_at: string; rate: number }>;
}): MonthSalaryInputs {
  const pol = args.policy;
  return {
    asOfMonth: args.asOfMonth,
    poolEUR: args.poolEUR,
    realGainEUR: args.realGainEUR,
    kasaEUR: args.kasaEUR,
    kasaDrawnOutstandingEUR: kasaOutstandingEUR(args.moves),
    floorEUR: pol ? numOrUndef(pol.floor_eur) : undefined,
    capEUR: pol ? numOrUndef(pol.cap_eur) : undefined,
    kasaMinEUR: pol ? numOrUndef(pol.kasa_floor_eur) : undefined,
    refillRatio: pol ? numOrUndef(pol.kasa_refill_ratio) : undefined,
    kasaStartEUR: pol ? numOrUndef(pol.kasa_start_eur) : undefined,
    salaryStartMonth: pol && pol.salary_start_month ? String(pol.salary_start_month) : undefined,
    withdrawnThisMonthEUR: withdrawnThisMonthEUR(args.withdrawals, args.asOfMonth, args.eurRates, args.usdRates),
  };
}

function ratePoints(rows: Array<{ day: string; rate: number }> | null): Array<{ recorded_at: string; rate: number }> {
  return (rows || []).map(r => ({ recorded_at: String(r.day).slice(0, 10), rate: Number(r.rate) }));
}

/** Kâr Cüzdanı kur serisiyle aynı pencere. Test, iki tarafın aynı rateAt verdiğini doğrular. */
export function salaryRateSeries(rows: Array<{ day: string; rate: number }> | null): RateSeries {
  return makeRateSeries(ratePoints(rows).map(r => ({ date: r.recorded_at, rate: r.rate })), Number.NaN);
}

export async function loadMonthSalaryInputs(now = new Date()): Promise<MonthSalaryInputs> {
  const asOfMonth = currentYM(now);
  const [salary, kasa, policyRes, movesRes, wdRes, eurRes, usdRes] = await Promise.all([
    getDynamicSalary(),
    getKasaFx(),
    supabase.from('portfoy_bolt_salary_policy').select('*').eq('id', 1).maybeSingle(),
    supabase.from('portfoy_bolt_kasa_salary_moves').select('kind,amount_eur'),
    supabase.from('salary_withdrawals').select('*').order('withdrawn_at', { ascending: false }).limit(200),
    supabase.from('exchange_rates_daily').select('day,rate').eq('from_currency', 'EUR').eq('to_currency', 'TRY').eq('source', 'api').gte('day', RELIABLE_FROM),
    supabase.from('exchange_rates_daily').select('day,rate').eq('from_currency', 'USD').eq('to_currency', 'TRY').eq('source', 'api').gte('day', RELIABLE_FROM),
  ]);
  if (wdRes.error) throw new Error(wdRes.error.message);
  if (!kasa) throw new Error('kasa yok');
  const policy = !policyRes.error && policyRes.data ? policyRes.data as SalaryPolicyRow : null;
  const moves = !movesRes.error && movesRes.data ? movesRes.data : [];
  return assembleMonthSalaryInputs({
    asOfMonth,
    poolEUR: salary?.poolOutEUR ?? 0,
    realGainEUR: salary?.realGainEUR ?? 0,
    kasaEUR: kasa.totalEurNow,
    policy,
    moves,
    withdrawals: (wdRes.data || []) as SalaryWithdrawalRow[],
    eurRates: ratePoints(eurRes.data),
    usdRates: ratePoints(usdRes.data),
  });
}
