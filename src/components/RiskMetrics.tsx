import { useState, useEffect } from 'react';
import { TrendingDown, Activity, AlertTriangle } from 'lucide-react';
import { getHistoricalSnapshots } from '../services/analyticsService';
import { calculateVolatility, calculateSharpeRatio, calculateMaxDrawdown } from '../services/technicalIndicators';

export function RiskMetrics() {
  const [metrics, setMetrics] = useState<{
    volatility: number;
    sharpeRatio: number;
    maxDrawdown: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, []);

  async function loadMetrics() {
    setLoading(true);
    const snapshots = await getHistoricalSnapshots(60);

    if (snapshots.length > 1) {
      const prices = snapshots.map((s) => Number(s.total_value));

      const volatility = calculateVolatility(prices, Math.min(30, prices.length));
      const sharpeRatio = calculateSharpeRatio(prices);
      const maxDrawdown = calculateMaxDrawdown(prices);

      setMetrics({ volatility, sharpeRatio, maxDrawdown });
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Risk Metrikleri</h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700"></div>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Risk Metrikleri</h3>
        <div className="text-center py-8 text-slate-500">
          <Activity className="mx-auto mb-2" size={32} />
          <p>Yeterli veri yok</p>
        </div>
      </div>
    );
  }

  const getRiskLevel = (volatility: number) => {
    if (volatility < 10) return { label: 'Düşük', color: 'text-green-600' };
    if (volatility < 20) return { label: 'Orta', color: 'text-yellow-600' };
    return { label: 'Yüksek', color: 'text-red-600' };
  };

  const getSharpeLevel = (sharpe: number) => {
    if (sharpe > 2) return { label: 'Mükemmel', color: 'text-green-600' };
    if (sharpe > 1) return { label: 'İyi', color: 'text-green-600' };
    if (sharpe > 0) return { label: 'Kabul Edilebilir', color: 'text-yellow-600' };
    return { label: 'Zayıf', color: 'text-red-600' };
  };

  const riskLevel = getRiskLevel(metrics.volatility);
  const sharpeLevel = getSharpeLevel(metrics.sharpeRatio);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Risk Metrikleri</h3>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 text-yellow-600 rounded-lg">
              <Activity size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-600">Volatilite (Yıllık)</p>
              <p className={`text-xl font-bold ${riskLevel.color}`}>
                {metrics.volatility.toFixed(2)}%
              </p>
            </div>
          </div>
          <span className={`text-sm font-semibold ${riskLevel.color}`}>
            {riskLevel.label}
          </span>
        </div>

        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <TrendingDown size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-600">Sharpe Oranı</p>
              <p className={`text-xl font-bold ${sharpeLevel.color}`}>
                {metrics.sharpeRatio.toFixed(2)}
              </p>
            </div>
          </div>
          <span className={`text-sm font-semibold ${sharpeLevel.color}`}>
            {sharpeLevel.label}
          </span>
        </div>

        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 text-red-600 rounded-lg">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-600">Maksimum Düşüş</p>
              <p className="text-xl font-bold text-red-600">
                {metrics.maxDrawdown.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-slate-600">
          <span className="font-semibold">Not:</span> Volatilite portföyünüzün değerindeki dalgalanmayı,
          Sharpe oranı risk-getiri dengesini, maksimum düşüş ise en büyük değer kaybını gösterir.
        </p>
      </div>
    </div>
  );
}
