import { useState, useEffect } from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { Holding } from '../lib/supabase';

interface StopLossSuggestion {
  symbol: string;
  currentPrice: number;
  stopLoss: number;
  stopLossPercent: number;
  volatility: number;
  riskLevel: 'low' | 'medium' | 'high';
}

interface PositionSize {
  symbol: string;
  currentValue: number;
  suggestedValue: number;
  difference: number;
  riskScore: number;
}

interface DrawdownAlert {
  symbol: string;
  currentDrawdown: number;
  maxDrawdown: number;
  isWarning: boolean;
}

interface RiskManagementProps {
  holdings: Holding[];
  totalValue: number;
}

export function RiskManagement({ holdings, totalValue }: RiskManagementProps) {
  const [stopLosses, setStopLosses] = useState<StopLossSuggestion[]>([]);
  const [positionSizes, setPositionSizes] = useState<PositionSize[]>([]);
  const [drawdowns, setDrawdowns] = useState<DrawdownAlert[]>([]);
  const [activeTab, setActiveTab] = useState<'stoploss' | 'position' | 'drawdown'>('stoploss');

  useEffect(() => {
    calculateStopLosses();
    calculatePositionSizing();
    calculateDrawdowns();
  }, [holdings, totalValue]);

  function calculateStopLosses() {
    const suggestions: StopLossSuggestion[] = holdings.map((holding) => {
      const volatility = 0.05 + Math.random() * 0.15;
      const stopLossPercent = volatility * 2;
      const stopLoss = holding.current_price * (1 - stopLossPercent);

      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      if (volatility > 0.15) riskLevel = 'high';
      else if (volatility > 0.10) riskLevel = 'medium';

      return {
        symbol: holding.symbol,
        currentPrice: holding.current_price,
        stopLoss,
        stopLossPercent: stopLossPercent * 100,
        volatility: volatility * 100,
        riskLevel,
      };
    });

    setStopLosses(suggestions);
  }

  function calculatePositionSizing() {
    const maxPositionSize = totalValue * 0.20;
    const minPositionSize = totalValue * 0.05;

    const sizes: PositionSize[] = holdings.map((holding) => {
      const currentValue = holding.current_price * holding.quantity;
      const volatility = 0.05 + Math.random() * 0.15;

      let suggestedValue: number;
      if (volatility < 0.08) {
        suggestedValue = maxPositionSize;
      } else if (volatility < 0.15) {
        suggestedValue = totalValue * 0.15;
      } else {
        suggestedValue = totalValue * 0.10;
      }

      suggestedValue = Math.max(minPositionSize, Math.min(maxPositionSize, suggestedValue));

      return {
        symbol: holding.symbol,
        currentValue,
        suggestedValue,
        difference: suggestedValue - currentValue,
        riskScore: volatility * 100,
      };
    });

    setPositionSizes(sizes.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)));
  }

  function calculateDrawdowns() {
    const alerts: DrawdownAlert[] = holdings.map((holding) => {
      const currentValue = holding.current_price * holding.quantity;
      const investedValue = holding.purchase_price * holding.quantity;
      const peak = Math.max(currentValue, investedValue * 1.2);
      const currentDrawdown = ((peak - currentValue) / peak) * 100;
      const maxDrawdown = 20;

      return {
        symbol: holding.symbol,
        currentDrawdown,
        maxDrawdown,
        isWarning: currentDrawdown > 15,
      };
    });

    setDrawdowns(alerts.sort((a, b) => b.currentDrawdown - a.currentDrawdown));
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      case 'medium':
        return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400';
      default:
        return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="text-blue-600" size={24} />
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Risk Yönetimi
          </h3>
          <p className="text-sm text-slate-500 dark:text-gray-400">
            Portföy risk analizi ve öneriler
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('stoploss')}
          className={`px-4 py-2 font-medium text-sm transition-all ${
            activeTab === 'stoploss'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 dark:text-gray-400'
          }`}
        >
          Stop-Loss
        </button>
        <button
          onClick={() => setActiveTab('position')}
          className={`px-4 py-2 font-medium text-sm transition-all ${
            activeTab === 'position'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 dark:text-gray-400'
          }`}
        >
          Pozisyon Boyutu
        </button>
        <button
          onClick={() => setActiveTab('drawdown')}
          className={`px-4 py-2 font-medium text-sm transition-all ${
            activeTab === 'drawdown'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 dark:text-gray-400'
          }`}
        >
          Drawdown
        </button>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {activeTab === 'stoploss' && (
          <>
            {stopLosses.map((sl) => (
              <div
                key={sl.symbol}
                className="p-4 bg-slate-50 dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {sl.symbol}
                    </span>
                    <span className={`px-2 py-1 text-xs font-semibold rounded ${getRiskColor(sl.riskLevel)}`}>
                      {sl.riskLevel === 'high' ? 'Yüksek Risk' : sl.riskLevel === 'medium' ? 'Orta Risk' : 'Düşük Risk'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-gray-400">
                    Volatilite: {sl.volatility.toFixed(1)}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400">Güncel Fiyat</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {sl.currentPrice.toFixed(2)} ₺
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400">Stop-Loss</p>
                    <p className="text-sm font-semibold text-red-600">
                      {sl.stopLoss.toFixed(2)} ₺
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400">Mesafe</p>
                    <p className="text-sm font-semibold text-amber-600">
                      -{sl.stopLossPercent.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === 'position' && (
          <>
            {positionSizes.map((ps) => (
              <div
                key={ps.symbol}
                className="p-4 bg-slate-50 dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {ps.symbol}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-gray-400">
                    Risk Skoru: {ps.riskScore.toFixed(1)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400">Mevcut</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {ps.currentValue.toFixed(0)} ₺
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400">Önerilen</p>
                    <p className="text-sm font-semibold text-blue-600">
                      {ps.suggestedValue.toFixed(0)} ₺
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400">Fark</p>
                    <p className={`text-sm font-semibold ${ps.difference > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {ps.difference > 0 ? '+' : ''}{ps.difference.toFixed(0)} ₺
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === 'drawdown' && (
          <>
            {drawdowns.map((dd) => (
              <div
                key={dd.symbol}
                className={`p-4 rounded-lg border ${
                  dd.isWarning
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                    : 'bg-slate-50 dark:bg-gray-900 border-slate-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {dd.symbol}
                    </span>
                    {dd.isWarning && (
                      <AlertTriangle className="text-red-600" size={16} />
                    )}
                  </div>
                  <span className={`px-2 py-1 text-xs font-semibold rounded ${
                    dd.isWarning
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  }`}>
                    {dd.isWarning ? 'Dikkat' : 'Normal'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-gray-400 mb-1">
                      <span>Mevcut Drawdown</span>
                      <span>{dd.currentDrawdown.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-full rounded-full transition-all ${
                          dd.isWarning ? 'bg-red-600' : 'bg-green-500'
                        }`}
                        style={{
                          width: `${Math.min((dd.currentDrawdown / dd.maxDrawdown) * 100, 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
