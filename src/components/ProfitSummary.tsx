import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatCurrencyUSD, getCachedUSDRate } from '../services/priceService';
import { DEFAULT_USD_TRY_RATE } from '../config';

interface ProfitSummaryProps {
  unrealizedProfit: number;
  unrealizedProfitPercent: number;
}

export function ProfitSummary({ unrealizedProfit, unrealizedProfitPercent }: ProfitSummaryProps) {
  const [realizedProfit, setRealizedProfit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [usdRate, setUsdRate] = useState(DEFAULT_USD_TRY_RATE);

  useEffect(() => {
    fetchRealizedProfit();
    getCachedUSDRate().then(setUsdRate);
  }, []);

  async function fetchRealizedProfit() {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('realized_profit')
        .eq('transaction_type', 'sell');

      if (error) throw error;

      const total = data?.reduce((sum, t) => sum + (t.realized_profit || 0), 0) || 0;
      setRealizedProfit(total);
    } catch (error) {
      console.error('Error fetching realized profit:', error);
    } finally {
      setLoading(false);
    }
  }

  const totalProfit = realizedProfit + unrealizedProfit;
  const isPositive = totalProfit >= 0;

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 animate-pulse">
          <div className="h-20 bg-slate-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
      <div className="group relative bg-gradient-to-br from-green-50 via-emerald-50 to-green-100/50 dark:from-green-900/30 dark:via-emerald-900/30 dark:to-green-900/20 p-6 md:p-8 rounded-2xl shadow-xl border-2 border-green-200/60 dark:border-green-700/50 hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-green-400/10 rounded-full blur-3xl group-hover:bg-green-400/20 transition-all"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs md:text-sm font-bold uppercase tracking-wider text-green-700 dark:text-green-400">Gerçekleşen Kar/Zarar</h3>
            <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-xl shadow-lg">
              <DollarSign className="text-green-600 dark:text-green-400" size={20} />
            </div>
          </div>
          <p className={`text-3xl md:text-4xl font-black mb-2 ${realizedProfit >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {formatCurrency(realizedProfit)} ₺
          </p>
          <p className={`text-base md:text-lg font-bold ${realizedProfit >= 0 ? 'text-green-600/80 dark:text-green-500/80' : 'text-red-600/80 dark:text-red-500/80'}`}>
            ${formatCurrencyUSD(realizedProfit, usdRate)}
          </p>
          <p className="text-xs text-green-600 dark:text-green-500 mt-2 font-semibold">Satışlardan elde edilen</p>
        </div>
      </div>

      <div className="group relative bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-100/50 dark:from-blue-900/30 dark:via-cyan-900/30 dark:to-blue-900/20 p-6 md:p-8 rounded-2xl shadow-xl border-2 border-blue-200/60 dark:border-blue-700/50 hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/10 rounded-full blur-3xl group-hover:bg-blue-400/20 transition-all"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs md:text-sm font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">Gerçekleşmeyen Kar/Zarar</h3>
            <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-xl shadow-lg">
              <TrendingUp className="text-blue-600 dark:text-blue-400" size={20} />
            </div>
          </div>
          <p className={`text-3xl md:text-4xl font-black mb-2 ${unrealizedProfit >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-700 dark:text-red-400'}`}>
            {formatCurrency(unrealizedProfit)} ₺
          </p>
          <p className={`text-base md:text-lg font-bold ${unrealizedProfit >= 0 ? 'text-blue-600/80 dark:text-blue-500/80' : 'text-red-600/80 dark:text-red-500/80'}`}>
            ${formatCurrencyUSD(unrealizedProfit, usdRate)}
          </p>
          <p className={`text-xs mt-2 font-semibold ${unrealizedProfit >= 0 ? 'text-blue-600 dark:text-blue-500' : 'text-red-600 dark:text-red-500'}`}>
            {unrealizedProfit >= 0 ? '+' : ''}{unrealizedProfitPercent.toFixed(2)}% (Mevcut pozisyonlar)
          </p>
        </div>
      </div>

      <div className={`group relative bg-gradient-to-br ${
        isPositive ? 'from-emerald-50 via-teal-50 to-emerald-100/50 dark:from-emerald-900/30 dark:via-teal-900/30 dark:to-emerald-900/20 border-emerald-200/60 dark:border-emerald-700/50' : 'from-red-50 via-rose-50 to-red-100/50 dark:from-red-900/30 dark:via-rose-900/30 dark:to-red-900/20 border-red-200/60 dark:border-red-700/50'
      } p-6 md:p-8 rounded-2xl shadow-xl border-2 hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 overflow-hidden`}>
        <div className={`absolute top-0 right-0 w-32 h-32 ${isPositive ? 'bg-emerald-400/10' : 'bg-red-400/10'} rounded-full blur-3xl group-hover:${isPositive ? 'bg-emerald-400/20' : 'bg-red-400/20'} transition-all`}></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-xs md:text-sm font-bold uppercase tracking-wider ${isPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
              Toplam Kar/Zarar
            </h3>
            <div className={`p-2 rounded-xl shadow-lg ${isPositive ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-red-100 dark:bg-red-900/40'}`}>
              {isPositive ? (
                <TrendingUp className="text-emerald-600 dark:text-emerald-400" size={20} />
              ) : (
                <TrendingDown className="text-red-600 dark:text-red-400" size={20} />
              )}
            </div>
          </div>
          <p className={`text-3xl md:text-4xl font-black mb-2 ${isPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
            {formatCurrency(totalProfit)} ₺
          </p>
          <p className={`text-base md:text-lg font-bold ${isPositive ? 'text-emerald-600/80 dark:text-emerald-500/80' : 'text-red-600/80 dark:text-red-500/80'}`}>
            ${formatCurrencyUSD(totalProfit, usdRate)}
          </p>
          <p className={`text-xs mt-2 font-semibold ${isPositive ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
            Gerçekleşen + Gerçekleşmeyen
          </p>
        </div>
      </div>
    </div>
  );
}
