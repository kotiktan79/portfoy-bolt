import { supabase, type Holding } from '../lib/supabase';
import { getDynamicSalary, getSalaryAccrual, getMonthToDate } from './salaryService';
import { getKasaFx } from './kasaFxService';
import { normalizeInflation, RELIABLE_FROM } from '../lib/eurPnl';
import { parseSalaryRule } from '../lib/spendDownSalary';
import type { SalaryPlanInput } from '../lib/salaryPlan';

export interface SalaryWithdrawal {
  id: string; withdrawn_at: string; amount_usd: number; amount_eur?: number | null; note: string | null;
  source_symbol: string | null; source_quantity_deducted: number | null;
}

/** Cüzdanın mevcut okumaları; React state'i veya yazma işlemi yok. */
export async function loadWalletView(holdings: Holding[]) {
  const [salary, accrual, mtd, withdrawals, pol, moves, eur, usd, kasa] = await Promise.all([
    getDynamicSalary(holdings), getSalaryAccrual(), getMonthToDate(),
    supabase.from('salary_withdrawals').select('*').order('withdrawn_at', { ascending: false }).limit(200),
    supabase.from('portfoy_bolt_salary_policy').select('*').eq('id', 1).maybeSingle(),
    supabase.from('portfoy_bolt_kasa_salary_moves').select('kind,amount_eur'),
    supabase.from('exchange_rates_daily').select('day,rate').eq('from_currency', 'EUR').eq('to_currency', 'TRY').eq('source', 'api').gte('day', RELIABLE_FROM),
    supabase.from('exchange_rates_daily').select('day,rate').eq('from_currency', 'USD').eq('to_currency', 'TRY').eq('source', 'api').gte('day', RELIABLE_FROM),
    getKasaFx(),
  ]);
  for (const result of [withdrawals, pol, moves, eur, usd]) {
    if (result.error) throw new Error(result.error.message);
  }
  const n = (v: unknown) => v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v);
  const policy: Partial<SalaryPlanInput> = pol.data ? {
    floorEUR: n(pol.data.floor_eur), capEUR: n(pol.data.cap_eur), kasaMinEUR: n(pol.data.kasa_floor_eur),
    refillRatio: n(pol.data.kasa_refill_ratio), kasaStartEUR: n(pol.data.kasa_start_eur),
    salaryStartMonth: pol.data.salary_start_month || undefined,
  } : {};
  return {
    salary, accrual, mtd, withdrawals: (withdrawals.data || []) as SalaryWithdrawal[], policy,
    ruleCfg: parseSalaryRule(pol.data?.inflation_decisions), inflationAnnual: normalizeInflation(pol.data?.inflation_annual),
    kasaMoves: (moves.data || []) as Array<{ kind: string; amount_eur: number | null }>,
    eurRates: eur.data || [], usdRates: usd.data || [], kasa,
  };
}
