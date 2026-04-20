import { PortfolioSnapshot } from './analyticsService';

export interface RiskMetrics {
  observationDays: number;
  dailyReturns: number[];
  meanDailyReturn: number;
  volatility: number;
  annualizedVolatility: number;
  annualizedReturn: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  maxDrawdownPct: number;
  maxDrawdownValueTry: number;
  maxDrawdownStart: string | null;
  maxDrawdownTrough: string | null;
  maxDrawdownRecovered: string | null;
  bestDay: { date: string; changePct: number; changeTry: number } | null;
  worstDay: { date: string; changePct: number; changeTry: number } | null;
  positiveDaysPct: number;
  currentDrawdownPct: number;
}

const TRADING_DAYS_PER_YEAR = 252;
const RISK_FREE_RATE_ANNUAL = 0.40;

export function computeRiskMetrics(snapshots: PortfolioSnapshot[]): RiskMetrics | null {
  if (snapshots.length < 2) return null;

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const dailyReturns: number[] = [];
  const dailyChanges: { date: string; changePct: number; changeTry: number }[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].total_value;
    const curr = sorted[i].total_value;
    if (prev > 0) {
      const r = (curr - prev) / prev;
      dailyReturns.push(r);
      dailyChanges.push({
        date: sorted[i].date,
        changePct: r * 100,
        changeTry: curr - prev,
      });
    }
  }

  if (dailyReturns.length === 0) return null;

  const meanDailyReturn = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;

  const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - meanDailyReturn, 2), 0) / dailyReturns.length;
  const volatility = Math.sqrt(variance);
  const annualizedVolatility = volatility * Math.sqrt(TRADING_DAYS_PER_YEAR);

  const annualizedReturn = Math.pow(1 + meanDailyReturn, TRADING_DAYS_PER_YEAR) - 1;

  const dailyRiskFree = Math.pow(1 + RISK_FREE_RATE_ANNUAL, 1 / TRADING_DAYS_PER_YEAR) - 1;
  const excessReturns = dailyReturns.map(r => r - dailyRiskFree);
  const meanExcess = excessReturns.reduce((s, r) => s + r, 0) / excessReturns.length;

  const sharpeRatio =
    volatility > 0
      ? (meanExcess / volatility) * Math.sqrt(TRADING_DAYS_PER_YEAR)
      : null;

  const downsideReturns = excessReturns.filter(r => r < 0);
  const downsideVariance =
    downsideReturns.length > 0
      ? downsideReturns.reduce((s, r) => s + r * r, 0) / downsideReturns.length
      : 0;
  const downsideDeviation = Math.sqrt(downsideVariance);
  const sortinoRatio =
    downsideDeviation > 0
      ? (meanExcess / downsideDeviation) * Math.sqrt(TRADING_DAYS_PER_YEAR)
      : null;

  let peak = sorted[0].total_value;
  let peakDate = sorted[0].date;
  let maxDrawdownPct = 0;
  let maxDrawdownValueTry = 0;
  let maxDrawdownStart: string | null = null;
  let maxDrawdownTrough: string | null = null;
  let maxDrawdownRecovered: string | null = null;
  let currentDrawdownPeak = sorted[0].total_value;

  for (const s of sorted) {
    if (s.total_value > peak) {
      peak = s.total_value;
      peakDate = s.date;
    }
    if (s.total_value > currentDrawdownPeak) currentDrawdownPeak = s.total_value;

    const ddPct = peak > 0 ? ((peak - s.total_value) / peak) * 100 : 0;
    const ddTry = peak - s.total_value;

    if (ddPct > maxDrawdownPct) {
      maxDrawdownPct = ddPct;
      maxDrawdownValueTry = ddTry;
      maxDrawdownStart = peakDate;
      maxDrawdownTrough = s.date;
      maxDrawdownRecovered = null;
    } else if (
      maxDrawdownTrough &&
      maxDrawdownRecovered === null &&
      s.date > maxDrawdownTrough &&
      s.total_value >= peak * 0.999
    ) {
      maxDrawdownRecovered = s.date;
    }
  }

  const lastValue = sorted[sorted.length - 1].total_value;
  const currentDrawdownPct =
    currentDrawdownPeak > 0
      ? ((currentDrawdownPeak - lastValue) / currentDrawdownPeak) * 100
      : 0;

  const bestDay = dailyChanges.length > 0
    ? dailyChanges.reduce((b, c) => (c.changePct > b.changePct ? c : b))
    : null;
  const worstDay = dailyChanges.length > 0
    ? dailyChanges.reduce((w, c) => (c.changePct < w.changePct ? c : w))
    : null;

  const positiveDays = dailyReturns.filter(r => r > 0).length;
  const positiveDaysPct = (positiveDays / dailyReturns.length) * 100;

  return {
    observationDays: dailyReturns.length,
    dailyReturns,
    meanDailyReturn,
    volatility,
    annualizedVolatility,
    annualizedReturn,
    sharpeRatio,
    sortinoRatio,
    maxDrawdownPct,
    maxDrawdownValueTry,
    maxDrawdownStart,
    maxDrawdownTrough,
    maxDrawdownRecovered,
    bestDay,
    worstDay,
    positiveDaysPct,
    currentDrawdownPct,
  };
}
