// 3 Temmuz 2026 tadilat satırlarını okur. Yazmaz.
// Birincil kaynak cash_transactions (created_at, currency, amount).
// O tabloda tekil eşleşme yoksa transactions (transaction_date, currency, total_amount).
// RON → EUR: exchange_rates_daily, source=api, para biriminin TRY kuru (kasa ekranıyla aynı seri).

import { supabase } from '../lib/supabase';
import { buildRenovationSummary, summaryFromRecords, type RenovationSummary } from '../lib/romaniaRenovation';

const WINDOW_START = '2026-07-01T00:00:00.000Z';
const WINDOW_END = '2026-07-05T00:00:00.000Z';

export async function loadRomaniaRenovation(): Promise<RenovationSummary> {
  try {
    const latestRate = (currency: string) => supabase
      .from('exchange_rates_daily')
      .select('day,from_currency,rate')
      .eq('to_currency', 'TRY')
      .eq('source', 'api')
      .eq('from_currency', currency)
      .order('day', { ascending: false })
      .limit(1)
      .maybeSingle();

    const [cashRes, txRes, eurRes, ronRes] = await Promise.all([
      supabase
        .from('cash_transactions')
        .select('created_at,currency,amount,notes')
        .gte('created_at', WINDOW_START)
        .lt('created_at', WINDOW_END),
      supabase
        .from('transactions')
        .select('transaction_date,currency,total_amount,notes')
        .gte('transaction_date', WINDOW_START)
        .lt('transaction_date', WINDOW_END),
      latestRate('EUR'),
      latestRate('RON'),
    ]);

    const rates = [];
    if (!eurRes.error && eurRes.data) rates.push(eurRes.data);
    if (!ronRes.error && ronRes.data) rates.push(ronRes.data);

    return summaryFromRecords({
      cash: cashRes.error ? [] : cashRes.data ?? [],
      transactions: txRes.error ? [] : txRes.data ?? [],
      rates,
    });
  } catch {
    return buildRenovationSummary({});
  }
}
