// FIRE (finansal bağımsızlık) projeksiyonu — para biriminden bağımsız saf hesap.
// Girdiler hangi para birimindeyse çıktılar da o birimdedir (UI USD kullanıyor).

export interface FireInputs {
  currentValue: number;
  monthlyContribution: number;
  annualReturnPct: number;
  targetMonthlyIncome: number;
  safeWithdrawalRatePct: number;
  // Hedefin bugünkü alım gücünü koruması için yıllık enflasyon varsayımı.
  // USD bazlı projeksiyonda ~%3 makul; 0 = düzeltme yok.
  annualInflationPct?: number;
}

export interface YearProjection {
  year: number;
  startOfYearValue: number;
  contributionsYTD: number;
  growthYTD: number;
  endOfYearValue: number;
  monthlyIncomeAtSWR: number;
  reachedTarget: boolean;
}

export interface FireProjection {
  targetPortfolio: number;
  currentGap: number;
  currentMonthlyAtSWR: number;
  yearsToTarget: number | null;
  inflationAdjustedTarget: number;
  yearByYear: YearProjection[];
}

const PROJECTION_YEARS = 40;

// HAVUZ KURALI (Kâr Cüzdanı) — FIRE sayfasının 'dürüst not'u bunları kullanır. Saf fonksiyon: test edilir.
// Uzun vadede aylık maaş ≈ güvenlik payı × reel getiri × sermaye ÷ 12 (aylık tavanla sınırlı).
/** Verilen aylık gelir için havuz kuralının istediği sermaye. Reel getiri ≤ 0 ise hedef ulaşılamaz → 0. */
export function poolRuleCapitalFor(monthlyIncome: number, realRatePct: number, safety: number): number {
  if (!(realRatePct > 0) || !(monthlyIncome > 0) || !(safety > 0)) return 0;
  return (monthlyIncome * 12) / (safety * (realRatePct / 100));
}
/** Bugünkü sermayenin havuz kuralıyla beklenen aylık maaşı (aylık tavanla sınırlı). */
export function poolRuleMonthlyFrom(capital: number, realRatePct: number, safety: number, monthlyCap: number): number {
  if (!(capital > 0) || !(realRatePct > 0)) return 0;
  return Math.min(monthlyCap, (safety * (realRatePct / 100) * capital) / 12);
}

export function projectFire(inputs: FireInputs): FireProjection {
  const {
    currentValue,
    monthlyContribution,
    annualReturnPct,
    targetMonthlyIncome,
    safeWithdrawalRatePct,
    annualInflationPct = 0,
  } = inputs;

  const swr = safeWithdrawalRatePct / 100;
  const targetPortfolio = swr > 0 ? (targetMonthlyIncome * 12) / swr : 0;
  const currentGap = Math.max(0, targetPortfolio - currentValue);
  const currentMonthlyAtSWR = (currentValue * swr) / 12;

  const monthlyRate = annualReturnPct / 100 / 12;
  const yearByYear: YearProjection[] = [];
  let value = currentValue;
  let cumulativeContributions = 0;
  let yearsToTarget: number | null = null;

  for (let y = 1; y <= PROJECTION_YEARS; y++) {
    const startOfYearValue = value;
    let yearContributions = 0;
    let yearGrowth = 0;

    for (let m = 0; m < 12; m++) {
      const growth = value * monthlyRate;
      yearGrowth += growth;
      value += growth;
      value += monthlyContribution;
      yearContributions += monthlyContribution;
    }

    cumulativeContributions += yearContributions;
    // Hedef REEL: y yıl sonra aynı alım gücü için hedef (1+π)^y kadar büyür — nominal hedefe 'ulaştım' demek yanıltıcıdır
    const realTarget = targetPortfolio * Math.pow(1 + annualInflationPct / 100, y);
    const reachedTarget = targetPortfolio > 0 && value >= realTarget;
    if (yearsToTarget === null && reachedTarget) yearsToTarget = y;

    yearByYear.push({
      year: y,
      startOfYearValue,
      contributionsYTD: cumulativeContributions,
      growthYTD: yearGrowth,
      endOfYearValue: value,
      monthlyIncomeAtSWR: (value * swr) / 12,
      reachedTarget,
    });

    if (yearsToTarget !== null && y >= yearsToTarget + 5) break;
  }

  const inflationFactor = yearsToTarget
    ? Math.pow(1 + annualInflationPct / 100, yearsToTarget)
    : 1;
  const inflationAdjustedTarget = targetPortfolio * inflationFactor;

  return {
    targetPortfolio,
    currentGap,
    currentMonthlyAtSWR,
    yearsToTarget,
    inflationAdjustedTarget,
    yearByYear,
  };
}
