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
  /**
   * Nominal hedef: bugünkü reel sermayenin (1+enflasyon)^yıl katı.
   * Gelecekteki euro miktarıdır; alım gücü değildir.
   */
  inflationTarget: number;
  /** Yıl sonu portföyün bugünkü alım gücü: nominal / (1+enflasyon)^yıl. */
  realEndOfYearValue: number;
  /** Reel hedef. Her yıl aynı: €hedef gelirin bugünkü sermayesi. */
  realTarget: number;
  reachedTarget: boolean;
}

export interface FireProjection {
  /** €hedef aylık reel gelir için bugünkü sermaye (SWR). */
  targetPortfolio: number;
  currentGap: number;
  /** Bugünkü portföyün SWR ile üretebildiği aylık gelir, bugünkü euro. */
  currentMonthlyAtSWR: number;
  /** Bugünkü reel gelir / hedef reel gelir, yüzde. Enflasyon hedefi şişirmez. */
  realProgressPct: number;
  yearsToTarget: number | null;
  /** Hedefe varılan yıldaki nominal (enflasyonlu) sermaye. Ulaşılamazsa bugünkü reel sermaye. */
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
  const inflation = annualInflationPct / 100;
  const targetPortfolio = swr > 0 ? (targetMonthlyIncome * 12) / swr : 0;
  const currentGap = Math.max(0, targetPortfolio - currentValue);
  const currentMonthlyAtSWR = (currentValue * swr) / 12;
  const realProgressPct = targetMonthlyIncome > 0 ? (currentMonthlyAtSWR / targetMonthlyIncome) * 100 : 0;

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
    // Nominal hedef, aynı reel gelirin o yıldaki euro karşılığıdır: bugünkü sermaye × (1+π)^y.
    // Reel hedef sabittir (bugünkü €). Reel portföy = nominal / (1+π)^y.
    // İkisi de aynı yılda kesişir; grafik reel olanı hedef çizgisi yapar.
    const inflationFactor = Math.pow(1 + inflation, y);
    const nominalTarget = targetPortfolio * inflationFactor;
    const realEndOfYearValue = inflationFactor > 0 ? value / inflationFactor : value;
    const reachedTarget = targetPortfolio > 0 && value >= nominalTarget;
    if (yearsToTarget === null && reachedTarget) yearsToTarget = y;

    yearByYear.push({
      year: y,
      startOfYearValue,
      contributionsYTD: cumulativeContributions,
      growthYTD: yearGrowth,
      endOfYearValue: value,
      monthlyIncomeAtSWR: (value * swr) / 12,
      inflationTarget: nominalTarget,
      realEndOfYearValue,
      realTarget: targetPortfolio,
      reachedTarget,
    });

    if (yearsToTarget !== null && y >= yearsToTarget + 5) break;
  }

  const inflationFactor = yearsToTarget
    ? Math.pow(1 + inflation, yearsToTarget)
    : 1;
  const inflationAdjustedTarget = targetPortfolio * inflationFactor;

  return {
    targetPortfolio,
    currentGap,
    currentMonthlyAtSWR,
    realProgressPct,
    yearsToTarget,
    inflationAdjustedTarget,
    yearByYear,
  };
}

/** İki takvim günü arasındaki yıl kesri. Geçmiş tarih 0 döner. */
export function yearsBetween(fromISO: string, toISO: string): number {
  const ms = Date.parse(`${toISO.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromISO.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return ms / (365.25 * 86400000);
}

/**
 * Reel sermayenin `onISO` tarihindeki nominal karşılığı.
 * Taban bugündür: €1.000 bugünkü alım gücüdür, Nisan 2027'de daha çok nominal euro ister.
 */
export function nominalCapitalOn(realCapital: number, annualInflationPct: number, fromISO: string, onISO: string): number {
  if (!(realCapital > 0)) return 0;
  const years = yearsBetween(fromISO, onISO);
  return realCapital * Math.pow(1 + annualInflationPct / 100, years);
}
