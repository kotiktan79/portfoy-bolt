import { beforeEach, describe, expect, it, vi } from 'vitest';

type Op = { op: string; args: unknown[] };
const calls: Array<{ table: string; ops: Op[] }> = [];

const julyCash = [
  { id: 55, created_at: '2026-07-03T06:00:00Z', currency: 'EUR', amount: 3500, notes: 'Ev tadilatı/remont harcaması', transaction_type: 'withdrawal' },
  { id: 58, created_at: '2026-07-03T08:00:00Z', currency: 'EUR', amount: 4050, notes: 'Ev remontu harcaması', transaction_type: 'withdrawal' },
  { id: 56, created_at: '2026-07-02T22:30:00Z', currency: 'RON', amount: 25000, notes: 'Ev tadilatı harcaması', transaction_type: 'withdrawal' },
];

const noted = [
  ...julyCash,
  { id: 90, created_at: '2026-11-02T09:00:00Z', currency: 'EUR', amount: 1200, notes: 'mutfak remont', transaction_type: 'withdrawal' },
];

function builder(table: string) {
  const ops: Op[] = [];
  calls.push({ table, ops });
  const api: Record<string, unknown> = {};
  const chain = (op: string) => (...args: unknown[]) => {
    ops.push({ op, args });
    return api;
  };
  for (const op of ['select', 'eq', 'gte', 'lt', 'or', 'in', 'order', 'limit']) api[op] = chain(op);
  api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
    const data = table === 'exchange_rates_daily'
      ? [
          { day: '2026-07-03', from_currency: 'RON', rate: 9.84 },
          { day: '2026-07-03', from_currency: 'EUR', rate: 50 },
          { day: '2026-10-27', from_currency: 'RON', rate: 12 },
          { day: '2026-10-27', from_currency: 'EUR', rate: 50 },
        ]
      : table === 'transactions'
        ? []
        : noted;
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  };
  return api;
}

vi.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => builder(table) },
}));

import { loadRomaniaRenovation } from './romaniaRenovationService';

describe('tadilat okuması', () => {
  beforeEach(() => { calls.length = 0; });

  it('yalnız okur, çekimleri nota göre alır ve harcama günü kurunu kullanır', async () => {
    const summary = await loadRomaniaRenovation();
    const writes = calls.flatMap(c => c.ops.map(o => o.op)).filter(op =>
      ['insert', 'update', 'upsert', 'delete'].includes(op));
    expect(writes).toEqual([]);
    expect(calls.some(c => c.table === 'cash_transactions' && c.ops.some(o =>
      o.op === 'eq' && o.args[0] === 'transaction_type' && o.args[1] === 'withdrawal'))).toBe(true);
    expect(calls.some(c => c.table === 'cash_transactions' && c.ops.some(o =>
      o.op === 'or' && String(o.args[0]).includes('tadilat') && String(o.args[0]).includes('remont')))).toBe(true);
    expect(calls.some(c => c.table === 'exchange_rates_daily' && c.ops.some(o => o.op === 'select'))).toBe(true);

    const ron = summary.lines.find(l => l.currency === 'RON');
    expect(ron?.amountEUR).toBe(4_920);
    expect(ron?.fxKind).toBe('harcama-gunu');
    expect(summary.lines.map(l => l.amountEUR)).toEqual([20_000, 3_500, 4_050, 4_920, 1_200]);
    expect(summary.totalEUR).toBe(33_670);
    expect(summary.years.map(y => y.year)).toEqual([2025, 2026]);
  });
});
