// EUR kâr motoru — SUNUCU tarafı yükleyici (cron'lar). Hesabın kendisi src/lib/eurPnl.ts'te;
// uygulama (src/services/eurPnlService.ts) ile birebir aynı fonksiyon → aynı rakam.
// Satır limiti: PostgREST max_rows=1000 tavanı .range()'i EZER → kur serisi exchange_rates_daily görünümünden okunur.
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildEurModel, summarizeEur, type EurModel, type EurSummary, type MonthRow } from '../../src/lib/eurPnl.js';

export const RELIABLE_FROM = '2026-04-06';   // EUR/USD 'api' kur serisinin başladığı gün (eurPnlService ile aynı)
export const INFLATION_EUR = 0.02;           // sabit, yıllık (kullanıcı kararı 2026-09-19)
export type { EurModel, EurSummary, MonthRow };

export async function loadEurModel(supabase: SupabaseClient): Promise<EurModel> {
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
  for (const [name, r] of [['snapshots', snapRes], ['eur', eurRes], ['usd', usdRes], ['tx', txRes], ['cashSells', rzCashRes], ['holdings', holdRes]] as const) {
    if (r.error) throw new Error(`eurEngine ${name}: ${r.error.message}`);
  }
  const dailyRows = (rows: Array<{ day: string; rate: number }> | null) => (rows || []).map(r => ({ recorded_at: String(r.day), rate: Number(r.rate) }));
  const usdRows = dailyRows(usdRes.data);
  const usdNow = usdRows.length ? usdRows[usdRows.length - 1].rate : 45;
  return buildEurModel({
    snapshots: snapRes.data || [], eurRates: dailyRows(eurRes.data), usdRates: usdRows,
    transactions: txRes.data || [], cashSells: rzCashRes.data || [], holdings: holdRes.data || [],
    usdNow, reliableFrom: RELIABLE_FROM, annualInflation: INFLATION_EUR,
  });
}

export async function loadEurSummary(supabase: SupabaseClient, todayStr: string): Promise<EurSummary> {
  return summarizeEur(await loadEurModel(supabase), todayStr.slice(0, 7));
}

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const monthLabelTR = (ym: string) => `${MONTHS_TR[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const fmtEUR = (n: number, dec = 0) => `€${(Math.abs(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
export const fmtSignedEUR = (n: number, dec = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtEUR(n, dec)}`;
