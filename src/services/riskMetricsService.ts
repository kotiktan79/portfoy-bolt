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

  // Net external cash flow into the portfolio for period i (deposits added,
  // withdrawals removed). The user injects new money regularly (e.g. weekly
  // buys); that is NOT investment return and must be stripped out before
  // computing any return-based metric, otherwise a deposit day reads as a huge
  // positive "return" and inflates mean/vol/Sharpe/Sortino/best-day.
  const cashFlow = (i: number): number => {
    const prevDep = sorted[i - 1].total_deposits ?? 0;
    const currDep = sorted[i].total_deposits ?? 0;
    const prevWd = sorted[i - 1].total_withdrawals ?? 0;
    const currWd = sorted[i].total_withdrawals ?? 0;
    return (currDep - prevDep) - (currWd - prevWd);
  };

  const dailyReturns: number[] = [];
  const dailyChanges: { date: string; changePct: number; changeTry: number }[] = [];
  // Deposit-adjusted time-weighted return index (starts at 1) + the underlying
  // portfolio value at each point, used for a deposit-clean drawdown.
  const indexSeries: { date: string; idx: number; value: number }[] = [
    { date: sorted[0].date, idx: 1, value: sorted[0].total_value },
  ];
  let acc = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].total_value;
    const curr = sorted[i].total_value;
    if (prev > 0) {
      const cf = cashFlow(i);
      const gainTry = curr - prev - cf; // pure investment gain, deposits removed
      const r = gainTry / prev;
      dailyReturns.push(r);
      dailyChanges.push({
        date: sorted[i].date,
        changePct: r * 100,
        changeTry: gainTry,
      });
      acc *= 1 + r;
    }
    indexSeries.push({ date: sorted[i].date, idx: acc, value: curr });
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

  // Drawdown is measured on the deposit-adjusted return index, not raw value —
  // otherwise a deposit (which raises value without any gain) would reset the
  // peak and mask real drawdowns.
  let peakIdx = indexSeries[0].idx;
  let peakValue = indexSeries[0].value;
  let peakDate = indexSeries[0].date;
  let maxDrawdownPct = 0;
  let maxDrawdownValueTry = 0;
  let maxDrawdownStart: string | null = null;
  let maxDrawdownTrough: string | null = null;
  let maxDrawdownRecovered: string | null = null;
  let currentDrawdownPeakIdx = indexSeries[0].idx;

  for (const s of indexSeries) {
    if (s.idx > peakIdx) {
      peakIdx = s.idx;
      peakValue = s.value;
      peakDate = s.date;
    }
    if (s.idx > currentDrawdownPeakIdx) currentDrawdownPeakIdx = s.idx;

    const ddPct = peakIdx > 0 ? ((peakIdx - s.idx) / peakIdx) * 100 : 0;
    const ddTry = (ddPct / 100) * peakValue;

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
      s.idx >= peakIdx * 0.999
    ) {
      maxDrawdownRecovered = s.date;
    }
  }

  const lastIdx = indexSeries[indexSeries.length - 1].idx;
  const currentDrawdownPct =
    currentDrawdownPeakIdx > 0
      ? ((currentDrawdownPeakIdx - lastIdx) / currentDrawdownPeakIdx) * 100
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
