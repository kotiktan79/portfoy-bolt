import { describe, it, expect } from 'vitest';
import { projectFire } from './fireProjectionService';

describe('projectFire', () => {
  it('hedef portföyü SWR üzerinden hesaplar (aylık gelir × 12 / SWR)', () => {
    const p = projectFire({
      currentValue: 100_000,
      monthlyContribution: 0,
      annualReturnPct: 0,
      targetMonthlyIncome: 2_000,
      safeWithdrawalRatePct: 4,
    });
    expect(p.targetPortfolio).toBe(600_000); // 24k/yıl ÷ %4
    expect(p.currentGap).toBe(500_000);
    expect(p.currentMonthlyAtSWR).toBeCloseTo((100_000 * 0.04) / 12, 6);
  });

  it('getiri ve katkı sıfırken değer sabit kalır, hedefe ulaşılmaz', () => {
    const p = projectFire({
      currentValue: 100_000,
      monthlyContribution: 0,
      annualReturnPct: 0,
      targetMonthlyIncome: 2_000,
      safeWithdrawalRatePct: 4,
    });
    expect(p.yearsToTarget).toBeNull();
    expect(p.yearByYear).toHaveLength(25);
    expect(p.yearByYear[24].endOfYearValue).toBeCloseTo(100_000, 6);
    expect(p.inflationAdjustedTarget).toBe(p.targetPortfolio); // ulaşılmadıysa faktör 1
  });

  it('sadece katkıyla biriktirir ve hedef yılını bulur', () => {
    // 0 getiri, ayda 10k → yılda 120k. Hedef 600k − mevcut 100k = 500k → 5. yıl.
    const p = projectFire({
      currentValue: 100_000,
      monthlyContribution: 10_000,
      annualReturnPct: 0,
      targetMonthlyIncome: 2_000,
      safeWithdrawalRatePct: 4,
    });
    expect(p.yearsToTarget).toBe(5);
    const y5 = p.yearByYear[4];
    expect(y5.endOfYearValue).toBeCloseTo(700_000, 6);
    expect(y5.contributionsYTD).toBeCloseTo(600_000, 6);
    expect(y5.reachedTarget).toBe(true);
    // Hedefe ulaştıktan 5 yıl sonra projeksiyon kesilir
    expect(p.yearByYear).toHaveLength(10);
  });

  it('bileşik aylık getiriyi uygular (katkısız, %12 yıllık ≈ aylık %1)', () => {
    const p = projectFire({
      currentValue: 100_000,
      monthlyContribution: 0,
      annualReturnPct: 12,
      targetMonthlyIncome: 100_000, // ulaşılmaz hedef → 25 yıl tam döngü
      safeWithdrawalRatePct: 4,
    });
    expect(p.yearByYear[0].endOfYearValue).toBeCloseTo(100_000 * Math.pow(1.01, 12), 4);
    expect(p.yearByYear[0].growthYTD).toBeCloseTo(100_000 * (Math.pow(1.01, 12) - 1), 4);
  });

  it('enflasyon düzeltmeli hedef, hedef yılına bileşik uygulanır', () => {
    const p = projectFire({
      currentValue: 100_000,
      monthlyContribution: 10_000,
      annualReturnPct: 0,
      targetMonthlyIncome: 2_000,
      safeWithdrawalRatePct: 4,
      annualInflationPct: 3,
    });
    expect(p.yearsToTarget).toBe(5);
    expect(p.inflationAdjustedTarget).toBeCloseTo(600_000 * Math.pow(1.03, 5), 4);
  });

  it('SWR 0 ise hedef 0 ve hedefe-ulaşma işaretlenmez', () => {
    const p = projectFire({
      currentValue: 100_000,
      monthlyContribution: 1_000,
      annualReturnPct: 5,
      targetMonthlyIncome: 2_000,
      safeWithdrawalRatePct: 0,
    });
    expect(p.targetPortfolio).toBe(0);
    expect(p.yearsToTarget).toBeNull();
    expect(p.yearByYear.every(y => !y.reachedTarget)).toBe(true);
  });
});
