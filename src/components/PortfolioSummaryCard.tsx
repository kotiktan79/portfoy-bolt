import { useState, useEffect } from 'react';
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
  weeklyChange?: number;
  weeklyChangePct?: number;
  monthlyChange?: number;
  monthlyChangePct?: number;
}

export function PortfolioSummaryCard({
  holdings,
  totalValue,
  totalInvestment,
  totalProfitLoss,
  totalCashValue,
  dailyChange,
  dailyChangePct,
  weeklyChange,
  weeklyChangePct,
  monthlyChange,
  monthlyChangePct,
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
                ? 'bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400'
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

      {/* Row 2: PnL periods */}
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-gray-700">
        {[
          { label: 'Günlük', change: dailyChange, pct: dailyChangePct },
          { label: 'Haftalık', change: weeklyChange, pct: weeklyChangePct },
          { label: 'Aylık', change: monthlyChange, pct: monthlyChangePct },
        ].map(p => {
          const val = p.change ?? 0;
          const pct = p.pct ?? 0;
          const pos = val >= 0;
          return (
            <div key={p.label} className={`p-2 rounded-lg text-center ${pos ? 'bg-accent-50 dark:bg-accent-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}>
              <p className="text-[10px] text-slate-500 dark:text-gray-400 font-medium">{p.label}</p>
              <p className={`text-sm font-bold ${pos ? 'text-accent-600 dark:text-accent-400' : 'text-red-600 dark:text-red-400'}`}>
                {pos ? '+' : ''}{formatCurrency(val, 0)} ₺
              </p>
              <p className={`text-[10px] font-semibold ${pos ? 'text-accent-500' : 'text-red-500'}`}>
                {pos ? '+' : ''}{pct.toFixed(2)}%
              </p>
            </div>
          );
        })}
      </div>

      {/* Row 3: Quick stats */}
      <div className="grid grid-cols-4 gap-3 mt-2 pt-2 border-t border-slate-100 dark:border-gray-700">
        <div>
          <p className="text-[10px] font-medium text-slate-400 dark:text-gray-500">Yatırım</p>
          <p className="text-xs font-bold text-slate-700 dark:text-gray-200">{formatCurrency(totalInvestment, 0)} ₺</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-slate-400 dark:text-gray-500">Toplam K/Z</p>
          <p className={`text-xs font-bold ${isPositivePnL ? 'text-accent-600' : 'text-red-600'}`}>
            {isPositivePnL ? '+' : ''}{formatCurrency(totalProfitLoss, 0)} ₺
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-slate-400 dark:text-gray-500">Nakit</p>
          <p className="text-xs font-bold text-slate-700 dark:text-gray-200">{formatCurrency(totalCashValue, 0)} ₺</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-slate-400 dark:text-gray-500">Varlık</p>
          <p className="text-xs font-bold text-slate-700 dark:text-gray-200">{assetCount} adet</p>
        </div>
      </div>
    </div>
  );
}
