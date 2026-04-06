import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { formatCurrency, getCachedUSDRate } from '../services/priceService';
import { DEFAULT_USD_TRY_RATE } from '../config';

interface Props {
  holdings: Holding[];
  totalValue: number;
  totalInvestment: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  totalCashValue: number;
  dailyChange?: number;
  dailyChangePct?: number;
}

export function PortfolioSummaryCard({
  holdings,
  totalValue,
  totalInvestment,
  totalProfitLoss,
  totalProfitLossPercent,
  totalCashValue,
  dailyChange,
  dailyChangePct,
}: Props) {
  const [usdRate, setUsdRate] = useState(DEFAULT_USD_TRY_RATE);

  useEffect(() => {
    getCachedUSDRate().then(setUsdRate).catch(() => {});
  }, [totalValue]);

  const grandTotal = totalValue + totalCashValue;
  const grandTotalUSD = usdRate > 0 ? grandTotal / usdRate : 0;
  const assetCount = holdings.length;
  const isPositiveDaily = (dailyChange ?? 0) >= 0;
  const isPositivePnL = totalProfitLoss >= 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-4 md:p-5">
      {/* Row 1: Grand Total */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1">
            Toplam Varlik
          </p>
          <p className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white leading-tight">
            {formatCurrency(grandTotal)} ₺
          </p>
          <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
            ≈ ${formatCurrency(grandTotalUSD)} USD
          </p>
        </div>

        {dailyChange !== undefined && dailyChangePct !== undefined && (
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
              isPositiveDaily
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
            }`}
          >
            {isPositiveDaily ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span>
              {isPositiveDaily ? '+' : ''}
              {dailyChangePct.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Row 2: 4 compact stats */}
      <div className="grid grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-gray-700">
        <div>
          <p className="text-[10px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider">
            Yatirim
          </p>
          <p className="text-sm font-bold text-slate-700 dark:text-gray-200 mt-0.5">
            {formatCurrency(totalInvestment, 0)} ₺
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider">
            Kar/Zarar
          </p>
          <p
            className={`text-sm font-bold mt-0.5 ${
              isPositivePnL
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {isPositivePnL ? '+' : ''}
            {formatCurrency(totalProfitLoss, 0)} ₺
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider">
            Nakit
          </p>
          <p className="text-sm font-bold text-slate-700 dark:text-gray-200 mt-0.5">
            {formatCurrency(totalCashValue, 0)} ₺
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider">
            Varlik
          </p>
          <p className="text-sm font-bold text-slate-700 dark:text-gray-200 mt-0.5">
            {assetCount} adet
          </p>
        </div>
      </div>
    </div>
  );
}
