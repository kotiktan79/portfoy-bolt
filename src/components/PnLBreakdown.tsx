import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, PieChart } from 'lucide-react';
import { getPnLSummaryByAssetType, AssetTypePnLSummary } from '../services/analyticsService';
import { formatCurrency, getCachedUSDRate, formatCurrencyUSD } from '../services/priceService';
import { DEFAULT_USD_TRY_RATE } from '../config';

export function PnLBreakdown() {
  const [summary, setSummary] = useState<AssetTypePnLSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [usdRate, setUsdRate] = useState(DEFAULT_USD_TRY_RATE);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [data, rate] = await Promise.all([
      getPnLSummaryByAssetType(),
      getCachedUSDRate(),
    ]);
    setSummary(data);
    setUsdRate(rate);
    setLoading(false);
  }

  const getAssetTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      stock: 'Hisse Senetleri',
      crypto: 'Kripto Paralar',
      currency: 'Döviz',
      fund: 'Fonlar',
      eurobond: 'Eurobond',
      commodity: 'Emtia',
    };
    return labels[type] || type;
  };

  const getAssetTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      stock: 'blue',
      crypto: 'purple',
      currency: 'green',
      fund: 'orange',
      eurobond: 'red',
      commodity: 'yellow',
    };
    return colors[type] || 'gray';
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-slate-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (summary.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <PieChart className="text-brand-600 dark:text-brand-400" size={24} />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Varlık Tipi Bazında Kar/Zarar
          </h3>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          Henüz veri yok
        </p>
      </div>
    );
  }

  const totalValue = summary.reduce((sum, s) => sum + s.total_value, 0);

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-6">
        <PieChart className="text-brand-600 dark:text-brand-400" size={24} />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
          Varlık Tipi Bazında Kar/Zarar
        </h3>
      </div>

      <div className="space-y-4">
        {summary.map((item) => {
          const color = getAssetTypeColor(item.asset_type);
          const percentage = totalValue > 0 ? (item.total_value / totalValue) * 100 : 0;
          const isPositive = item.total_pnl >= 0;

          return (
            <div
              key={item.asset_type}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full bg-${color}-500`}></div>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {getAssetTypeLabel(item.asset_type)}
                  </span>
                  <span className="text-sm text-gray-500">
                    ({percentage.toFixed(1)}%)
                  </span>
                </div>
                {isPositive ? (
                  <TrendingUp className="text-green-600" size={20} />
                ) : (
                  <TrendingDown className="text-red-600" size={20} />
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Toplam Değer</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(item.total_value)} ₺
                  </p>
                  <p className="text-xs text-gray-500">
                    ${formatCurrencyUSD(item.total_value, usdRate)}
                  </p>
                </div>

                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Gerçekleşmeyen</p>
                  <p className={`font-semibold ${item.total_unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(item.total_unrealized_pnl)} ₺
                  </p>
                  <p className={`text-xs ${item.total_unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.pnl_percent >= 0 ? '+' : ''}{item.pnl_percent.toFixed(2)}%
                  </p>
                </div>

                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Gerçekleşen</p>
                  <p className={`font-semibold ${item.total_realized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(item.total_realized_pnl)} ₺
                  </p>
                </div>

                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Toplam K/Z</p>
                  <p className={`font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(item.total_pnl)} ₺
                  </p>
                  <p className={`text-xs font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    ${formatCurrencyUSD(item.total_pnl, usdRate)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Toplam Gerçekleşmeyen</p>
            <p className={`text-xl font-bold ${summary.reduce((sum, s) => sum + s.total_unrealized_pnl, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(summary.reduce((sum, s) => sum + s.total_unrealized_pnl, 0))} ₺
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Toplam Gerçekleşen</p>
            <p className={`text-xl font-bold ${summary.reduce((sum, s) => sum + s.total_realized_pnl, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(summary.reduce((sum, s) => sum + s.total_realized_pnl, 0))} ₺
            </p>
          </div>
          <div className="col-span-2 md:col-span-1">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Toplam Kar/Zarar</p>
            <p className={`text-2xl font-black ${summary.reduce((sum, s) => sum + s.total_pnl, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(summary.reduce((sum, s) => sum + s.total_pnl, 0))} ₺
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
