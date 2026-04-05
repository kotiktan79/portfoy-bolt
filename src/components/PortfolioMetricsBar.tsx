import { TrendingUp, TrendingDown, DollarSign, Activity, ArrowUp, ArrowDown, Layers, Wallet } from 'lucide-react';
import { formatCurrency } from '../services/priceService';
import { Holding } from '../lib/supabase';

interface PnLPeriod {
  period: string;
  change: number;
  percentage: number;
}

interface PortfolioMetricsBarProps {
  holdings: Holding[];
  totalInvestment: number;
  totalCurrentValue: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  totalInvestmentUSD: number;
  totalCurrentValueUSD: number;
  grandTotalUSD?: number;
  livePnlData: {
    daily: PnLPeriod;
    weekly: PnLPeriod;
    monthly: PnLPeriod;
  } | null;
  totalCashValue?: number;
}

export function PortfolioMetricsBar({
  holdings,
  totalInvestment,
  totalCurrentValue,
  totalProfitLoss,
  totalProfitLossPercent,
  totalInvestmentUSD,
  grandTotalUSD = 0,
  livePnlData,
  totalCashValue = 0,
}: PortfolioMetricsBarProps) {
  const isPositive = totalProfitLoss >= 0;
  const dailyChange = livePnlData?.daily ?? null;
  const isDailyPositive = dailyChange ? dailyChange.percentage >= 0 : true;

  return (
    <div className="px-3 sm:px-4 md:px-6 py-3 md:py-4 border-b border-slate-200 dark:border-gray-700">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 md:gap-3">

        {/* Toplam Deger - priority card */}
        <MetricCard
          label="Toplam Deger"
          value={`${formatCurrency(totalCurrentValue)} TL`}
          valueClassName="text-sm md:text-2xl font-extrabold text-blue-600 dark:text-blue-400"
          priority
        />

        {/* Kar / Zarar - priority card */}
        <MetricCard
          label="Kar / Zarar"
          value={`${isPositive ? '+' : ''}${formatCurrency(totalProfitLoss)} TL`}
          valueClassName={`text-sm md:text-lg font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
          change={`${isPositive ? '+' : ''}${totalProfitLossPercent.toFixed(2)}%`}
          changePositive={isPositive}
          priority
        />

        {/* Toplam Yatirim */}
        <MetricCard
          label="Toplam Yatirim"
          value={`${formatCurrency(totalInvestment)} TL`}
        />

        {/* Gunluk Degisim */}
        <MetricCard
          label="Gunluk Degisim"
          value={
            dailyChange
              ? `${isDailyPositive ? '+' : ''}${dailyChange.percentage.toFixed(2)}%`
              : '--'
          }
          valueClassName={`text-sm md:text-lg font-bold ${
            dailyChange
              ? isDailyPositive
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
              : 'text-slate-400'
          }`}
          change={
            dailyChange
              ? `${isDailyPositive ? '+' : ''}${formatCurrency(dailyChange.change)} TL`
              : undefined
          }
          changePositive={isDailyPositive}
        />

        {/* Nakit */}
        <MetricCard
          label="Nakit"
          value={`${formatCurrency(totalCashValue)} TL`}
        />

        {/* USD Deger */}
        <MetricCard
          label="USD Deger"
          value={`$${formatCurrency(grandTotalUSD)}`}
        />

      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  valueClassName,
  change,
  changePositive,
  priority,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  change?: string;
  changePositive?: boolean;
  priority?: boolean;
}) {
  return (
    <div className={`bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-2.5 md:px-3 py-2 md:py-2.5 ${priority ? 'ring-1 ring-blue-100 dark:ring-blue-900/30 md:ring-0' : ''}`}>
      <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-0.5 md:mb-1 truncate">
        {label}
      </p>
      <p className={valueClassName ?? 'text-sm md:text-lg font-bold text-slate-900 dark:text-white truncate'}>
        {value}
      </p>
      {change && (
        <p className={`text-[10px] md:text-xs font-medium mt-0.5 ${changePositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {change}
        </p>
      )}
    </div>
  );
}
