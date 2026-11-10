import type { Holding } from '../../lib/supabase';

export const salaryRule = {
  mode: 'spend_down', realRate: .025, bufferEUR: 40000, endYear: 2068,
  smoothing: .5, floorEUR: 400, capEUR: null, includeKasa: false, kasaRefill: false,
  years: { '2027': { monthlyEUR: 420, targetEUR: 420, portfolioEUR: 0, yearsLeft: 41, indexApplied: 1, fixedAt: '2027-01-01' } },
};
const holding = (id: string, symbol: string, asset_type: Holding['asset_type'], quantity: number, current_price: number, currency = 'EUR'): Holding => ({
  id, symbol, asset_type, quantity, current_price, currency, purchase_price: current_price,
  created_at: '2026-01-01', updated_at: '2028-01-10',
});
export const salaryHoldings = [
  holding('e', 'EURO', 'currency', 7500, 50, 'TRY'),
  holding('v', 'VWCE', 'stock', 1, 92390),
  holding('x', 'XEON', 'money_market', 1, 110),
  holding('u', 'USD', 'currency', 0, 45, 'TRY'),
];
export function salaryTables(): Record<string, any[]> {
  const days = Array.from({ length: 41 }, (_, i) => new Date(Date.UTC(2027, 11, 1 + i)).toISOString().slice(0, 10));
  return {
    holdings: salaryHoldings,
    portfoy_bolt_salary_policy: [{ id: 1, floor_eur: 400, cap_eur: 1000, inflation_annual: .03, salary_start_month: '2027-04', inflation_decisions: { salary_rule: salaryRule } }],
    cash_balances: [{ id: 'cash', currency: 'EUR', balance: 16000, total_deposits: 1000, total_withdrawals: 0 }],
    exchange_rates_daily: days.flatMap(day => ['EUR', 'USD'].map(from_currency => ({ day, from_currency, to_currency: 'TRY', rate: from_currency === 'EUR' ? 50 : 45, source: 'api' }))),
    exchange_rates: days.flatMap(day => ['EUR', 'USD'].map(from_currency => ({ recorded_at: `${day}T18:00:00Z`, from_currency, to_currency: 'TRY', rate: from_currency === 'EUR' ? 50 : 45, source: 'api' }))),
    portfolio_snapshots: days.map(snapshot_date => ({ id: snapshot_date, snapshot_date, total_value: snapshot_date < '2028-01-10' ? 5018643.5 : 5000000, total_investment: 5000000, created_at: `${snapshot_date}T18:00:00Z` })),
    price_history: days.flatMap(day => salaryHoldings.map(h => ({ id: day + h.id, holding_id: h.id, symbol: h.symbol, price: h.current_price, recorded_at: `${day}T18:00:00Z` }))),
    daily_reports: [{ report_date: '2028-01-10', pnl_eur_day: -372.87, wealth_eur: 100000, ai_model: 'off' }],
    salary_withdrawals: [], portfoy_bolt_kasa_salary_moves: [], income_records: [], transactions: [], cash_transactions: [],
  };
}

/** Yalnız bellek içi okuma. Her yazma girişimi testi durdurur. */
export function fakeReadClient(tables: Record<string, any[]>) {
  const calls: string[] = [];
  const from = (table: string) => {
    calls.push(table);
    let rows = [...(tables[table] || [])], start = 0, end = Infinity;
    const q: any = {
      select: () => q,
      eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return q; },
      gt: (key: string, value: any) => { rows = rows.filter(row => row[key] > value); return q; },
      gte: (key: string, value: any) => { rows = rows.filter(row => row[key] >= value); return q; },
      lt: (key: string, value: any) => { rows = rows.filter(row => row[key] < value); return q; },
      lte: (key: string, value: any) => { rows = rows.filter(row => row[key] <= value); return q; },
      in: (key: string, values: any[]) => { rows = rows.filter(row => values.includes(row[key])); return q; },
      not: (key: string, _op: string, value: unknown) => { rows = rows.filter(row => row[key] !== value); return q; },
      order: (key: string, opts?: { ascending?: boolean }) => { rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (opts?.ascending === false ? -1 : 1)); return q; },
      limit: (n: number) => { end = n - 1; return q; },
      range: (a: number, b: number) => { start = a; end = b; return q; },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: rows.slice(start, end + 1), error: null, count: rows.length }).then(resolve),
      insert: () => { throw new Error('Testte DB yazımı yasak'); },
      update: () => { throw new Error('Testte DB yazımı yasak'); },
      upsert: () => { throw new Error('Testte DB yazımı yasak'); },
      delete: () => { throw new Error('Testte DB yazımı yasak'); },
    };
    return q;
  };
  return { from, calls };
}
