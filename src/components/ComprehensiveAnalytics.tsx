import { useEffect, useState } from 'react';
import { getAdvancedMetrics, getHistoricalSnapshots, type AdvancedMetrics } from '../services/analyticsService';
import { calculateRSI, calculateMACD, calculateBollingerBands } from '../services/technicalIndicators';
import { Activity, TrendingUp, TrendingDown, AlertTriangle, Target, Award, BarChart3 } from 'lucide-react';
import SectorAnalysis from './SectorAnalysis';
import PeriodicReturns from './PeriodicReturns';

interface TechIndicatorSummary {
  rsi: number;
  rsiSignal: 'oversold' | 'neutral' | 'overbought';
  macdSignal: 'bullish' | 'neutral' | 'bearish';
  macdHistogram: number;
  bollingerPosition: 'below_lower' | 'near_lower' | 'middle' | 'near_upper' | 'above_upper';
  bollingerPctB: number;
}

export default function ComprehensiveAnalytics() {
  const [metrics, setMetrics] = useState<AdvancedMetrics | null>(null);
  const [techIndicators, setTechIndicators] = useState<TechIndicatorSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, []);

  async function loadMetrics() {
    try {
      const [data, snapshots] = await Promise.all([
        getAdvancedMetrics(),
        getHistoricalSnapshots(60),
      ]);
      setMetrics(data);

      if (snapshots.length >= 14) {
        const prices = snapshots.map(s => s.total_value);
        const rsiValues = calculateRSI(prices, 14);
        const rsi = rsiValues[rsiValues.length - 1] || 50;

        const macd = calculateMACD(prices);
        const lastHist = macd.histogram[macd.histogram.length - 1] || 0;
        const prevHist = macd.histogram[macd.histogram.length - 2] || 0;

        const bb = calculateBollingerBands(prices, 20);
        const lastPrice = prices[prices.length - 1];
        const upper = bb.upper[bb.upper.length - 1] || lastPrice;
        const lower = bb.lower[bb.lower.length - 1] || lastPrice;
        const bbRange = upper - lower;
        const pctB = bbRange > 0 ? ((lastPrice - lower) / bbRange) * 100 : 50;

        let bollingerPosition: TechIndicatorSummary['bollingerPosition'] = 'middle';
        if (pctB <= 5) bollingerPosition = 'below_lower';
        else if (pctB <= 25) bollingerPosition = 'near_lower';
        else if (pctB >= 95) bollingerPosition = 'above_upper';
        else if (pctB >= 75) bollingerPosition = 'near_upper';

        setTechIndicators({
          rsi: isFinite(rsi) ? rsi : 50,
          rsiSignal: rsi <= 30 ? 'oversold' : rsi >= 70 ? 'overbought' : 'neutral',
          macdSignal: lastHist > 0 && lastHist > prevHist ? 'bullish' : lastHist < 0 && lastHist < prevHist ? 'bearish' : 'neutral',
          macdHistogram: lastHist,
          bollingerPosition,
          bollingerPctB: isFinite(pctB) ? pctB : 50,
        });
      }
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  }

  function getSharpeRating(sharpe: number): { text: string; color: string } {
    if (sharpe < 0) return { text: 'Zayıf', color: 'text-red-600' };
    if (sharpe < 1) return { text: 'Kabul Edilebilir', color: 'text-brand-600' };
    if (sharpe < 2) return { text: 'İyi', color: 'text-yellow-600' };
    if (sharpe < 3) return { text: 'Çok İyi', color: 'text-green-600' };
    return { text: 'Mükemmel', color: 'text-brand-600' };
  }

  function getDrawdownRating(drawdown: number): { text: string; color: string } {
    if (drawdown < 5) return { text: 'Çok Düşük', color: 'text-green-600' };
    if (drawdown < 10) return { text: 'Düşük', color: 'text-green-500' };
    if (drawdown < 20) return { text: 'Orta', color: 'text-yellow-600' };
    if (drawdown < 30) return { text: 'Yüksek', color: 'text-brand-600' };
    return { text: 'Çok Yüksek', color: 'text-red-600' };
  }

  function getVolatilityRating(volatility: number): { text: string; color: string } {
    if (volatility < 10) return { text: 'Düşük', color: 'text-green-600' };
    if (volatility < 20) return { text: 'Orta', color: 'text-yellow-600' };
    if (volatility < 30) return { text: 'Yüksek', color: 'text-brand-600' };
    return { text: 'Çok Yüksek', color: 'text-red-600' };
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="card-secondary p-6">
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
      <div className="card-secondary p-6">
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 className="w-6 h-6 text-brand-600" />
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
              <div className="bg-gradient-to-br from-brand-50 to-brand-100 dark:from-brand-900/20 dark:to-brand-800/20 rounded-xl p-6 border border-brand-200 dark:border-brand-800">
                <div className="flex items-center justify-between mb-2">
                  <Award className="w-8 h-8 text-brand-600" />
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${getSharpeRating(metrics.sharpeRatio).color} bg-white dark:bg-gray-800`}>
                    {getSharpeRating(metrics.sharpeRatio).text}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-brand-700 dark:text-brand-400 mb-1">Sharpe Oranı</h3>
                <p className="text-3xl font-bold text-brand-900 dark:text-brand-300">
                  {metrics.sharpeRatio.toFixed(2)}
                </p>
                <p className="text-xs text-brand-600 dark:text-brand-500 mt-2">
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

              <div className="bg-gradient-to-br from-brand-50 to-brand-100 dark:from-brand-900/20 dark:to-brand-800/20 rounded-xl p-6 border border-brand-200 dark:border-brand-800">
                <div className="flex items-center justify-between mb-2">
                  <Activity className="w-8 h-8 text-brand-600" />
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${getVolatilityRating(metrics.volatility).color} bg-white dark:bg-gray-800`}>
                    {getVolatilityRating(metrics.volatility).text}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-brand-700 dark:text-brand-400 mb-1">Volatilite</h3>
                <p className="text-3xl font-bold text-brand-900 dark:text-brand-300">
                  {metrics.volatility.toFixed(2)}%
                </p>
                <p className="text-xs text-brand-600 dark:text-brand-500 mt-2">
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
                  <h4 className="font-semibold text-brand-600 dark:text-brand-400 mb-2">📊 Sharpe Oranı</h4>
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
                  <h4 className="font-semibold text-brand-600 dark:text-brand-400 mb-2">📈 Volatilite</h4>
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

      {techIndicators && (
        <div className="card-secondary p-6">
          <div className="flex items-center gap-3 mb-6">
            <Activity className="w-6 h-6 text-brand-600" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Teknik Göstergeler</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* RSI */}
            <div className="bg-gradient-to-br from-brand-50 to-brand-100 dark:from-brand-900/20 dark:to-brand-800/20 rounded-xl p-5 border border-brand-200 dark:border-brand-800">
              <h3 className="text-sm font-medium text-brand-700 dark:text-brand-400 mb-2">RSI (14)</h3>
              <p className="text-3xl font-bold text-brand-900 dark:text-brand-300 mb-2">
                {techIndicators.rsi.toFixed(1)}
              </p>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    techIndicators.rsi <= 30 ? 'bg-green-500' : techIndicators.rsi >= 70 ? 'bg-red-500' : 'bg-brand-500'
                  }`}
                  style={{ width: `${Math.min(techIndicators.rsi, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>Aşırı Satım (30)</span>
                <span>Aşırı Alım (70)</span>
              </div>
              <div className={`mt-2 text-xs font-semibold px-2 py-1 rounded-full inline-block ${
                techIndicators.rsiSignal === 'oversold' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                techIndicators.rsiSignal === 'overbought' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {techIndicators.rsiSignal === 'oversold' ? 'Aşırı Satım - Alım Fırsatı' :
                 techIndicators.rsiSignal === 'overbought' ? 'Aşırı Alım - Dikkat' : 'Nötr Bölge'}
              </div>
            </div>

            {/* MACD */}
            <div className="bg-gradient-to-br from-brand-50 to-brand-100 dark:from-brand-900/20 dark:to-brand-800/20 rounded-xl p-5 border border-brand-200 dark:border-brand-800">
              <h3 className="text-sm font-medium text-brand-700 dark:text-brand-400 mb-2">MACD</h3>
              <div className="flex items-center gap-2 mb-2">
                {techIndicators.macdSignal === 'bullish' ? (
                  <TrendingUp className="w-8 h-8 text-green-600" />
                ) : techIndicators.macdSignal === 'bearish' ? (
                  <TrendingDown className="w-8 h-8 text-red-600" />
                ) : (
                  <Activity className="w-8 h-8 text-gray-500" />
                )}
                <p className={`text-2xl font-bold ${
                  techIndicators.macdSignal === 'bullish' ? 'text-green-600' :
                  techIndicators.macdSignal === 'bearish' ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {techIndicators.macdSignal === 'bullish' ? 'Yükseliş' :
                   techIndicators.macdSignal === 'bearish' ? 'Düşüş' : 'Nötr'}
                </p>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                Histogram: {techIndicators.macdHistogram >= 0 ? '+' : ''}{techIndicators.macdHistogram.toFixed(0)}
              </p>
              <p className="text-xs text-brand-600 dark:text-brand-500">
                {techIndicators.macdSignal === 'bullish'
                  ? 'MACD sinyal çizgisinin üzerinde ve yükseliyor'
                  : techIndicators.macdSignal === 'bearish'
                  ? 'MACD sinyal çizgisinin altında ve düşüyor'
                  : 'MACD sinyal çizgisine yakın, belirgin yön yok'}
              </p>
            </div>

            {/* Bollinger Bands */}
            <div className="bg-gradient-to-br from-brand-50 to-brand-100 dark:from-brand-900/20 dark:to-brand-800/20 rounded-xl p-5 border border-amber-200 dark:border-amber-800">
              <h3 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">Bollinger Bantları</h3>
              <p className="text-3xl font-bold text-amber-900 dark:text-amber-300 mb-2">
                %{techIndicators.bollingerPctB.toFixed(0)}
              </p>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2 relative">
                <div className="absolute left-[20%] top-0 w-px h-2.5 bg-gray-400" />
                <div className="absolute left-[80%] top-0 w-px h-2.5 bg-gray-400" />
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    techIndicators.bollingerPctB <= 20 ? 'bg-green-500' :
                    techIndicators.bollingerPctB >= 80 ? 'bg-red-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(Math.max(techIndicators.bollingerPctB, 2), 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>Alt Bant</span>
                <span>Orta</span>
                <span>Üst Bant</span>
              </div>
              <div className={`mt-2 text-xs font-semibold px-2 py-1 rounded-full inline-block ${
                techIndicators.bollingerPosition === 'below_lower' || techIndicators.bollingerPosition === 'near_lower'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : techIndicators.bollingerPosition === 'above_upper' || techIndicators.bollingerPosition === 'near_upper'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {techIndicators.bollingerPosition === 'below_lower' ? 'Alt Bandın Altında - Güçlü Alım'
                  : techIndicators.bollingerPosition === 'near_lower' ? 'Alt Banda Yakın - Alım Fırsatı'
                  : techIndicators.bollingerPosition === 'above_upper' ? 'Üst Bandın Üstünde - Aşırı Alım'
                  : techIndicators.bollingerPosition === 'near_upper' ? 'Üst Banda Yakın - Dikkat'
                  : 'Orta Bölge - Nötr'}
              </div>
            </div>
          </div>
        </div>
      )}

      <PeriodicReturns />
      <SectorAnalysis />
    </div>
  );
}
