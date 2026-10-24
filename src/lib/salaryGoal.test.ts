import { describe, expect, it } from 'vitest';
import {
  CONSERVATIVE_WITHDRAWAL_PCT,
  PLANNED_WITHDRAWAL_PCT,
  fixedRealWithdrawalYears,
  roughYearsPhrase,
  salaryCoverage,
  salaryProgressPct,
} from './salaryGoal';

const resources = 148_249 + 29_400;

describe('aylık maaş hedefi', () => {
  it('planlanan çekim %5, muhafazakâr %4', () => {
    expect(PLANNED_WITHDRAWAL_PCT).toBe(5);
    expect(CONSERVATIVE_WITHDRAWAL_PCT).toBe(4);
  });

  it('durum yuvarlanmış euro ile: yetiyor / %10 altı sınırda / daha altı kısa', () => {
    expect(salaryCoverage(740.2, 700)).toBe('sürdürülebilir');
    expect(salaryCoverage(700, 700)).toBe('sürdürülebilir');
    expect(salaryCoverage(699.6, 700)).toBe('sürdürülebilir');
    expect(salaryCoverage(699.4, 700)).toBe('sınırda');
    expect(salaryCoverage(630, 700)).toBe('sınırda');
    expect(salaryCoverage(629.4, 700)).toBe('kısa geliyor');
    expect(salaryCoverage(0, 700)).toBe('kısa geliyor');
    expect(salaryCoverage(100, 0)).toBe('kısa geliyor');
    expect(salaryCoverage(Number.NaN, 700)).toBe('kısa geliyor');
  });

  it('ilerleme sürdürülebilir maaş / hedef; tavan yok', () => {
    const sustainable = resources * 0.05 / 12;
    expect(salaryProgressPct(sustainable, 700)).toBeCloseTo(105.743452, 4);
    expect(salaryProgressPct(0, 700)).toBe(0);
    expect(salaryProgressPct(500, 0)).toBe(0);
  });

  it('sabit €1.000, reel %1 ile bugünkü sermayede yaklaşık 16,0 yıl', () => {
    const years = fixedRealWithdrawalYears(resources, 1_000, 1);
    expect(years).not.toBeNull();
    expect(years!).toBeCloseTo(16.022, 2);
    expect(roughYearsPhrase(years)).toBe('yaklaşık 16,0 yıl');
    expect(Math.ceil(years! * 12 - 1e-6)).toBe(monthsUntilEmpty(resources, 1_000, 1));
  });

  it('reel getiri çekimi taşıyorsa süre yok; sıfır getiri bölme; eksi getiri daha kısa', () => {
    expect(fixedRealWithdrawalYears(200_000, 100, 5)).toBe(Infinity);
    expect(roughYearsPhrase(Infinity)).toBe('sermayeyi eritmez');
    expect(fixedRealWithdrawalYears(12_000, 1_000, 0)).toBeCloseTo(1, 6);
    expect(fixedRealWithdrawalYears(0, 1_000, 1)).toBe(0);
    expect(roughYearsPhrase(0)).toBe('süremez');
    expect(fixedRealWithdrawalYears(12_000, 0, 1)).toBe(Infinity);
    expect(fixedRealWithdrawalYears(12_000, 1_000, -100)).toBe(0);
    expect(fixedRealWithdrawalYears(-1, 1_000, 1)).toBeNull();
    expect(roughYearsPhrase(null)).toBe('');
    const down = fixedRealWithdrawalYears(12_000, 1_000, -2);
    expect(down).not.toBeNull();
    expect(down!).toBeGreaterThan(0);
    expect(down!).toBeLessThan(1);
  });
});

/** Ay sonu çekim simülasyonu: bakiye ilk kez eksiye düştüğü ay. */
function monthsUntilEmpty(capital: number, monthly: number, realPct: number): number {
  const growth = Math.pow(1 + realPct / 100, 1 / 12) - 1;
  let balance = capital;
  for (let month = 1; month <= 12 * 200; month++) {
    balance = balance * (1 + growth) - monthly;
    if (balance <= 1e-4) return month;
  }
  return Infinity;
}
