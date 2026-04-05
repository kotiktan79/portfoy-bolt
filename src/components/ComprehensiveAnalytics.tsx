import { useEffect, useState } from 'react';
import { getAdvancedMetrics, type AdvancedMetrics } from '../services/analyticsService';
import { Activity, TrendingUp, AlertTriangle, Target, Award, BarChart3 } from 'lucide-react';
import SectorAnalysis from './SectorAnalysis';
import ProfitLossTrend from './ProfitLossTrend';
import PeriodicReturns from './PeriodicReturns';

export default function ComprehensiveAnalytics() {
  const [metrics, setMetrics] = useState<AdvancedMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, []);

  async function loadMetrics() {
    try {
      const data = await getAdvancedMetrics();
      setMetrics(data);
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  }

  function getSharpeRating(sharpe: number): { text: string; color: string } {
    if (sharpe < 0) return { text: 'Zayıf', color: 'text-red-600' };
    if (sharpe < 1) return { text: 'Kabul Edilebilir', color: 'text-orange-600' };
    if (sharpe < 2) return { text: 'İyi', color: 'text-yellow-600' };
    if (sharpe < 3) return { text: 'Çok İyi', color: 'text-green-600' };
    return { text: 'Mükemmel', color: 'text-blue-600' };
  }

  function getDrawdownRating(drawdown: number): { text: string; color: string } {
    if (drawdown < 5) return { text: 'Çok Düşük', color: 'text-green-600' };
    if (drawdown < 10) return { text: 'Düşük', color: 'text-green-500' };
    if (drawdown < 20) return { text: 'Orta', color: 'text-yellow-600' };
    if (drawdown < 30) return { text: 'Yüksek', color: 'text-orange-600' };
    return { text: 'Çok Yüksek', color: 'text-red-600' };
  }

  function getVolatilityRating(volatility: number): { text: string; color: string } {
    if (volatility < 10) return { text: 'Düşük', color: 'text-green-600' };
    if (volatility < 20) return { text: 'Orta', color: 'text-yellow-600' };
    if (volatility < 30) return { text: 'Yüksek', color: 'text-orange-600' };
    return { text: 'Çok Yüksek', color: 'text-red-600' };
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Gelişmiş Analitik</h2>
        </div>

        {!metrics || (metrics.sharpeRatio === 0 && metrics.maxDrawdown === 0) ? (
          <div className="text-center py-12">
            <Activity className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              Analiz için yeterli veri yok. En az 2 günlük portföy geçmişi gerekiyor.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between mb-2">
                  <Award className="w-8 h-8 text-blue-600" />
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${getSharpeRating(metrics.sharpeRatio).color} bg-white dark:bg-gray-800`}>
                    {getSharpeRating(metrics.sharpeRatio).text}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Sharpe Oranı</h3>
                <p className="text-3xl font-bold text-blue-900 dark:text-blue-300">
                  {metrics.sharpeRatio.toFixed(2)}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-500 mt-2">
                  Risk-ayarlı getiri ölçütü
                </p>
              </div>

              <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-xl p-6 border border-red-200 dark:border-red-800">
                <div className="flex items-center justify-between mb-2">
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${getDrawdownRating(metrics.maxDrawdown).color} bg-white dark:bg-gray-800`}>
                    {getDrawdownRating(metrics.maxDrawdown).text}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">Maksimum Düşüş</h3>
                <p className="text-3xl font-bold text-red-900 dark:text-red-300">
                  {metrics.maxDrawdown.toFixed(2)}%
                </p>
                <p className="text-xs text-red-600 dark:text-red-500 mt-2">
                  En büyük zirve-çukur farkı
                </p>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-xl p-6 border border-orange-200 dark:border-orange-800">
                <div className="flex items-center justify-between mb-2">
                  <Activity className="w-8 h-8 text-orange-600" />
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${getVolatilityRating(metrics.volatility).color} bg-white dark:bg-gray-800`}>
                    {getVolatilityRating(metrics.volatility).text}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-orange-700 dark:text-orange-400 mb-1">Volatilite</h3>
                <p className="text-3xl font-bold text-orange-900 dark:text-orange-300">
                  {metrics.volatility.toFixed(2)}%
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-500 mt-2">
                  Yıllık standart sapma
                </p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl p-6 border border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between mb-2">
                  <Target className="w-8 h-8 text-green-600" />
                  <TrendingUp className={`w-5 h-5 ${metrics.cagr >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                </div>
                <h3 className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">CAGR</h3>
                <p className="text-3xl font-bold text-green-900 dark:text-green-300">
                  {metrics.cagr >= 0 ? '+' : ''}{metrics.cagr.toFixed(2)}%
                </p>
                <p className="text-xs text-green-600 dark:text-green-500 mt-2">
                  Yıllık bileşik getiri
                </p>
              </div>
            </div>

            <div className="mt-6 bg-gray-50 dark:bg-gray-900/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Metrik Açıklamaları</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">📊 Sharpe Oranı</h4>
                  <p className="text-gray-700 dark:text-gray-300">
                    Risk başına getiri oranı. Yüksek değerler daha iyi risk-getiri dengesi gösterir.
                    1'in üzeri kabul edilebilir, 2'nin üzeri iyidir.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">📉 Maksimum Düşüş</h4>
                  <p className="text-gray-700 dark:text-gray-300">
                    Portföyün zirveden sonra yaşadığı en büyük değer kaybı. Düşük değerler daha az risk anlamına gelir.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">📈 Volatilite</h4>
                  <p className="text-gray-700 dark:text-gray-300">
                    Getiri değişkenliği. Düşük volatilite daha stabil bir portföy gösterir. %20'nin altı normal kabul edilir.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">🎯 CAGR</h4>
                  <p className="text-gray-700 dark:text-gray-300">
                    Yıllık bileşik büyüme oranı. Portföyün uzun vadeli performansını gösterir. Enflasyonun üzerinde olmalı.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <ProfitLossTrend />
      <PeriodicReturns />
      <SectorAnalysis />
    </div>
  );
}
