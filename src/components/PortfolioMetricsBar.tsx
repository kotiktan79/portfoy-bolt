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
  const totalRealized = holdings.reduce((sum, h) => sum + (h.total_realized_pnl || 0), 0);
  const unrealizedPnl = totalCurrentValue - totalInvestment;
  const grandTotal = totalCurrentValue + totalCashValue;

  return (
    <div className="px-3 sm:px-4 md:px-6 py-4 md:py-5 bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 border-b border-slate-200 dark:border-gray-700/80">
      <div className="flex flex-col gap-3 md:gap-4">

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">

          <div className="group sm:col-span-2 lg:col-span-1 relative bg-gradient-to-br from-blue-50 to-blue-100/80 dark:from-blue-900/30 dark:to-blue-800/20 rounded-2xl border border-blue-200/60 dark:border-blue-500/30 p-4 md:p-5 shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all duration-300 overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={15} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Toplam Portföy</span>
              </div>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-0.5 mb-1">
                <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white leading-none">
                  {formatCurrency(grandTotal)} ₺
                </p>
                <p className="text-base sm:text-lg font-bold text-blue-500 dark:text-blue-300 leading-none pb-0.5">
                  ${formatCurrency(grandTotalUSD)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                <span className="text-xs text-blue-600/70 dark:text-blue-400/70 font-medium">
                  Varlık: {formatCurrency(totalCurrentValue)} ₺
                </span>
                {totalCashValue > 0 && (
                  <span className="text-xs text-green-600/80 dark:text-green-400/80 font-medium flex items-center gap-1">
                    <Wallet size={10} />
                    Nakit: {formatCurrency(totalCashValue)} ₺
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="group relative bg-white dark:bg-gray-800/80 rounded-2xl border border-slate-200/80 dark:border-gray-700/60 p-4 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-300 overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-slate-500/5 rounded-full blur-xl"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-1.5 mb-2">
                <Layers size={14} className="text-slate-500 dark:text-slate-400 flex-shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Yatırım</span>
              </div>
              <p className="text-xl font-black text-slate-900 dark:text-white leading-none mb-1 truncate">
                {formatCurrency(totalInvestment)} ₺
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                ${formatCurrency(totalInvestmentUSD)}
              </p>
            </div>
          </div>

          <div className={`group relative rounded-2xl border p-4 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-300 overflow-hidden ${
            isPositive
              ? 'bg-gradient-to-br from-green-50 to-emerald-100/80 dark:from-green-900/25 dark:to-emerald-800/15 border-green-200/60 dark:border-green-500/30'
              : 'bg-gradient-to-br from-red-50 to-rose-100/80 dark:from-red-900/25 dark:to-rose-800/15 border-red-200/60 dark:border-red-500/30'
          }`}>
            <div className={`absolute top-0 right-0 w-16 h-16 rounded-full blur-xl ${isPositive ? 'bg-green-500/10' : 'bg-red-500/10'}`}></div>
            <div className="relative z-10">
              <div className="flex items-center gap-1.5 mb-2">
                {isPositive
                  ? <TrendingUp size={14} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                  : <TrendingDown size={14} className="text-red-600 dark:text-red-400 flex-shrink-0" />
                }
                <span className={`text-xs font-bold uppercase tracking-wider truncate ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  Toplam K/Z
                </span>
              </div>
              <div className="flex items-center gap-1 mb-1">
                {isPositive ? <ArrowUp size={13} className="text-green-600 dark:text-green-400 flex-shrink-0" /> : <ArrowDown size={13} className="text-red-600 dark:text-red-400 flex-shrink-0" />}
                <p className={`text-xl font-black leading-none truncate ${isPositive ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                  {formatCurrency(Math.abs(totalProfitLoss))} ₺
                </p>
              </div>
              <p className={`text-xs font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {isPositive ? '+' : ''}{totalProfitLossPercent.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {livePnlData ? (
            <>
              <PnLPeriodCard label="Günlük" value={livePnlData.daily.percentage} change={livePnlData.daily.change} />
              <PnLPeriodCard label="Haftalık" value={livePnlData.weekly.percentage} change={livePnlData.weekly.change} />
            </>
          ) : (
            <>
              <div className="group relative bg-white dark:bg-gray-800/80 rounded-2xl border border-slate-200/80 dark:border-gray-700/60 p-4 shadow-sm overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Activity size={14} className="text-slate-400 flex-shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 truncate">Gerçekleşen K/Z</span>
                  </div>
                  <p className={`text-xl font-black leading-none mb-1 truncate ${totalRealized >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatCurrency(totalRealized)} ₺
                  </p>
                  <p className="text-xs text-slate-400 font-medium">Kapatılmış pozisyonlar</p>
                </div>
              </div>
              <div className="group relative bg-white dark:bg-gray-800/80 rounded-2xl border border-slate-200/80 dark:border-gray-700/60 p-4 shadow-sm overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Activity size={14} className="text-slate-400 flex-shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 truncate">Gerçekleşmemiş</span>
                  </div>
                  <p className={`text-xl font-black leading-none mb-1 truncate ${unrealizedPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatCurrency(unrealizedPnl)} ₺
                  </p>
                  <p className="text-xs text-slate-400 font-medium">Açık pozisyonlar</p>
                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

function PnLPeriodCard({ label, value, change }: { label: string; value: number; change: number }) {
  const isPos = value >= 0;
  return (
    <div className="group relative bg-white dark:bg-gray-800/80 rounded-2xl border border-slate-200/80 dark:border-gray-700/60 p-4 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-300 overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
          {isPos ? <ArrowUp size={14} className="text-green-500 flex-shrink-0" /> : <ArrowDown size={14} className="text-red-500 flex-shrink-0" />}
        </div>
        <p className={`text-xl font-black leading-none mb-1 ${isPos ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
          {isPos ? '+' : ''}{value.toFixed(2)}%
        </p>
        <p className={`text-xs font-medium truncate ${isPos ? 'text-green-600/70 dark:text-green-400/70' : 'text-red-600/70 dark:text-red-400/70'}`}>
          {isPos ? '+' : ''}{formatCurrency(change)} ₺
        </p>
      </div>
    </div>
  );
}
