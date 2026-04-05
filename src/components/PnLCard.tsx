import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { PnLData } from '../services/analyticsService';
import { formatCurrency, formatCurrencyUSD, formatPercentage, getCachedUSDRate } from '../services/priceService';
import { DEFAULT_USD_TRY_RATE } from '../config';

interface PnLCardProps {
  data: PnLData;
}

export function PnLCard({ data }: PnLCardProps) {
  const isPositive = data.change >= 0;
  const [usdRate, setUsdRate] = useState(DEFAULT_USD_TRY_RATE);

  useEffect(() => {
    getCachedUSDRate().then(setUsdRate);
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-slate-600 dark:text-gray-400">{data.period} PnL</p>
        {isPositive ? (
          <TrendingUp className="text-green-600" size={20} />
        ) : (
          <TrendingDown className="text-red-600" size={20} />
        )}
      </div>
      <div className="space-y-1">
        <p
          className={`text-2xl font-bold ${
            isPositive ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {formatCurrency(data.change)} ₺
        </p>
        <p
          className={`text-lg font-semibold ${
            isPositive ? 'text-green-600' : 'text-red-600'
          }`}
        >
          ${formatCurrencyUSD(data.change, usdRate)}
        </p>
        <p
          className={`text-sm font-semibold ${
            isPositive ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {formatPercentage(data.percentage)}
        </p>
      </div>
    </div>
  );
}
