import { describe, it, expect } from 'vitest';
import { projectFire, poolRuleCapitalFor, poolRuleMonthlyFrom } from './fireProjectionService';

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
    expect(p.yearByYear).toHaveLength(40);   // ufuk 25→40 yıl (katkısız gerçekçi süreler 17-21 yıl)
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

import { projectFire as pf } from './fireProjectionService';
describe('projectFire — hedef REEL (enflasyonla büyür), dürüst süre', () => {
  it('€148k, katkı 0, %4 getiri, €1.000/ay @ %3,5 SWR, enflasyon %2 → nominal hedef 21 yıl, reel hedef daha geç', () => {
    const nominal = pf({ currentValue: 148_249, monthlyContribution: 0, annualReturnPct: 4, targetMonthlyIncome: 1000, safeWithdrawalRatePct: 3.5, annualInflationPct: 0 });
    const real = pf({ currentValue: 148_249, monthlyContribution: 0, annualReturnPct: 4, targetMonthlyIncome: 1000, safeWithdrawalRatePct: 3.5, annualInflationPct: 2 });
    expect(nominal.targetPortfolio).toBeCloseTo(342_857, 0);
    expect(nominal.yearsToTarget).toBe(21);
    // aynı alım gücü için: reel büyüme %4−%2 = %2/yıl → 148k→343k ≈ 42 yıl → 40 yıllık ufukta ULAŞILMIYOR (null)
    expect(real.yearsToTarget === null || real.yearsToTarget > 21).toBe(true);
  });
  it('kasadan aktarım katkı sayılmaz: katkı 0 varsayılanı ile 8% bile "2-3 yıl" vermez', () => {
    const p = pf({ currentValue: 148_249, monthlyContribution: 0, annualReturnPct: 8, targetMonthlyIncome: 1000, safeWithdrawalRatePct: 3.5, annualInflationPct: 2 });
    expect(p.yearsToTarget === null || p.yearsToTarget >= 10).toBe(true);
  });
});

// ---------------------------------------------------------------------------------
// Havuz kuralı yardımcıları (FIRE 'dürüst not' rakamları) — 2026-09-23 hakem bulgusu:
// bu formüller ekranda rakam basıyordu ama testsizdi.
// ---------------------------------------------------------------------------------
describe('poolRuleCapitalFor / poolRuleMonthlyFrom', () => {
  it('varsayılan girdilerle bilinen rakamları verir (hedef €1.000, reel %2, %85)', () => {
    expect(poolRuleCapitalFor(1000, 2, 0.85)).toBeCloseTo(705_882.35, 2);   // 12.000 / (0,85 × 0,02)
    expect(poolRuleMonthlyFrom(177_708, 2, 0.85, 1000)).toBeCloseTo(251.75, 2);
  });
  it('panelin varsayımıyla (reel %3,2) aynı formül €441k verir', () => {
    expect(poolRuleCapitalFor(1000, 3.2, 0.85)).toBeCloseTo(441_176.47, 2);
    expect(poolRuleCapitalFor(1500, 3.2, 0.85)).toBeCloseTo(661_764.71, 2);
  });
  it('aylık tavan bağlar: büyük sermayede maaş tavanı aşmaz', () => {
    expect(poolRuleMonthlyFrom(2_000_000, 3, 0.85, 1000)).toBe(1000);       // 4.250 → tavan 1.000
  });
  it('reel getiri ≤ 0 ya da sermaye 0 ise NaN/Infinity değil 0 döner', () => {
    expect(poolRuleCapitalFor(1000, 0, 0.85)).toBe(0);
    expect(poolRuleCapitalFor(1000, -1, 0.85)).toBe(0);
    expect(poolRuleMonthlyFrom(0, 3, 0.85, 1000)).toBe(0);
    expect(poolRuleMonthlyFrom(100_000, -2, 0.85, 1000)).toBe(0);
  });
});
