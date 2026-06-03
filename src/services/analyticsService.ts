import { supabase } from '../lib/supabase';
import { computePeriodChange, computeClassMetrics, computeDynamicWithdrawal, DynamicWithdrawal, SnapshotForGrowth } from '../lib/portfolioMetrics';
import { getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';

// Egress quota koruması: getDynamicWithdrawal price_history + portfolio_snapshots
// çekiyor (~100KB her çağrı). LivePage 30s'de bir çağırınca quotayı patlatır.
// In-memory cache 10 dakika.
let _dwCache: { value: DynamicWithdrawal | null; ts: number } | null = null;
const DW_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Dinamik güvenli maaş: snapshot geçmişi + tarihsel USD/TRY kuru çekip
 * USD bazlı reel büyümeden hesaplar. (eski MonthlyWithdrawalPlan mantığı)
 */
export async function getDynamicWithdrawal(): Promise<DynamicWithdrawal | null> {
  if (_dwCache && Date.now() - _dwCache.ts < DW_CACHE_TTL_MS) {
    return _dwCache.value;
  }
  try {
    // Sadece son 365 gün snapshot — computeDynamicWithdrawal zaten 365 gün penceresi kullanıyor
    const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
    const { data: snaps } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date,total_value,total_deposits,total_withdrawals')
      .gte('snapshot_date', oneYearAgo)
      .order('snapshot_date', { ascending: true })
      .limit(400);
    if (!snaps || snaps.length < 2) return null;

    // Tarihsel USD/TRY kuru (price_history'den USD sembolü) — son 365 gün, en eskiden yeniye
    const oneYearAgoIso = new Date(Date.now() - 365 * 86400000).toISOString();
    const { data: usdHist } = await supabase
      .from('price_history')
      .select('price,recorded_at')
      .eq('symbol', 'USD')
      .gte('recorded_at', oneYearAgoIso)
      .order('recorded_at', { ascending: true })
      .limit(500);

    const usdRateAt = (date: string): number => {
      if (!usdHist || usdHist.length === 0) return 45;
      let best = Number(usdHist[0].price);
      for (const r of usdHist) {
        if (r.recorded_at.slice(0, 10) <= date) best = Number(r.price);
      }
      return best > 1 ? best : 45;
    };

    // Aynı tarih için son snapshot'ı tut (dedup)
    const byDate = new Map<string, typeof snaps[0]>();
    for (const s of snaps) byDate.set(s.snapshot_date, s);

    const forGrowth: SnapshotForGrowth[] = Array.from(byDate.values()).map(s => ({
      snapshot_date: s.snapshot_date,
      total_value: s.total_value,
      total_deposits: s.total_deposits,
      total_withdrawals: s.total_withdrawals,
      usdRate: usdRateAt(s.snapshot_date),
    }));

    const result = computeDynamicWithdrawal(forGrowth);
    _dwCache = { value: result, ts: Date.now() };
    return result;
  } catch (error) {
    console.error('getDynamicWithdrawal error:', error);
    return null;
  }
}

export interface PnLData {
  period: string;
  value: number;
  percentage: number;
  change: number;
}

export interface PortfolioSnapshot {
  date: string;
  total_value: number;
  total_investment: number;
  total_pnl: number;
  pnl_percentage: number;
  total_deposits?: number;
  total_withdrawals?: number;
}

export interface AssetAllocation {
  symbol: string;
  asset_type: string;
  value: number;
  percentage: number;
  target_percentage: number;
  rebalance_amount: number;
}

// NOTE: savePortfolioSnapshot was removed. The client no longer writes
// snapshots — only the daily cron (api/cron/daily-snapshot.ts) does, once per
// day after BIST close, with consistent deposit figures. Client writes used to
// cause duplicate / date-shifted / deposit-inconsistent rows.

export async function getPnLData(): Promise<{
  daily: PnLData;
  weekly: PnLData;
  monthly: PnLData;
}> {
  const empty = {
    daily: { period: 'Günlük', value: 0, percentage: 0, change: 0 },
    weekly: { period: 'Haftalık', value: 0, percentage: 0, change: 0 },
    monthly: { period: 'Aylık', value: 0, percentage: 0, change: 0 },
  };

  try {
    const { data: snapshots, error } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, total_value, total_investment, total_pnl, total_deposits, total_withdrawals, created_at')
      .order('snapshot_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !snapshots || snapshots.length === 0) {
      if (error) console.error('Error fetching snapshots:', error);
      return empty;
    }

    const dailyMap = new Map<string, typeof snapshots[0]>();
    for (const s of snapshots) {
      const key = s.snapshot_date;
      if (!dailyMap.has(key)) {
        dailyMap.set(key, s);
      }
    }

    const uniqueDays = Array.from(dailyMap.values()).sort(
      (a, b) => new Date(b.snapshot_date).getTime() - new Date(a.snapshot_date).getTime()
    );

    if (uniqueDays.length === 0) return empty;

    const current = uniqueDays[0];
    const currentValue = Number(current.total_value) || 0;

    const findByDaysAgo = (days: number) => {
      const target = new Date();
      target.setDate(target.getDate() - days);
      target.setHours(0, 0, 0, 0);
      const targetTs = target.getTime();

      let best: typeof snapshots[0] | null = null;
      let bestDiff = Infinity;

      for (const s of uniqueDays) {
        const sDate = new Date(s.snapshot_date);
        if (sDate >= new Date(current.snapshot_date)) continue;
        const diff = Math.abs(sDate.getTime() - targetTs);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = s;
        }
      }
      return best;
    };

    // computePeriodChange: total_deposits/total_withdrawals'tan cash flow düşer,
    // sanity check ile büyük sapmalarda 0 döner (eski calculateChange ile uyumlu)
    const calculateChange = (previous: typeof snapshots[0] | null) => {
      if (!previous) return { value: currentValue, percentage: 0, change: 0 };
      const period = computePeriodChange(current, previous, 50);
      return {
        value: currentValue,
        percentage: period.changePct,
        change: period.changeTRY,
      };
    };

    const yesterday = findByDaysAgo(1);
    const lastWeek = findByDaysAgo(7);
    const lastMonth = findByDaysAgo(30);

    const dailyResult = calculateChange(yesterday);
    const weeklyResult = calculateChange(lastWeek);
    const monthlyResult = calculateChange(lastMonth);

    // NOTE: a previous intraday fallback here read 'portfolio_open_value' from
    // sessionStorage and reported (currentValue - openValue) as the daily gain.
    // It was both dead (the writer stores the value under 'portfolio_open_value_v2',
    // so the key never matched) and wrong (a raw value delta counts intraday
    // deposits as gain). Intraday change is handled correctly by
    // computeIntradayChange in PortfolioContext; here we always use the
    // deposit-aware computePeriodChange result.
    return {
      daily: { period: 'Günlük', ...dailyResult },
      weekly: { period: 'Haftalık', ...weeklyResult },
      monthly: { period: 'Aylık', ...monthlyResult },
    };
  } catch (err) {
    console.error('Unexpected error in getPnLData:', err);
    return empty;
  }
}

export async function getHistoricalSnapshots(days: number): Promise<PortfolioSnapshot[]> {
  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(days);

  if (error) {
    console.error('Error fetching historical snapshots:', error);
  }

  if (!data) return [];

  return data.reverse().map((snapshot) => ({
    date: snapshot.snapshot_date,
    total_value: snapshot.total_value,
    total_investment: snapshot.total_investment,
    total_pnl: snapshot.total_pnl,
    pnl_percentage: snapshot.pnl_percentage,
    total_deposits: snapshot.total_deposits || 0,
    total_withdrawals: snapshot.total_withdrawals || 0,
  }));
}

export function calculateRebalance(
  holdings: Array<{
    symbol: string;
    asset_type: string;
    current_price: number;
    purchase_price?: number;
    quantity: number;
    currency?: string;
  }>,
  targetAllocations: Record<string, number>
): AssetAllocation[] {
  // FX-aware: USD/EUR pozisyonları TRY'ye çevirip topluyoruz.
  // Eski sürüm raw price×qty topluyordu → multicurrency portföyde yanlış yüzdeler.
  const fxRates = getFxRatesFromHoldings(holdings as never);
  const valued = holdings.map((h) => ({
    h,
    value: holdingValueTRY(h as never, fxRates),
  }));
  const totalValue = valued.reduce((sum, v) => sum + v.value, 0);

  const allocations: AssetAllocation[] = valued.map(({ h, value }) => {
    const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
    const targetPercentage = targetAllocations[h.asset_type] || 0;
    const targetValue = (totalValue * targetPercentage) / 100;
    const rebalanceAmount = targetValue - value;

    return {
      symbol: h.symbol,
      asset_type: h.asset_type,
      value,
      percentage,
      target_percentage: targetPercentage,
      rebalance_amount: rebalanceAmount,
    };
  });

  return allocations.sort((a, b) => b.value - a.value);
}

export function getDefaultTargetAllocations(): Record<string, number> {
  return {
    stock: 40,
    crypto: 20,
    currency: 15,
    fund: 15,
    eurobond: 5,
    commodity: 5,
  };
}

export interface AdvancedMetrics {
  sharpeRatio: number;
  maxDrawdown: number;
  volatility: number;
  cagr: number;
  beta: number;
  alpha: number;
}

// Deposit-adjusted daily returns. The portfolio receives regular external
// deposits (e.g. weekly buys); a raw (curr-prev)/prev return would count that
// new money as performance and inflate every return-based metric. Here we strip
// the net cash flow (deposits in, withdrawals out) of each period.
function depositAdjustedDailyReturns(snapshots: PortfolioSnapshot[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prevValue = snapshots[i - 1].total_value;
    const currValue = snapshots[i].total_value;
    if (prevValue <= 0) continue;
    const cashFlow =
      ((snapshots[i].total_deposits ?? 0) - (snapshots[i - 1].total_deposits ?? 0)) -
      ((snapshots[i].total_withdrawals ?? 0) - (snapshots[i - 1].total_withdrawals ?? 0));
    const dailyReturn = (currValue - prevValue - cashFlow) / prevValue;
    if (!isNaN(dailyReturn) && isFinite(dailyReturn)) {
      returns.push(dailyReturn);
    }
  }
  return returns;
}

export async function calculateSharpeRatio(riskFreeRate: number = 0.15): Promise<number> {
  const snapshots = await getHistoricalSnapshots(365);
  if (snapshots.length < 2) return 0;

  const returns = depositAdjustedDailyReturns(snapshots);

  if (returns.length < 2) return 0;

  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  const annualizedReturn = avgReturn * 252;
  const annualizedVolatility = stdDev * Math.sqrt(252);

  if (annualizedVolatility === 0 || !isFinite(annualizedVolatility)) return 0;

  const sharpeRatio = (annualizedReturn - riskFreeRate) / annualizedVolatility;
  return isFinite(sharpeRatio) ? sharpeRatio : 0;
}

export async function calculateMaxDrawdown(): Promise<number> {
  const snapshots = await getHistoricalSnapshots(365);
  if (snapshots.length < 2) return 0;

  // Measure drawdown on the deposit-adjusted return index, not raw value — a
  // deposit raises value without any gain and would otherwise reset the peak
  // and mask real drawdowns.
  const returns = depositAdjustedDailyReturns(snapshots);
  if (returns.length < 1) return 0;

  let maxDrawdown = 0;
  let peak = 1;
  let idx = 1;
  for (const r of returns) {
    idx *= 1 + r;
    if (idx > peak) peak = idx;
    if (peak > 0) {
      const drawdown = (peak - idx) / peak;
      if (drawdown > maxDrawdown && isFinite(drawdown)) {
        maxDrawdown = drawdown;
      }
    }
  }

  return isFinite(maxDrawdown) ? maxDrawdown * 100 : 0;
}

export async function calculateVolatility(): Promise<number> {
  const snapshots = await getHistoricalSnapshots(365);
  if (snapshots.length < 2) return 0;

  const returns = depositAdjustedDailyReturns(snapshots);

  if (returns.length < 2) return 0;

  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  const annualizedVolatility = stdDev * Math.sqrt(252) * 100;
  return isFinite(annualizedVolatility) ? annualizedVolatility : 0;
}

export async function calculateCAGR(): Promise<number> {
  const snapshots = await getHistoricalSnapshots(365);
  if (snapshots.length < 2) return 0;

  // CAGR must be a return, not a money-growth figure. A naive lastValue/firstValue
  // would be dominated by the new money deposited over the window. Instead we
  // compound the deposit-adjusted daily returns (true time-weighted growth) and
  // annualize over the ACTUAL elapsed calendar span (not snapshots.length/365,
  // which assumes one gap-free snapshot per day).
  const returns = depositAdjustedDailyReturns(snapshots);
  if (returns.length < 1) return 0;

  const firstDate = new Date(snapshots[0].date).getTime();
  const lastDate = new Date(snapshots[snapshots.length - 1].date).getTime();
  const years = (lastDate - firstDate) / (365.25 * 86400000);
  if (years <= 0) return 0;

  const totalGrowth = returns.reduce((acc, r) => acc * (1 + r), 1);
  if (totalGrowth <= 0) return 0;

  const cagr = (Math.pow(totalGrowth, 1 / years) - 1) * 100;
  return isFinite(cagr) ? cagr : 0;
}

export async function getAdvancedMetrics(): Promise<AdvancedMetrics> {
  const [sharpeRatio, maxDrawdown, volatility, cagr] = await Promise.all([
    calculateSharpeRatio(),
    calculateMaxDrawdown(),
    calculateVolatility(),
    calculateCAGR(),
  ]);

  return {
    sharpeRatio,
    maxDrawdown,
    volatility,
    cagr,
    beta: 0,
    alpha: 0,
  };
}

export interface AssetTypePnLSummary {
  asset_type: string;
  total_value: number;
  total_investment: number;
  total_unrealized_pnl: number;
  total_realized_pnl: number;
  total_pnl: number;
  pnl_percent: number;
}

export async function getPnLSummaryByAssetType(): Promise<AssetTypePnLSummary[]> {
  const { data: holdings, error } = await supabase
    .from('holdings')
    .select('*');

  if (error) {
    console.error('Error fetching holdings for PnL summary:', error);
    return [];
  }

  if (!holdings || holdings.length === 0) return [];

  // Unified computeClassMetrics + realized PnL ekle (cash hariç tutuluyor)
  const classMetrics = computeClassMetrics(holdings);
  const realizedByType: Record<string, number> = {};
  for (const h of holdings) {
    if (!h.asset_type || h.asset_type === 'cash') continue;
    realizedByType[h.asset_type] = (realizedByType[h.asset_type] || 0) + (h.total_realized_pnl || 0);
  }
  const result: AssetTypePnLSummary[] = classMetrics.map(c => {
    const realized = realizedByType[c.asset_type] || 0;
    const totalPnl = c.pnlTRY + realized;
    return {
      asset_type: c.asset_type,
      total_value: c.valueTRY,
      total_investment: c.costTRY,
      total_unrealized_pnl: c.pnlTRY,
      total_realized_pnl: realized,
      total_pnl: totalPnl,
      pnl_percent: c.costTRY > 0 ? (totalPnl / c.costTRY) * 100 : 0,
    };
  });
  return result.sort((a, b) => b.total_value - a.total_value);
}
