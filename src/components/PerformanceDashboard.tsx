import { TrendingDown, Award, ShieldCheck, ShieldAlert, BarChart2 } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { formatCurrency } from '../services/priceService';

interface PerformanceDashboardProps {
  holdings: Holding[];
  totalValue: number;
  totalInvestment: number;
}

export function PerformanceDashboard({ holdings, totalValue, totalInvestment }: PerformanceDashboardProps) {
  const totalPnL = totalValue - totalInvestment;
  const totalPnLPercent = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;

  const holdingsWithPnL = holdings.map(h => ({
    ...h,
    pnlPercent: h.purchase_price > 0 ? ((h.current_price - h.purchase_price) / h.purchase_price) * 100 : 0,
    value: h.current_price * h.quantity,
  }));

  const bestPerformer = holdingsWithPnL.length > 0
    ? holdingsWithPnL.reduce((best, h) => h.pnlPercent > best.pnlPercent ? h : best, holdingsWithPnL[0])
    : null;

  const worstPerformer = holdingsWithPnL.length > 0
    ? holdingsWithPnL.reduce((worst, h) => h.pnlPercent < worst.pnlPercent ? h : worst, holdingsWithPnL[0])
    : null;

  const herfindahlIndex = totalValue > 0
    ? holdingsWithPnL.reduce((sum, h) => {
        const weight = h.value / totalValue;
        return sum + weight * weight;
      }, 0)
    : 1;

  const diversificationScore = Math.round((1 - herfindahlIndex) * 100);

  const assetTypeCount = new Set(holdings.map(h => h.asset_type)).size;
  const totalRealized = holdings.reduce((sum, h) => sum + (h.total_realized_pnl || 0), 0);

  const getDiversificationLabel = (score: number) => {
    if (score >= 80) return { label: 'Mükemmel', color: 'text-green-600 dark:text-green-400' };
    if (score >= 60) return { label: 'İyi', color: 'text-emerald-600 dark:text-emerald-400' };
    if (score >= 40) return { label: 'Orta', color: 'text-yellow-600 dark:text-yellow-400' };
    return { label: 'Düşük', color: 'text-red-600 dark:text-red-400' };
  };

  const divLabel = getDiversificationLabel(diversificationScore);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <div className="group relative bg-gradient-to-br from-blue-50 via-blue-50 to-blue-100/70 dark:from-blue-900/25 dark:via-blue-900/20 dark:to-blue-800/15 rounded-2xl border border-blue-200/60 dark:border-blue-500/30 p-5 shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-300 overflow-hidden">
        <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-800/40 rounded-xl">
              <BarChart2 size={18} className="text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-xs font-bold bg-blue-100 dark:bg-blue-800/40 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">
              Toplam
            </span>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-600/80 dark:text-blue-400/80 mb-1">Toplam Getiri</p>
          <p className={`text-3xl font-black leading-none mb-2 ${totalPnLPercent >= 0 ? 'text-blue-700 dark:text-blue-200' : 'text-red-600 dark:text-red-400'}`}>
            {totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%
          </p>
          <p className={`text-sm font-semibold ${totalPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)} ₺
          </p>
          {totalRealized !== 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Gerçekleşen: {formatCurrency(totalRealized)} ₺
            </p>
          )}
        </div>
      </div>

      <div className="group relative bg-gradient-to-br from-green-50 via-emerald-50 to-green-100/70 dark:from-green-900/25 dark:via-green-900/20 dark:to-emerald-800/15 rounded-2xl border border-green-200/60 dark:border-green-500/30 p-5 shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-300 overflow-hidden">
        <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/10 rounded-full blur-2xl group-hover:bg-green-500/20 transition-all"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-green-100 dark:bg-green-800/40 rounded-xl">
              <Award size={18} className="text-green-600 dark:text-green-400" />
            </div>
            <span className="text-xs font-bold bg-green-100 dark:bg-green-800/40 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">
              En İyi
            </span>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-green-600/80 dark:text-green-400/80 mb-1">En İyi Performans</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mb-2 truncate">
            {bestPerformer?.symbol || '-'}
          </p>
          <p className="text-sm font-bold text-green-600 dark:text-green-400">
            {bestPerformer ? `+${bestPerformer.pnlPercent.toFixed(2)}%` : '-'}
          </p>
          {bestPerformer && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
              {bestPerformer.asset_type}
            </p>
          )}
        </div>
      </div>

      <div className="group relative bg-gradient-to-br from-red-50 via-rose-50 to-red-100/70 dark:from-red-900/25 dark:via-red-900/20 dark:to-rose-800/15 rounded-2xl border border-red-200/60 dark:border-red-500/30 p-5 shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-300 overflow-hidden">
        <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/10 rounded-full blur-2xl group-hover:bg-red-500/20 transition-all"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-red-100 dark:bg-red-800/40 rounded-xl">
              <TrendingDown size={18} className="text-red-600 dark:text-red-400" />
            </div>
            <span className="text-xs font-bold bg-red-100 dark:bg-red-800/40 text-red-700 dark:text-red-300 px-2 py-1 rounded-full">
              En Kötü
            </span>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-red-600/80 dark:text-red-400/80 mb-1">En Düşük Performans</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mb-2 truncate">
            {worstPerformer?.symbol || '-'}
          </p>
          <p className="text-sm font-bold text-red-600 dark:text-red-400">
            {worstPerformer ? `${worstPerformer.pnlPercent.toFixed(2)}%` : '-'}
          </p>
          {worstPerformer && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
              {worstPerformer.asset_type}
            </p>
          )}
        </div>
      </div>

      <div className="group relative bg-gradient-to-br from-teal-50 via-cyan-50 to-teal-100/70 dark:from-teal-900/25 dark:via-teal-900/20 dark:to-cyan-800/15 rounded-2xl border border-teal-200/60 dark:border-teal-500/30 p-5 shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-300 overflow-hidden">
        <div className="absolute top-0 right-0 w-20 h-20 bg-teal-500/10 rounded-full blur-2xl group-hover:bg-teal-500/20 transition-all"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-teal-100 dark:bg-teal-800/40 rounded-xl">
              {diversificationScore >= 50
                ? <ShieldCheck size={18} className="text-teal-600 dark:text-teal-400" />
                : <ShieldAlert size={18} className="text-yellow-600 dark:text-yellow-400" />
              }
            </div>
            <span className="text-xs font-bold bg-teal-100 dark:bg-teal-800/40 text-teal-700 dark:text-teal-300 px-2 py-1 rounded-full">
              Skor
            </span>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-teal-600/80 dark:text-teal-400/80 mb-1">Çeşitlendirme</p>
          <div className="flex items-end gap-2 mb-2">
            <p className="text-3xl font-black text-slate-900 dark:text-white leading-none">{diversificationScore}</p>
            <p className="text-lg font-bold text-slate-500 dark:text-slate-400 mb-0.5">/100</p>
          </div>
          <div className="w-full bg-slate-200 dark:bg-gray-700 rounded-full h-1.5 mb-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-700 ${
                diversificationScore >= 70 ? 'bg-green-500' :
                diversificationScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${diversificationScore}%` }}
            ></div>
          </div>
          <p className={`text-xs font-bold ${divLabel.color}`}>
            {divLabel.label} • {holdings.length} varlık • {assetTypeCount} tip
          </p>
        </div>
      </div>
    </div>
  );
}
