import { describe, it, expect } from 'vitest';
import { splitBuy, pacePerMonth, sumInvestedEUR, buyProgress, priceDropPct, BUY_TARGET_EUR } from './buyPlan';

describe('esnek alım planı', () => {
  it('€1.000 → €760 VWCE, €160 V3YL, €80 XEON', () => {
    const s = splitBuy(1000);
    expect(s.VWCE).toBeCloseTo(760, 5);
    expect(s.V3YL).toBeCloseTo(160, 5);
    expect(s.XEON).toBeCloseTo(80, 5);
    expect(s.dipped).toBe(false);
    expect(s.VWCE + s.V3YL + s.XEON).toBeCloseTo(1000, 5);
  });

  it('VWCE son 7 günde %10\'dan fazla düştüyse XEON diliminin yarısı VWCE\'ye eklenir', () => {
    const s = splitBuy(1000, -12);
    expect(s.dipped).toBe(true);
    expect(s.VWCE).toBeCloseTo(800, 5);
    expect(s.V3YL).toBeCloseTo(160, 5);
    expect(s.XEON).toBeCloseTo(40, 5);
    expect(splitBuy(1000, -9.9).dipped).toBe(false);
    expect(splitBuy(1000, null).dipped).toBe(false);
  });

  it('ilerleme yatırılan alışlardan gelir; plan öncesi ve başka semboller sayılmaz', () => {
    const invested = sumInvestedEUR([
      { symbol: 'V3YL', amountEUR: 5_000, date: '2026-09-01' },
      { symbol: 'VWCE', amountEUR: 7_600, date: '2026-10-20' },
      { symbol: 'v3yl', amountEUR: 1_600, date: '2026-11-02' },
      { symbol: 'XEON', amountEUR: 800, date: '2026-11-02' },
      { symbol: 'AAPL', amountEUR: 9_000, date: '2026-11-02' },
    ]);
    expect(invested).toBe(10_000);
    const p = buyProgress(invested);
    expect(p.remainingEUR).toBe(BUY_TARGET_EUR - 10_000);
    expect(p.pct).toBeCloseTo((10_000 / 52_000) * 100, 5);
  });

  it('hedef tarihe göre aylık hız; tarih geçtiyse nazik bilgi, sıfır bölme yok', () => {
    const pace = pacePerMonth(52_000, new Date('2026-10-13T00:00:00Z'));
    expect(pace.pastDue).toBe(false);
    expect(pace.monthsLeft).toBeGreaterThan(5);
    expect(pace.perMonthEUR).toBeGreaterThan(0);
    expect(pace.perMonthEUR).toBeLessThan(52_000);

    const late = pacePerMonth(1_000, new Date('2027-04-02T00:00:00Z'));
    expect(late.pastDue).toBe(true);
    expect(late.perMonthEUR).toBe(1_000);
    expect(Number.isFinite(late.perMonthEUR)).toBe(true);
  });

  it('fiyat düşüşü yüzdesi', () => {
    expect(priceDropPct(100, 89)).toBeCloseTo(-11, 5);
    expect(priceDropPct(0, 10)).toBeNull();
  });
});
