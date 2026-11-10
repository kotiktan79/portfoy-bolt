import { describe, expect, it } from 'vitest';
import { keepHoldings, keepPrevious } from './refreshData';
import { salaryHoldings } from '../test/helpers/salaryFixture';

describe('görünür değer değişmediyse referans korunur', () => {
  it('nesne alan sırası ve yeni kopyalar değişiklik sayılmaz', () => {
    const prev = { price: 100, currency: 'EUR' };
    expect(keepPrevious(prev, { currency: 'EUR', price: 100 })).toBe(prev);
    expect(keepPrevious(prev, { currency: 'EUR', price: 101 })).not.toBe(prev);
  });
  it('aynı gün yalnız otomatik fiyat damgası sayfayı güncellemez; gün, adet ve manuel fiyat tarihi korunur', () => {
    const prev = salaryHoldings.map(h => ({ ...h, updated_at: '2028-01-10T12:00:00Z' }));
    expect(keepHoldings(prev, prev.map(h => ({ ...h, updated_at: '2028-01-10T12:05:00Z' })))).toBe(prev);
    expect(keepHoldings(prev, prev.map(h => ({ ...h, updated_at: '2028-01-11T12:00:00Z' })))).not.toBe(prev);
    expect(keepHoldings(prev, prev.map(h => ({ ...h, quantity: h.quantity + 1 })))).not.toBe(prev);
    expect(keepHoldings(prev, prev.map(h => ({ ...h, manual_price_updated_at: '2028-01-10T12:05:00Z' })))).not.toBe(prev);
  });
});
