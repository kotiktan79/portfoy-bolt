import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle, XCircle, Target, Zap, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { Holding, supabase } from '../lib/supabase';
import { formatCurrency, formatPercentage } from '../services/priceService';
import { calculateRSI } from '../services/technicalIndicators';

interface TradingSignalsProps {
  holdings: Holding[];
}

interface Signal {
  symbol: string;
  action: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  reason: string;
  score: number;
  indicators: {
    rsi?: number;
    macd?: { signal: string; strength: number };
    bollinger?: { signal: string };
    trend?: string;
    momentum?: string;
  };
  currentPrice: number;
  pnlPercent: number;
  recommendation: string;
  targetPrice?: number;
  stopLoss?: number;
}

export function TradingSignals({ holdings }: TradingSignalsProps) {
  const [signals, setSignals] = useState<Signal[]>([]);

  useEffect(() => {
    calculateSignals();
  }, [holdings]);

  async function calculateSignals() {
    const calculatedSignals: Signal[] = await Promise.all(
      holdings.map(async (holding) => {
        const invested = holding.purchase_price * holding.quantity;
        const value = holding.current_price * holding.quantity;
        const pnl = value - invested;
        const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;

        let score = 0;
        const reasons: string[] = [];
        const indicators: Signal['indicators'] = {};

        const { data: priceHistory } = await supabase
          .from('price_history')
          .select('price')
          .eq('symbol', holding.symbol)
          .order('recorded_at', { ascending: true })
          .limit(30);

        let rsi = 50;
        if (priceHistory && priceHistory.length >= 15) {
          const prices = priceHistory.map(p => p.price);
          const rsiArray = calculateRSI(prices, 14);
          rsi = rsiArray[rsiArray.length - 1] || 50;
        }
        indicators.rsi = rsi;

      if (rsi < 30) {
        score += 2;
        reasons.push('RSI aşırı satım (AL sinyali)');
      } else if (rsi > 70) {
        score -= 2;
        reasons.push('RSI aşırı alım (SAT sinyali)');
      }

      if (pnlPercent > 20) {
        score -= 1;
        reasons.push('Yüksek kar - kısmen sat');
      } else if (pnlPercent < -10) {
        score -= 1;
        reasons.push('Stop-loss seviyesinde');
      } else if (pnlPercent < -5) {
        score += 1;
        reasons.push('Düşük fiyat - alım fırsatı');
      }

      if (holding.asset_type === 'crypto') {
        indicators.trend = 'Volatil';
        if (pnlPercent < -5) {
          score += 1;
          reasons.push('Kripto düşüşte - alım zamanı');
        }
      }

      if (holding.asset_type === 'stock') {
        if (pnlPercent > 15) {
          score -= 1;
          reasons.push('Hisse yüksek - kar realizasyonu');
        }
      }

      if (holding.asset_type === 'commodity' || holding.symbol === 'ALTIN') {
        indicators.trend = 'Güvenli liman';
        if (pnlPercent < 0) {
          score += 1;
          reasons.push('Altın düşük - biriktirme zamanı');
        }
      }

      let action: Signal['action'] = 'HOLD';
      let recommendation = '';
      let targetPrice: number | undefined;
      let stopLoss: number | undefined;

      if (score >= 3) {
        action = 'STRONG_BUY';
        recommendation = `${holding.symbol} için güçlü AL sinyali. Portföy ağırlığını artır.`;
        targetPrice = holding.current_price * 1.15;
        stopLoss = holding.current_price * 0.95;
      } else if (score >= 1) {
        action = 'BUY';
        recommendation = `${holding.symbol} alım fırsatı. Kademeli alım yapabilirsin.`;
        targetPrice = holding.current_price * 1.10;
        stopLoss = holding.current_price * 0.97;
      } else if (score <= -3) {
        action = 'STRONG_SELL';
        recommendation = `${holding.symbol} hemen SAT! Kar realizasyonu veya zarar durdur.`;
        targetPrice = undefined;
        stopLoss = holding.current_price * 0.95;
      } else if (score <= -1) {
        action = 'SELL';
        recommendation = `${holding.symbol} için kısmen sat. Kazancı koru.`;
        targetPrice = undefined;
        stopLoss = holding.current_price * 0.97;
      } else {
        action = 'HOLD';
        recommendation = `${holding.symbol} beklemede tut. Şu an işlem yapma.`;
        targetPrice = holding.current_price * 1.05;
        stopLoss = holding.current_price * 0.95;
      }

        return {
          symbol: holding.symbol,
          action,
          reason: reasons.join(' • '),
          score,
          indicators,
          currentPrice: holding.current_price,
          pnlPercent,
          recommendation,
          targetPrice,
          stopLoss,
        };
      })
    );

    const sorted = calculatedSignals.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    setSignals(sorted);
  }

  const getActionColor = (action: Signal['action']) => {
    switch (action) {
      case 'STRONG_BUY':
        return 'bg-green-500/20 border-green-500 text-green-400';
      case 'BUY':
        return 'bg-green-500/10 border-green-500/50 text-green-300';
      case 'HOLD':
        return 'bg-yellow-500/10 border-yellow-500/50 text-yellow-300';
      case 'SELL':
        return 'bg-red-500/10 border-red-500/50 text-red-300';
      case 'STRONG_SELL':
        return 'bg-red-500/20 border-red-500 text-red-400';
    }
  };

  const getActionIcon = (action: Signal['action']) => {
    switch (action) {
      case 'STRONG_BUY':
        return <ArrowUpCircle size={28} className="text-green-400" />;
      case 'BUY':
        return <TrendingUp size={28} className="text-green-300" />;
      case 'HOLD':
        return <Target size={28} className="text-yellow-300" />;
      case 'SELL':
        return <TrendingDown size={28} className="text-red-300" />;
      case 'STRONG_SELL':
        return <ArrowDownCircle size={28} className="text-red-400" />;
    }
  };

  const getActionText = (action: Signal['action']) => {
    switch (action) {
      case 'STRONG_BUY':
        return 'GÜÇLÜ AL';
      case 'BUY':
        return 'AL';
      case 'HOLD':
        return 'BEKLE';
      case 'SELL':
        return 'SAT';
      case 'STRONG_SELL':
        return 'ACİL SAT';
    }
  };

  const strongBuys = signals.filter(s => s.action === 'STRONG_BUY');
  const buys = signals.filter(s => s.action === 'BUY');
  const strongSells = signals.filter(s => s.action === 'STRONG_SELL');
  const sells = signals.filter(s => s.action === 'SELL');

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-gray-900 to-slate-900 rounded-2xl p-6 border border-gray-700 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-500/20 rounded-xl">
            <Zap className="text-blue-400" size={28} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white">Anlık İşlem Sinyalleri</h2>
            <p className="text-gray-400">Teknik analiz ve momentum göstergeleri</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="text-green-400" size={20} />
              <p className="text-green-200 font-semibold">Güçlü AL</p>
            </div>
            <p className="text-3xl font-bold text-green-400">{strongBuys.length}</p>
          </div>

          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="text-green-300" size={20} />
              <p className="text-green-200 font-semibold">AL</p>
            </div>
            <p className="text-3xl font-bold text-green-300">{buys.length}</p>
          </div>

          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="text-red-300" size={20} />
              <p className="text-red-200 font-semibold">SAT</p>
            </div>
            <p className="text-3xl font-bold text-red-300">{sells.length}</p>
          </div>

          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="text-red-400" size={20} />
              <p className="text-red-200 font-semibold">Acil SAT</p>
            </div>
            <p className="text-3xl font-bold text-red-400">{strongSells.length}</p>
          </div>
        </div>

        <div className="space-y-4">
          {signals.map((signal) => (
            <div
              key={signal.symbol}
              className={`rounded-xl border-2 p-6 ${getActionColor(signal.action)} backdrop-blur-sm transition-all hover:scale-[1.02]`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  {getActionIcon(signal.action)}
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-1">{signal.symbol}</h3>
                    <p className="text-sm text-gray-300">{formatCurrency(signal.currentPrice)} ₺</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold px-4 py-2 rounded-lg ${getActionColor(signal.action)}`}>
                    {getActionText(signal.action)}
                  </div>
                  <p className={`text-lg font-semibold mt-2 ${signal.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatPercentage(signal.pnlPercent)}
                  </p>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
                <p className="text-white text-lg font-medium mb-2">{signal.recommendation}</p>
                {signal.reason && (
                  <p className="text-gray-400 text-sm">{signal.reason}</p>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {signal.indicators.rsi !== undefined && (
                  <div className="bg-gray-800/30 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">RSI (14)</p>
                    <p className={`text-lg font-bold ${
                      signal.indicators.rsi < 30 ? 'text-green-400' :
                      signal.indicators.rsi > 70 ? 'text-red-400' :
                      'text-yellow-400'
                    }`}>
                      {signal.indicators.rsi.toFixed(1)}
                    </p>
                  </div>
                )}

                {signal.targetPrice && (
                  <div className="bg-gray-800/30 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">Hedef Fiyat</p>
                    <p className="text-lg font-bold text-green-400">
                      {formatCurrency(signal.targetPrice)} ₺
                    </p>
                  </div>
                )}

                {signal.stopLoss && (
                  <div className="bg-gray-800/30 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">Stop Loss</p>
                    <p className="text-lg font-bold text-red-400">
                      {formatCurrency(signal.stopLoss)} ₺
                    </p>
                  </div>
                )}

                <div className="bg-gray-800/30 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Sinyal Gücü</p>
                  <p className={`text-lg font-bold ${
                    Math.abs(signal.score) >= 3 ? 'text-yellow-400' :
                    Math.abs(signal.score) >= 1 ? 'text-blue-400' :
                    'text-gray-400'
                  }`}>
                    {signal.score > 0 ? '+' : ''}{signal.score}
                  </p>
                </div>
              </div>

              {(signal.action === 'STRONG_BUY' || signal.action === 'STRONG_SELL') && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-yellow-200 text-sm">
                    <strong>ÖNEMLİ:</strong> Bu güçlü bir sinyal. Pozisyon al/sat kararlarını dikkatli değerlendir.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="text-blue-400 flex-shrink-0" size={20} />
          <div className="text-sm text-gray-400 space-y-1">
            <p><strong className="text-white">Dikkat:</strong> Bu sinyaller algoritmik hesaplamalara dayanır ve yatırım tavsiyesi değildir.</p>
            <p>RSI &lt; 30: Aşırı satım (alım fırsatı) • RSI &gt; 70: Aşırı alım (satım fırsatı)</p>
            <p>Sinyal gücü ne kadar yüksekse o kadar güçlü işlem sinyali demektir.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
