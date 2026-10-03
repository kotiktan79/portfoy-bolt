import { describe, it, expect } from 'vitest';
import { priceWriteGuard, PRICE_BANDS } from './priceGuard';

describe('priceWriteGuard', () => {
  it('3 Ekim altın olayını engeller: 6.579,57 → 5.213,08 (−%20,8) yazılmaz', () => {
    const v = priceWriteGuard('commodity', 6579.57, 5213.0834);
    expect(v.blocked).toBe(true);
    expect(v.deviation!).toBeCloseTo(0.2077, 3);
  });

  it('altının gerçek günlük hareketi geçer: 6.579,57 → 6.633,41 (+%0,8)', () => {
    expect(priceWriteGuard('commodity', 6579.57, 6633.4101).blocked).toBe(false);
  });

  it('emtia bandı tam sınırda: %10 geçer, %10,01 geçmez', () => {
    expect(priceWriteGuard('commodity', 100, 110).blocked).toBe(false);
    expect(priceWriteGuard('commodity', 100, 110.01).blocked).toBe(true);
  });

  it('24 Eylül kur olayını engeller: 49,13 → 44 ve 55,29 → 51', () => {
    expect(priceWriteGuard('currency', 49.13, 44).blocked).toBe(true);
    expect(priceWriteGuard('currency', 55.29, 51).blocked).toBe(true);
  });

  it('kurun gerçek günlük hareketi geçer: 49,02 → 49,13', () => {
    expect(priceWriteGuard('currency', 49.02, 49.1349).blocked).toBe(false);
  });

  it('1’in altındaki kuru da korur (RUB 0,58) — eski kod >1 şartıyla atlıyordu', () => {
    expect(priceWriteGuard('currency', 0.58, 0.40).blocked).toBe(true);
    expect(priceWriteGuard('currency', 0.58, 0.59).blocked).toBe(false);
  });

  it('hisse/kripto/fon BANTSIZ: gerçek %20 hareket bastırılmaz', () => {
    for (const t of ['stock', 'crypto', 'fund', 'eurobond']) {
      expect(priceWriteGuard(t, 100, 180).blocked).toBe(false);
      expect(priceWriteGuard(t, 100, 20).blocked).toBe(false);
    }
  });

  it('fiyat yoksa/0/NaN ise karar vermez — "bilmiyorum" ile "bant dışı" karışmaz', () => {
    expect(priceWriteGuard('commodity', 6579.57, null).blocked).toBe(false);
    expect(priceWriteGuard('commodity', 6579.57, 0).blocked).toBe(false);
    expect(priceWriteGuard('commodity', 6579.57, NaN).blocked).toBe(false);
    expect(priceWriteGuard('commodity', 6579.57, undefined).blocked).toBe(false);
  });

  it('ilk fiyatta kıyas yok: eski fiyat 0 ise yazmaya izin verir', () => {
    expect(priceWriteGuard('commodity', 0, 6579.57).blocked).toBe(false);
  });

  it('bantlar belgelenen değerlerde', () => {
    expect(PRICE_BANDS).toEqual({ currency: 0.05, commodity: 0.10 });
  });
});
