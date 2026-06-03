import { supabase } from '../lib/supabase';

export interface DailyReport {
  id: string;
  report_date: string;
  portfolio_value: number;
  portfolio_investment: number;
  portfolio_pnl: number;
  portfolio_pnl_pct: number;
  market_data: any;
  actions: any[];
  monthly_income: any;
  market_outlook: string;
  portfolio_diagnosis: string;
  top_pick: string;
  news_alerts: string[];
  wealth_building_tip: string;
  safe_monthly_income: number;
  moderate_monthly_income: number;
  ai_model: string;
  generation_time_ms: number;
  created_at: string;
  market_research?: {
    global_trend?: string;
    sector_analysis?: string;
    risk_environment?: string;
    fx_impact?: string;
    opportunities?: string;
  };
}

export interface MonthlySalary {
  id: string;
  salary_month: string;
  portfolio_value: number;
  safe_amount: number;
  moderate_amount: number;
  actual_income: number;
  withdrawn_amount: number;
  dividend_income: number;
  interest_income: number;
  staking_income: number;
  coupon_income: number;
  profit_taking_income: number;
  ai_recommendation: string;
  created_at: string;
}

export async function getLatestReport(): Promise<DailyReport | null> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .order('report_date', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

export async function getReportByDate(date: string): Promise<DailyReport | null> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('report_date', date)
    .single();

  if (error || !data) return null;
  return data;
}

export async function getReportHistory(days: number = 30): Promise<DailyReport[]> {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .order('report_date', { ascending: false })
    .limit(days);

  if (error || !data) return [];
  return data;
}

export async function getMonthlySalaryHistory(months: number = 12): Promise<MonthlySalary[]> {
  const { data, error } = await supabase
    .from('monthly_salary')
    .select('*')
    .order('salary_month', { ascending: false })
    .limit(months);

  if (error || !data) return [];
  return data;
}

export async function getIncomeRecords(days: number = 90) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('income_records')
    .select('*')
    .gte('income_date', startDate.toISOString().split('T')[0])
    .order('income_date', { ascending: false });

  if (error || !data) return [];
  return data;
}

// Manuel rapor tetikleme (UI'dan)
export async function triggerDailyReport(): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/cron/daily-report', { method: 'POST' });
    const data = await res.json();
    return { success: data.success, error: data.error };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Manuel snapshot tetikleme (UI'dan)
export async function triggerDailySnapshot(): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/cron/daily-snapshot', { method: 'POST' });
    const data = await res.json();
    return { success: data.success, error: data.error };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
