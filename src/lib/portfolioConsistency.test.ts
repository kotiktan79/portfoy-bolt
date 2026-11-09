import { describe, expect, it } from 'vitest';
import { manualPriceWarning } from './manualPrice';
import { isHiddenPosition } from './openPosition';
import { conversionBalances, ledgerDifference } from '../services/cashConversionService';
import type { CashBalance } from './supabase';

const now = Date.parse('2026-11-09T12:00:00Z');
const balance = (currency: string, n = 100): CashBalance => ({ id: currency, user_id: 'owner', currency, balance: n, total_deposits: n, total_withdrawals: 0, realized_profit: 7, updated_at: '' });
describe('portföy tutarlılığı', () => {
  it('manuel fiyat: 7 gün sınırı, eksik tarih ve sıfır adet', () => {
    const h = { manual_price: true, quantity: 1, manual_price_updated_at: '2026-11-02T12:00:00Z' };
    expect(manualPriceWarning(h, now)).toBeNull();
    expect(manualPriceWarning(h, now + 1)).toBe('Fiyat 7 gün önce girildi, güncelle');
    expect(manualPriceWarning({ ...h, manual_price_updated_at: '2026-10-31T12:00:00Z' }, now)).toContain('9 gün');
    expect(manualPriceWarning({ ...h, manual_price_updated_at: null }, now)).toContain('bilinmiyor');
    expect(manualPriceWarning({ ...h, manual_price_updated_at: null, quantity: 0 }, now)).toBeNull();
    expect(manualPriceWarning({ ...h, manual_price: false }, now + 86400000)).toBeNull();
  });
  it('görünürlük: pozitif/negatif toz gizlenir, eşik ve küçük kripto kalır', () => {
    for (const quantity of [0, 1e-10, -1e-10]) expect(isHiddenPosition({ quantity })).toBe(true);
    for (const quantity of [1e-9, -1e-9, 0.00001]) expect(isHiddenPosition({ quantity })).toBe(false);
  });
  it('çevirme iki defteri dengede tutar; gerçekleşen kâra dokunmaz', () => {
    const from = balance('EUR'); const to = balance('USD', 20);
    const [a, b] = conversionBalances(from, to, 10, 11);
    expect([a.balance, a.total_withdrawals, b.balance, b.total_deposits]).toEqual([90, 10, 31, 31]);
    expect([ledgerDifference(a), ledgerDifference(b)]).toEqual([0, 0]);
    expect([a.realized_profit, b.realized_profit]).toEqual([7, 7]);
    expect(from.balance).toBe(100);
  });
  it('eski defter farkını korur; geçersiz ve yetersiz tutarı reddeder', () => {
    const from = { ...balance('EUR'), total_deposits: 80 };
    const [a] = conversionBalances(from, balance('USD'), 10, 11);
    expect(ledgerDifference(a)).toBe(20);
    expect(() => conversionBalances(from, balance('USD'), 101, 110)).toThrow();
    for (const n of [0, -1, NaN, Infinity]) expect(() => conversionBalances(from, balance('USD'), n, 1)).toThrow();
    expect(() => conversionBalances(from, balance('EUR'), 1, 1)).toThrow();
  });
});
