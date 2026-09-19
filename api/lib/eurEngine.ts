// EUR kâr motoru — SUNUCU tarafı yükleyici (cron'lar). Hesabın kendisi src/lib/eurPnl.ts'te;
// uygulama (src/services/eurPnlService.ts) ile birebir aynı fonksiyon → aynı rakam.
// Satır limiti: PostgREST max_rows=1000 tavanı .range()'i EZER → kur serisi exchange_rates_daily görünümünden okunur,
// diğer tablolar fetchAll() ile sayfalanır.
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildEurModel, summarizeEur, RELIABLE_FROM, INFLATION_EUR, ROW_CAP, type EurModel, type EurSummary, type MonthRow } from '../../src/lib/eurPnl.js';

export { RELIABLE_FROM, INFLATION_EUR };
export type { EurModel, EurSummary, MonthRow };

/** PostgREST max_rows=1000 tavanını sayfalayarak aşar (.range tek başına YETMEZ — tavan sunucuda). */
async function fetchAll<T>(name: string, build: () => any): Promise<T[]> {
  // Sunucu max_rows'u ROW_CAP'ten KÜÇÜK olabilir → 'kısa sayfa = bitti' varsayımı seriyi sessizce yarım bırakır.
  // Bu yüzden boş sayfa görene kadar devam edilir (fazladan tek istek, karşılığında kesilme riski yok).
  const out: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await build().range(from, from + ROW_CAP - 1);
    if (error) throw new Error(`eurEngine ${name}: ${error.message}`);
    const rows = (data || []) as T[];
    if (rows.length === 0) return out;
    out.push(...rows);
    from += rows.length;
    if (out.length > 200_000) throw new Error(`eurEngine ${name}: beklenmedik satır sayısı`);
  }
}

export async function loadEurModel(supabase: SupabaseClient): Promise<EurModel> {
  const dailyRows = (rows: Array<{ day: string; rate: number }>) => rows.map(r => ({ recorded_at: String(r.day), rate: Number(r.rate) }));
  const rateQ = (ccy: 'EUR' | 'USD') => () => supabase.from('exchange_rates_daily').select('day,rate')
    .eq('from_currency', ccy).eq('to_currency', 'TRY').eq('source', 'api').gte('day', RELIABLE_FROM).order('day', { ascending: true });
  const [snaps, eurRates, usdRates, txs, cashSells, holds] = await Promise.all([
    fetchAll<any>('snapshots', () => supabase.from('portfolio_snapshots').select('snapshot_date,total_value,total_investment,created_at').gte('snapshot_date', RELIABLE_FROM)
      .order('snapshot_date', { ascending: true }).order('created_at', { ascending: false }).order('id', { ascending: true })),
    fetchAll<{ day: string; rate: number }>('eur', rateQ('EUR')),
    fetchAll<{ day: string; rate: number }>('usd', rateQ('USD')),
    fetchAll<any>('tx', () => supabase.from('transactions').select('transaction_date,transaction_type,quantity,price,total_amount,realized_profit,holding_id').order('transaction_date', { ascending: true }).order('id', { ascending: true })),
    fetchAll<any>('cashSells', () => supabase.from('cash_transactions').select('created_at,currency,notes').eq('transaction_type', 'sell').order('created_at', { ascending: true }).order('id', { ascending: true })),
    fetchAll<any>('holdings', () => supabase.from('holdings').select('id,symbol,currency,quantity,purchase_price,cost_basis,created_at').order('id', { ascending: true })),
  ]);
  const usdNow = usdRates.length ? Number(usdRates[usdRates.length - 1].rate) : 45;
  return buildEurModel({
    snapshots: snaps, eurRates: dailyRows(eurRates), usdRates: dailyRows(usdRates),
    transactions: txs, cashSells, holdings: holds,
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
// tek hassasiyet (2 hane): ekran, e-posta ve Telegram aynı yüzdeyi yazsın
export const fmtSignedPct = (n: number, dec = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(dec)}%`;
