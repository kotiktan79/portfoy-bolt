export interface FireInputs {
  currentValue: number;
  monthlyContribution: number;
  annualReturnPct: number;
  targetMonthlyIncome: number;
  safeWithdrawalRatePct: number;
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
  currentGapTry: number;
  currentMonthlyAtSWR: number;
  yearsToTarget: number | null;
  inflationAdjustedTarget: number;
  yearByYear: YearProjection[];
}

const PROJECTION_YEARS = 25;

export function projectFire(inputs: FireInputs): FireProjection {
  const {
    currentValue,
    monthlyContribution,
    annualReturnPct,
    targetMonthlyIncome,
    safeWithdrawalRatePct,
  } = inputs;

  const swr = safeWithdrawalRatePct / 100;
  const targetPortfolio = swr > 0 ? (targetMonthlyIncome * 12) / swr : 0;
  const currentGapTry = Math.max(0, targetPortfolio - currentValue);
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
    const reachedTarget = value >= targetPortfolio;
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

  // Inflation-adjusted target (TR ortalama %35 enflasyon — kaba tahmin)
  // Hedef yıl × yıllık enflasyon × hedef
  const inflationPct = 35;
  const inflationFactor = yearsToTarget
    ? Math.pow(1 + inflationPct / 100, yearsToTarget)
    : 1;
  const inflationAdjustedTarget = targetPortfolio * inflationFactor;

  return {
    targetPortfolio,
    currentGapTry,
    currentMonthlyAtSWR,
    yearsToTarget,
    inflationAdjustedTarget,
    yearByYear,
  };
}
