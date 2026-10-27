// Romanya ev tadilatı satırlarını okur. Yazmaz.
// Kasa çekimleri: transaction_type = withdrawal ve notta tadilat veya remont.
// Böylece aynı notla yazılan sonraki tadilat çekimleri de listeye girer.
// 3 Temmuz penceresi, notu boş kalmış tekil tutar için yedek okumadır.
// RON → EUR: exchange_rates_daily, source=api, para biriminin TRY kuru.
// Harcama gününde hem o birim hem EUR varsa o gün; yoksa serinin son günü.

import { dayInTZ } from '../lib/eurPnl';
import { supabase } from '../lib/supabase';
import {
  APP_DATA_START,
  buildRenovationSummary,
  normRenovationCurrency,
  summaryFromRecords,
  type RateRow,
  type RenovationSummary,
} from '../lib/romaniaRenovation';

const WINDOW_START = '2026-07-01T00:00:00.000Z';
const WINDOW_END = '2026-07-05T00:00:00.000Z';

type CashRow = {
  id?: string | number | null;
  created_at?: string | null;
  currency?: string | null;
  amount?: number | string | null;
  notes?: string | null;
  transaction_type?: string | null;
};

function cashOf(res: { error: { message?: string } | null; data: CashRow[] | null }): CashRow[] {
  if (res.error || !res.data) return [];
  return res.data;
}

export async function loadRomaniaRenovation(): Promise<RenovationSummary> {
  try {
    const [notedRes, julyCashRes, julyTxRes] = await Promise.all([
      supabase
        .from('cash_transactions')
        .select('id,created_at,currency,amount,notes,transaction_type')
        .eq('transaction_type', 'withdrawal')
        .or('notes.ilike.%tadilat%,notes.ilike.%remont%'),
      supabase
        .from('cash_transactions')
        .select('id,created_at,currency,amount,notes,transaction_type')
        .gte('created_at', WINDOW_START)
        .lt('created_at', WINDOW_END),
      supabase
        .from('transactions')
        .select('transaction_date,currency,total_amount,notes')
        .gte('transaction_date', WINDOW_START)
        .lt('transaction_date', WINDOW_END),
    ]);

    const cash = [...cashOf(notedRes), ...cashOf(julyCashRes)];
    const currencies = new Set<string>(['EUR', 'RON']);
    const days = new Set<string>(['2026-07-03']);
    for (const row of cash) {
      const c = normRenovationCurrency(row.currency);
      if (c && c !== 'EUR' && c !== 'TRY') currencies.add(c);
      const day = dayInTZ(String(row.created_at || ''));
      if (day && day >= APP_DATA_START) days.add(day);
    }

    const latest = (currency: string) => supabase
      .from('exchange_rates_daily')
      .select('day,from_currency,rate')
      .eq('to_currency', 'TRY')
      .eq('source', 'api')
      .eq('from_currency', currency)
      .order('day', { ascending: false })
      .limit(1);
    const onDay = (currency: string, day: string) => supabase
      .from('exchange_rates_daily')
      .select('day,from_currency,rate')
      .eq('to_currency', 'TRY')
      .eq('source', 'api')
      .eq('from_currency', currency)
      .eq('day', day)
      .limit(1);

    const rateJobs = [...currencies].flatMap(currency => [
      latest(currency),
      ...[...days].map(day => onDay(currency, day)),
    ]);
    const rateResults = await Promise.all(rateJobs);
    const rates: RateRow[] = [];
    for (const res of rateResults) {
      if (!res.error && res.data) rates.push(...res.data);
    }

    return summaryFromRecords({
      cash,
      transactions: julyTxRes.error ? [] : julyTxRes.data ?? [],
      rates,
    });
  } catch {
    return buildRenovationSummary({});
  }
}
