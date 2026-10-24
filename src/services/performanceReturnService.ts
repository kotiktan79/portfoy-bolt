// Dönem ve kuruluştan bugüne getiri — para ağırlıklı, kasa defterinden.
// Snapshot total_deposits okunmaz. Maaş cetvelinin kâr rakamına dokunmaz.
import { supabase } from '../lib/supabase';
import { fetchAll, getEurDaily } from './eurPnlService';
import {
  externalFlowsFromLedger,
  modifiedDietz,
  type ExternalFlow,
  type MwrResult,
} from '../lib/moneyWeightedReturn';
import { RELIABLE_FROM } from '../lib/eurPnl';

export type { ExternalFlow, MwrResult };

let cache: { ts: number; flows: ExternalFlow[]; unpriced: number } | null = null;
const TTL = 5 * 60 * 1000;

const OTHER = ['GBP', 'CHF', 'RON', 'RUB'];

export async function getExternalFlows(): Promise<{ flows: ExternalFlow[]; unpriced: number }> {
  if (cache && Date.now() - cache.ts < TTL) return { flows: cache.flows, unpriced: cache.unpriced };
  const rateQ = (ccy: string) => () => supabase.from('exchange_rates_daily').select('day,rate,source')
    .eq('from_currency', ccy).eq('to_currency', 'TRY').in('source', ['api', 'ecb']).order('day', { ascending: true });
  const [txs, eurRows, usdRows, others] = await Promise.all([
    fetchAll<{ created_at: string; currency: string | null; transaction_type: string | null; amount: number | null }>(
      'cashFlows',
      () => supabase.from('cash_transactions').select('created_at,currency,transaction_type,amount').order('created_at', { ascending: true }).order('id', { ascending: true }),
    ),
    fetchAll<{ day: string; rate: number; source: string }>('flowEur', rateQ('EUR')),
    fetchAll<{ day: string; rate: number; source: string }>('flowUsd', rateQ('USD')),
    Promise.all(OTHER.map(c => fetchAll<{ day: string; rate: number; source: string }>(`flow${c}`, rateQ(c)))),
  ]);
  const points = (rows: Array<{ day: string; rate: number; source: string }>) => {
    const m = new Map<string, { rate: number; api: boolean }>();
    for (const r of rows) {
      const d = String(r.day).slice(0, 10);
      const prev = m.get(d);
      if (!prev || r.source === 'api') m.set(d, { rate: Number(r.rate), api: r.source === 'api' });
    }
    return [...m.entries()].map(([date, v]) => ({ date, rate: v.rate }));
  };
  const built = externalFlowsFromLedger(txs, {
    eur: points(eurRows),
    usd: points(usdRows),
    other: Object.fromEntries(OTHER.map((c, i) => [c, points(others[i])])),
  });
  cache = { ts: Date.now(), flows: built.flows, unpriced: built.unpriced };
  return { flows: built.flows, unpriced: built.unpriced };
}

export function invalidateExternalFlowCache() { cache = null; }

export interface PerformanceReturns {
  period: MwrResult | null;
  inception: MwrResult | null;
  unpriced: number;
}

/** Seçilen pencere ve kuruluştan (güvenilir serinin ilk günü) bugüne Modified Dietz. */
export async function getPerformanceReturns(periodStart: string | null, periodEnd: string | null): Promise<PerformanceReturns> {
  const [{ flows, unpriced }, daily] = await Promise.all([getExternalFlows(), getEurDaily()]);
  if (daily.length < 2) return { period: null, inception: null, unpriced };
  const first = daily[0];
  const last = daily[daily.length - 1];
  const inception = modifiedDietz({
    beginDate: first.date,
    endDate: last.date,
    beginValueEUR: first.wealthEUR,
    endValueEUR: last.wealthEUR,
    flows,
  });
  const start = periodStart && periodStart >= (first.date || RELIABLE_FROM) ? periodStart : first.date;
  const begin = daily.find(d => d.date >= start) || first;
  const end = periodEnd ? [...daily].reverse().find(d => d.date <= periodEnd) || last : last;
  const period = begin.date === end.date ? null : modifiedDietz({
    beginDate: begin.date,
    endDate: end.date,
    beginValueEUR: begin.wealthEUR,
    endValueEUR: end.wealthEUR,
    flows,
  });
  return { period, inception, unpriced };
}
