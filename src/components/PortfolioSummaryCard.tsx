import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Wallet, PieChart, Coins, Package, LucideIcon } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { formatCurrency, formatCurrencyUSD, getCachedUSDRate } from '../services/priceService';
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
  totalProfitLossPercent,
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

  const periods = [
    { label: 'Günlük', change: dailyChange, pct: dailyChangePct },
    { label: 'Haftalık', change: weeklyChange, pct: weeklyChangePct },
    { label: 'Aylık', change: monthlyChange, pct: monthlyChangePct },
  ];

  return (
    <div className="card-hero p-5 md:p-7">
      {/* Row 1: Hero balance */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="t-eyebrow">Toplam Varlık</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-accent-600 dark:text-accent-400">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
              Canlı
            </span>
          </div>
          <p className="kpi-hero-number text-slate-900 dark:text-white">
            {formatCurrency(grandTotal)}
            <span className="text-2xl md:text-3xl font-bold text-slate-400 dark:text-gray-500 ml-2">₺</span>
          </p>
          <p className="t-caption mt-1.5">
            ≈ <span className="font-semibold text-slate-600 dark:text-gray-300">${formatCurrency(grandTotalUSD)}</span> USD
          </p>
        </div>

        {dailyChange !== undefined && dailyChangePct !== undefined && (
          <div className={`pill ${isPositiveDaily ? 'pill-positive' : 'pill-negative'} !px-3 !py-2 !text-sm shadow-md`}>
            {isPositiveDaily ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            <span className="font-bold">
              {isPositiveDaily ? '+' : ''}
              {dailyChangePct.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Row 2: PnL periods */}
      <div className="grid grid-cols-3 gap-2 md:gap-3 mb-4">
        {periods.map(p => {
          const val = p.change ?? 0;
          const pct = p.pct ?? 0;
          const pos = val >= 0;
          return (
            <div
              key={p.label}
              className={`p-3 rounded-xl backdrop-blur-sm transition-colors ${
                pos
                  ? 'bg-accent-50/70 dark:bg-accent-950/20 ring-1 ring-accent-200/50 dark:ring-accent-900/30'
                  : 'bg-red-50/70 dark:bg-red-950/20 ring-1 ring-red-200/50 dark:ring-red-900/30'
              }`}
            >
              <p className="t-eyebrow !text-[9px]">{p.label}</p>
              <p className={`text-base font-bold tabular-nums mt-0.5 ${
                pos ? 'text-accent-700 dark:text-accent-300' : 'text-red-700 dark:text-red-300'
              }`}>
                {pos ? '+' : ''}{formatCurrency(val, 0)} ₺
              </p>
              <p className={`text-[11px] font-semibold tabular-nums ${
                pos ? 'text-accent-600 dark:text-accent-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {pos ? '+' : ''}${formatCurrencyUSD(val, usdRate)}
              </p>
              <p className={`text-[10px] font-medium tabular-nums opacity-75 ${
                pos ? 'text-accent-600 dark:text-accent-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {pos ? '+' : ''}{pct.toFixed(2)}%
              </p>
            </div>
          );
        })}
      </div>

      {/* Row 3: Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-slate-200/60 dark:border-gray-800/60">
        <MiniStat
          icon={Wallet}
          label="Yatırım"
          value={`${formatCurrency(totalInvestment, 0)} ₺`}
        />
        <MiniStat
          icon={PieChart}
          label="Toplam K/Z"
          value={`${isPositivePnL ? '+' : ''}${formatCurrency(totalProfitLoss, 0)} ₺`}
          subUsd={`${isPositivePnL ? '+' : ''}$${formatCurrencyUSD(totalProfitLoss, usdRate)}`}
          sub={`${isPositivePnL ? '+' : ''}${totalProfitLossPercent.toFixed(2)}%`}
          tone={isPositivePnL ? 'positive' : 'negative'}
        />
        <MiniStat
          icon={Coins}
          label="Nakit"
          value={`${formatCurrency(totalCashValue, 0)} ₺`}
        />
        <MiniStat
          icon={Package}
          label="Varlık"
          value={`${assetCount} adet`}
        />
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  sub,
  subUsd,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  subUsd?: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  const toneClass =
    tone === 'positive' ? 'text-accent-700 dark:text-accent-300' :
    tone === 'negative' ? 'text-red-700 dark:text-red-300' :
    'text-slate-800 dark:text-gray-200';

  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 p-1.5 rounded-lg bg-slate-100/80 dark:bg-gray-800/60 text-slate-500 dark:text-gray-400">
        <Icon size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium text-slate-500 dark:text-gray-500 uppercase tracking-wide">{label}</p>
        <p className={`text-sm font-bold tabular-nums truncate ${toneClass}`}>{value}</p>
        {subUsd && <p className={`text-[10px] font-semibold tabular-nums ${toneClass} opacity-80`}>{subUsd}</p>}
        {sub && <p className={`text-[10px] font-medium tabular-nums ${toneClass} opacity-70`}>{sub}</p>}
      </div>
    </div>
  );
}
