import { describe, it, expect } from 'vitest';
import { dailyNetChange } from './dailyNetChange';
describe('dailyNetChange', () => {
  it('euro ve yüzde', () => {
    const r = dailyNetChange(8_309_385, 8_300_566.35, 56.22449, '2026-11-04', 56.22449)!;
    expect(r.changeEUR).toBeCloseTo(156.85, 1);
    expect(r.changePct).toBeCloseTo(0.1062, 3);
  });
  it('kur veya kayıt yoksa null', () => {
    expect(dailyNetChange(100, null, 50, 'x', 50)).toBeNull();
    expect(dailyNetChange(100, 90, 0, 'x', 50)).toBeNull();
  });
});

describe('dünün kuru', () => {
  it('kur değişse de EUR serveti sabitse tahmini kazanç sıfırdır', () => {
    expect(dailyNetChange(530000, 500000, 53, '2026-11-09', 50)?.changeEUR).toBe(0);
  });
  it('eski kur bilinmiyorsa bugünkü kurla doldurmaz', () => {
    expect(dailyNetChange(530000, 500000, 53, '2026-11-09', 0)).toBeNull();
  });
});
