import { describe, it, expect } from 'vitest';
import { TARGET_ALLOCATION } from '../config/portfolioPolicy';
import {
  SAFE_TARGET_PCT, WEEKLY_BUY_EUR, EUR_CASH_RESERVE,
  buildWeeklyPlan, euroCashEUR, vwcePriceEUR, formatWeekCount, weeklyPlanCopy,
} from './buyPlan';

describe('haftalık alım planı', () => {
  it('güvenli taraf hedefi politika ile aynı %14', () => {
    expect(SAFE_TARGET_PCT).toBe(14);
    expect(SAFE_TARGET_PCT).toBe(TARGET_ALLOCATION.safe.target);
    expect(WEEKLY_BUY_EUR).toBe(1_000);
    expect(EUR_CASH_RESERVE).toBe(7_000);
  });

  it('€1.000 tamamı VWCE; fiyat varsa adet', () => {
    const p = buildWeeklyPlan({ euroCashEUR: 37_000, safePct: 16, vwcePriceEUR: 125 });
    expect(p.destination).toBe('VWCE');
    expect(p.safeShort).toBe(false);
    expect(p.vwceEUR).toBe(1_000);
    expect(p.units).toBeCloseTo(8, 5);
    expect(p.investableEUR).toBe(30_000);
    expect(p.weeks).toBeCloseTo(30, 5);
    expect(weeklyPlanCopy(p).unitsLine).toContain('8');
    expect(weeklyPlanCopy(p).weekLine).toContain('VWCE');
    expect(weeklyPlanCopy(p).weekLine).not.toContain('XEON');
  });

  it('güvenli taraf %14 altındaysa bu hafta XEON; VWCE adedi yine yazılır', () => {
    const p = buildWeeklyPlan({ euroCashEUR: 12_000, safePct: 13.9, vwcePriceEUR: 100 });
    expect(p.destination).toBe('XEON');
    expect(p.safeShort).toBe(true);
    expect(p.vwceEUR).toBe(1_000);
    expect(p.units).toBeCloseTo(10, 5);
    const copy = weeklyPlanCopy(p);
    expect(copy.weekLine).toContain('XEON');
    expect(copy.unitsLine).toContain('VWCE');
    expect(copy.holdLine).toContain('V3YL');
  });

  it('tam %14 VWCE kalır; oran yoksa da VWCE', () => {
    expect(buildWeeklyPlan({ euroCashEUR: 8_000, safePct: 14 }).destination).toBe('VWCE');
    expect(buildWeeklyPlan({ euroCashEUR: 8_000, safePct: null }).destination).toBe('VWCE');
    expect(buildWeeklyPlan({ euroCashEUR: 8_000 }).safeShort).toBe(false);
  });

  it('€7.000 kenarda kalır; altı boş, üstü haftaya bölünür', () => {
    const none = buildWeeklyPlan({ euroCashEUR: 7_000, safePct: 20 });
    expect(none.investableEUR).toBe(0);
    expect(none.weeks).toBe(0);
    expect(weeklyPlanCopy(none).cashLine).toContain('yatırılacak tutar yok');

    const under = buildWeeklyPlan({ euroCashEUR: 6_400, safePct: 20 });
    expect(under.investableEUR).toBe(0);

    const bit = buildWeeklyPlan({ euroCashEUR: 7_400, safePct: 20 });
    expect(bit.investableEUR).toBe(400);
    expect(bit.weeks).toBeCloseTo(0.4, 5);
    expect(formatWeekCount(bit.weeks)).toBe('1 haftadan az');
    expect(formatWeekCount(23)).toBe('yaklaşık 23 hafta');
  });

  it('fiyat yoksa adet null, uydurma adet yok', () => {
    const p = buildWeeklyPlan({ euroCashEUR: 10_000, safePct: 20, vwcePriceEUR: null });
    expect(p.units).toBeNull();
    expect(p.priceEUR).toBeNull();
    expect(weeklyPlanCopy(p).unitsLine).toContain('adet hesaplanamadı');
  });

  it('EUR nakit: TRY kur satırında adet, EUR birim fiyatta adet × fiyat', () => {
    expect(euroCashEUR([
      { symbol: 'EURO', asset_type: 'currency', currency: 'TRY', quantity: 37_550, current_price: 53.46 },
      { symbol: 'USD', asset_type: 'currency', currency: 'TRY', quantity: 10_000, current_price: 40 },
      { symbol: 'EUR', asset_type: 'currency', currency: 'EUR', quantity: 100, current_price: 1 },
    ])).toBeCloseTo(37_650, 5);
    expect(vwcePriceEUR([
      { symbol: 'VWCE', currency: 'EUR', quantity: 3, current_price: 140.5 },
    ])).toBeCloseTo(140.5, 5);
    expect(vwcePriceEUR([
      { symbol: 'VWCE', currency: 'TRY', quantity: 3, current_price: 7_000 },
    ], 50)).toBeCloseTo(140, 5);
    expect(vwcePriceEUR([])).toBeNull();
  });
});
