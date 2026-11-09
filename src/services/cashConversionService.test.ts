import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convertCash } from './cashConversionService';
import { ledgerFromTransactions } from '../lib/cashLedger';
import { externalFlowsFromLedger } from '../lib/moneyWeightedReturn';

const state = vi.hoisted(() => ({ balances: [] as any[], inserted: [] as any[], calls: [] as any[], failUpdate: 0, updates: 0, failInsert: false }));
vi.mock('../config', () => ({ ANON_USER_ID: 'owner' }));
vi.mock('./kasaFxService', () => ({ invalidateKasaFxCache: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { from(table: string) {
  let patch: any;
  const conditions: Record<string, unknown> = {};
  const q: any = {
    select: () => q, eq: (key: string, value: unknown) => { conditions[key] = value; return q; },
    order: async () => ({ data: structuredClone(state.balances), error: null }),
    update: (value: any) => { patch = value; return q; },
    single: async () => {
      state.updates++;
      if (state.failUpdate === state.updates) return { data: null, error: { message: 'failed' } };
      const index = state.balances.findIndex(b => Object.entries(conditions).every(([k, v]) => b[k] === v));
      if (index < 0) return { data: null, error: { message: 'concurrent change' } };
      state.calls.push({ conditions, patch });
      state.balances[index] = { ...state.balances[index], ...patch };
      return { data: structuredClone(state.balances[index]), error: null };
    },
    insert: async (rows: any[]) => {
      expect(table).toBe('cash_transactions');
      if (state.failInsert) return { error: { message: 'failed' } };
      state.inserted.push(...rows); return { error: null };
    },
  };
  return q;
} } }));

beforeEach(() => {
  state.balances = ['EUR', 'USD'].map(currency => ({ id: currency, user_id: 'owner', currency, balance: 100, total_deposits: 100, total_withdrawals: 0, realized_profit: 7, updated_at: 'original' }));
  state.inserted = []; state.calls = []; state.failUpdate = 0; state.updates = 0; state.failInsert = false;
});
describe('kasa çevirme kaydı (yalnız mock DB)', () => {
  it('iki bağlı hareket yazar; defter toplamlarını günceller; dış nakit akışı üretmez', async () => {
    await convertCash('EUR', 'USD', 10, 11);
    expect(state.inserted).toHaveLength(2);
    expect(state.inserted[0].notes).toBe(state.inserted[1].notes);
    expect(state.inserted.map(t => [t.transaction_type, t.balance_after])).toEqual([['buy', 90], ['sell', 111]]);
    const rows = ledgerFromTransactions(state.inserted);
    expect(rows.find(r => r.currency === 'EUR')?.withdrawals).toBe(10);
    expect(rows.find(r => r.currency === 'USD')?.deposits).toBe(11);
    expect(externalFlowsFromLedger(state.inserted, { eur: [], usd: [] }).flows).toEqual([]);
    expect(state.balances.map(b => b.realized_profit)).toEqual([7, 7]);
    expect(state.calls.every(c => c.conditions.user_id === 'owner' && c.conditions.updated_at)).toBe(true);
  });
  it('ikinci bacak reddedilirse ilkini geri alır ve hareket yazmaz', async () => {
    state.failUpdate = 2;
    await expect(convertCash('EUR', 'USD', 10, 11)).rejects.toThrow('Kasa değişmiş');
    expect(state.balances.map(b => b.balance)).toEqual([100, 100]);
    expect(state.inserted).toEqual([]);
  });
  it('hareket kaydı reddedilirse her iki bakiyeyi geri alır', async () => {
    state.failInsert = true;
    await expect(convertCash('EUR', 'USD', 10, 11)).rejects.toThrow('kaydedilemedi');
    expect(state.balances.map(b => [b.balance, b.total_deposits, b.total_withdrawals])).toEqual([[100, 100, 0], [100, 100, 0]]);
  });
});
