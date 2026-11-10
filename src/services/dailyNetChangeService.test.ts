import { describe, expect, it, vi } from 'vitest';
import { loadDailyChangeBasis } from './dailyNetChangeService';
import { salaryTables } from '../test/helpers/salaryFixture';
const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }));
vi.mock('../lib/supabase', async () => {
  const { fakeReadClient } = await import('../test/helpers/salaryFixture');
  return { supabase: { from: (table: string) => fakeReadClient(state.tables).from(table) } };
});
describe('günlük değişim okuması', () => {
  it('resmi kapanış bulunduğunda eski fiyat/kur verisine ihtiyaç duymaz', async () => {
    state.tables = salaryTables();
    delete state.tables.price_history; delete state.tables.exchange_rates_daily;
    const b = await loadDailyChangeBasis('2028-01-10');
    expect(b.report?.pnl_eur_day).toBe(-372.87); expect(b.snap).toBeNull();
  });
  it('açık günün başlangıcı önceki snapshot ve o kapanışın euro kurudur', async () => {
    state.tables = salaryTables();
    state.tables.price_history.push({ symbol: 'EURO', holding_id: 'e', price: 53, recorded_at: '2028-01-11T10:00:00Z' });
    const b = await loadDailyChangeBasis('2028-01-11');
    expect(b.snap?.d).toBe('2028-01-10'); expect(b.snap?.eurRate).toBe(50);
  });
  it('kapanış fiyatı eksikse aynı günün kur satırı; o da yoksa bugünkü kur kullanılmaz', async () => {
    state.tables = salaryTables(); state.tables.price_history = [];
    expect((await loadDailyChangeBasis('2028-01-11')).snap?.eurRate).toBe(50);
    state.tables.exchange_rates_daily = [];
    expect((await loadDailyChangeBasis('2028-01-11')).snap?.eurRate).toBeNull();
  });
});
