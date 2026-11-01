import { describe, it, expect } from 'vitest';
import { costBasisForWrite, openCostNative } from './openPosition';

describe('costBasisForWrite — holdings.cost_basis senkronu', () => {
  it('VWCE: 3 alım sonrası toplam maliyet = adet × ortalama (≈ €2.280)', () => {
    const qty = 3.0040439 + 4.48166057 + 5.93225366;
    const avg = (520 + 760 + 1000) / qty;
    expect(costBasisForWrite(qty, avg)).toBeCloseTo(2280, 4);
  });

  it('EURO: satış sonrası kalan adet × maliyet kuru (TL)', () => {
    expect(costBasisForWrite(26500.99800349, 48.1502)).toBeCloseTo(1276028.354, 2);
  });

  it('openCostNative ile aynı sonucu verir', () => {
    const h = { quantity: 13.41795813, purchase_price: 169.9215 };
    expect(costBasisForWrite(h.quantity, h.purchase_price)).toBeCloseTo(openCostNative(h), 6);
  });

  it('kapalı / geçersiz pozisyonda 0', () => {
    expect(costBasisForWrite(0, 100)).toBe(0);
    expect(costBasisForWrite(1e-10, 100)).toBe(0);
    expect(costBasisForWrite(-1, 100)).toBe(0);
    expect(costBasisForWrite(null, 100)).toBe(0);
    expect(costBasisForWrite(5, null)).toBe(0);
    expect(costBasisForWrite('2', '10.5')).toBe(21);
  });
});
