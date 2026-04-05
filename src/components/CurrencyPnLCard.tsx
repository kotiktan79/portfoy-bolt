import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { formatCurrencyAmount, getCurrencySymbol } from '../services/currencyService';

interface CurrencyPnLCardProps {
  invested: number;
  current: number;
  pnl: number;
  pnlPercent: number;
  currency: string;
  symbol: string;
  assetType: string;
  originalCurrency?: string;
  onRefresh?: () => void;
}

export function CurrencyPnLCard({
  invested,
  current,
  pnl,
  pnlPercent,
  currency,
  symbol,
  assetType,
  originalCurrency,
  onRefresh,
}: CurrencyPnLCardProps) {
  const isPositive = pnl >= 0;
  const showConversion = originalCurrency && originalCurrency !== currency;

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{symbol}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{assetType}</p>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Yatırım:</span>
          <div className="text-right">
            <span className="font-semibold text-gray-900 dark:text-white">
              {formatCurrencyAmount(invested, currency)}
            </span>
            {showConversion && originalCurrency && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ({getCurrencySymbol(originalCurrency)} bazlı)
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Güncel:</span>
          <span className="font-semibold text-gray-900 dark:text-white">
            {formatCurrencyAmount(current, currency)}
          </span>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Kar/Zarar:</span>
              {isPositive ? (
                <TrendingUp className="w-4 h-4 text-green-600" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
            </div>
            <div className="text-right">
              <p
                className={`text-lg font-bold ${
                  isPositive ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {formatCurrencyAmount(pnl, currency)}
              </p>
              <p
                className={`text-sm font-semibold ${
                  isPositive ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {showConversion && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            {originalCurrency} → {currency} kuruna göre hesaplandı
          </p>
        </div>
      )}
    </div>
  );
}
