import { useState, useMemo } from 'react';
import { X, Target, TrendingUp, TrendingDown, BarChart3, AlertTriangle, Zap, Shield, DollarSign } from 'lucide-react';
import { AssetAllocation } from '../services/analyticsService';
import { formatCurrency, formatPercentage } from '../services/priceService';

interface RebalanceModalProps {
  allocations: AssetAllocation[];
  onClose: () => void;
  onUpdateTargets: (targets: Record<string, number>) => void;
}

type RebalanceStrategy = 'custom' | 'conservative' | 'balanced' | 'aggressive' | 'equal-weight';

export function RebalanceModal({ allocations, onClose, onUpdateTargets }: RebalanceModalProps) {
  const [strategy, setStrategy] = useState<RebalanceStrategy>('custom');
  const [rebalanceThreshold, setRebalanceThreshold] = useState(5);
  const [targets, setTargets] = useState<Record<string, number>>(
    allocations.reduce((acc, a) => {
      acc[a.asset_type] = a.target_percentage;
      return acc;
    }, {} as Record<string, number>)
  );

  const totalTarget = Object.values(targets).reduce((sum, val) => sum + val, 0);
  const totalPortfolioValue = allocations.reduce((sum, a) => sum + a.value, 0);

  const strategyPresets: Record<RebalanceStrategy, Record<string, number>> = {
    'custom': targets,
    'conservative': {
      stock: 30,
      crypto: 10,
      currency: 40,
      fund: 15,
      eurobond: 5,
      commodity: 0,
    },
    'balanced': {
      stock: 40,
      crypto: 20,
      currency: 20,
      fund: 10,
      eurobond: 5,
      commodity: 5,
    },
    'aggressive': {
      stock: 30,
      crypto: 50,
      currency: 5,
      fund: 10,
      eurobond: 0,
      commodity: 5,
    },
    'equal-weight': Object.keys(targets).reduce((acc, key) => {
      acc[key] = 100 / Object.keys(targets).length;
      return acc;
    }, {} as Record<string, number>),
  };

  const applyStrategy = (strategyType: RebalanceStrategy) => {
    setStrategy(strategyType);
    if (strategyType !== 'custom') {
      const preset = strategyPresets[strategyType];
      const filtered = Object.keys(targets).reduce((acc, key) => {
        acc[key] = preset[key] || 0;
        return acc;
      }, {} as Record<string, number>);
      setTargets(filtered);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Math.abs(totalTarget - 100) < 0.01) {
      onUpdateTargets(targets);
      onClose();
    }
  };

  const getAssetTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      stock: 'Hisse',
      crypto: 'Kripto',
      currency: 'Döviz',
      fund: 'Fon',
      eurobond: 'Eurobond',
      commodity: 'Emtia',
    };
    return labels[type] || type;
  };

  const assetTypeGroups = useMemo(() => {
    return allocations.reduce((acc, allocation) => {
      if (!acc[allocation.asset_type]) {
        acc[allocation.asset_type] = {
          type: allocation.asset_type,
          currentValue: 0,
          currentPercentage: 0,
          rebalanceAmount: 0,
          assets: [],
        };
      }
      acc[allocation.asset_type].currentValue += allocation.value;
      acc[allocation.asset_type].currentPercentage += allocation.percentage;
      acc[allocation.asset_type].rebalanceAmount += allocation.rebalance_amount;
      acc[allocation.asset_type].assets.push(allocation);
      return acc;
    }, {} as Record<string, any>);
  }, [allocations]);

  const rebalanceAnalysis = useMemo(() => {
    const actions = Object.values(assetTypeGroups).map((group: any) => {
      const currentPct = group.currentPercentage;
      const targetPct = targets[group.type] || 0;
      const deviation = Math.abs(currentPct - targetPct);
      const targetValue = (totalPortfolioValue * targetPct) / 100;
      const difference = targetValue - group.currentValue;

      return {
        type: group.type,
        currentValue: group.currentValue,
        currentPct,
        targetPct,
        targetValue,
        difference,
        deviation,
        needsAction: deviation > rebalanceThreshold,
      };
    });

    const totalBuy = actions.filter(a => a.difference > 0).reduce((sum, a) => sum + a.difference, 0);
    const totalSell = actions.filter(a => a.difference < 0).reduce((sum, a) => sum + Math.abs(a.difference), 0);
    const maxDeviation = Math.max(...actions.map(a => a.deviation));
    const needsRebalance = actions.some(a => a.needsAction);

    return {
      actions: actions.sort((a, b) => b.deviation - a.deviation),
      totalBuy,
      totalSell,
      maxDeviation,
      needsRebalance,
    };
  }, [assetTypeGroups, targets, totalPortfolioValue, rebalanceThreshold]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full my-8">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Target className="text-slate-700" size={24} />
            <h2 className="text-2xl font-bold text-gray-900">Portföy Yeniden Dengeleme</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-blue-500 rounded-lg">
                <BarChart3 className="text-white" size={20} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 mb-2">Portföy Durumu</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-gray-600">Toplam Değer</div>
                    <div className="font-bold text-gray-900">{formatCurrency(totalPortfolioValue)} ₺</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Maksimum Sapma</div>
                    <div className="font-bold text-orange-600">{formatPercentage(rebalanceAnalysis.maxDeviation)}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Alınacak</div>
                    <div className="font-bold text-green-600">+{formatCurrency(rebalanceAnalysis.totalBuy)} ₺</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Satılacak</div>
                    <div className="font-bold text-red-600">-{formatCurrency(rebalanceAnalysis.totalSell)} ₺</div>
                  </div>
                </div>
              </div>
            </div>
            {rebalanceAnalysis.needsRebalance && (
              <div className="flex items-center gap-2 p-3 bg-orange-100 border border-orange-300 rounded-lg">
                <AlertTriangle className="text-orange-600" size={18} />
                <span className="text-sm font-medium text-orange-900">
                  Portföyünüz hedef dağılımdan {formatPercentage(rebalanceAnalysis.maxDeviation)} sapma gösteriyor
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Rebalans Stratejisi
            </label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <button
                type="button"
                onClick={() => applyStrategy('conservative')}
                className={`p-3 rounded-lg border-2 transition-all ${strategy === 'conservative' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <Shield className="mx-auto mb-1 text-blue-600" size={20} />
                <div className="text-xs font-semibold text-gray-900">Muhafazakar</div>
              </button>
              <button
                type="button"
                onClick={() => applyStrategy('balanced')}
                className={`p-3 rounded-lg border-2 transition-all ${strategy === 'balanced' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <Target className="mx-auto mb-1 text-green-600" size={20} />
                <div className="text-xs font-semibold text-gray-900">Dengeli</div>
              </button>
              <button
                type="button"
                onClick={() => applyStrategy('aggressive')}
                className={`p-3 rounded-lg border-2 transition-all ${strategy === 'aggressive' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <Zap className="mx-auto mb-1 text-orange-600" size={20} />
                <div className="text-xs font-semibold text-gray-900">Agresif</div>
              </button>
              <button
                type="button"
                onClick={() => applyStrategy('equal-weight')}
                className={`p-3 rounded-lg border-2 transition-all ${strategy === 'equal-weight' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <DollarSign className="mx-auto mb-1 text-teal-600" size={20} />
                <div className="text-xs font-semibold text-gray-900">Eşit Ağırlık</div>
              </button>
              <button
                type="button"
                onClick={() => setStrategy('custom')}
                className={`p-3 rounded-lg border-2 transition-all ${strategy === 'custom' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <BarChart3 className="mx-auto mb-1 text-gray-600" size={20} />
                <div className="text-xs font-semibold text-gray-900">Özel</div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rebalans Eşiği: {rebalanceThreshold}%
            </label>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={rebalanceThreshold}
              onChange={(e) => setRebalanceThreshold(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Hassas (1%)</span>
              <span>Esnek (20%)</span>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Varlık dağılımı hedeften {rebalanceThreshold}% fazla saptığında rebalans önerilir
            </p>
          </div>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Hedef Dağılım</h3>
              <div
                className={`text-lg font-bold ${
                  Math.abs(totalTarget - 100) < 0.01
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                Toplam: {totalTarget.toFixed(1)}%
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {Object.values(assetTypeGroups).map((group: any) => (
                <div key={group.type} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {getAssetTypeLabel(group.type)}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={targets[group.type] || 0}
                    onChange={(e) =>
                      setTargets({ ...targets, [group.type]: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Detaylı Rebalans Analizi</h3>
            {rebalanceAnalysis.actions.map((action) => {
              const shouldBuy = action.difference > 0;
              const isBalanced = !action.needsAction;

              return (
                <div
                  key={action.type}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    isBalanced
                      ? 'bg-green-50 border-green-200'
                      : shouldBuy
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-orange-50 border-orange-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900 text-lg">
                          {getAssetTypeLabel(action.type)}
                        </h4>
                        {isBalanced && (
                          <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-bold rounded-full">
                            DENGELİ
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <div>
                          <span className="text-gray-600">Mevcut: </span>
                          <span className="font-semibold text-gray-900">
                            {formatCurrency(action.currentValue)} ₺ ({formatPercentage(action.currentPct)})
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Hedef: </span>
                          <span className="font-semibold text-blue-600">
                            {formatCurrency(action.targetValue)} ₺ ({formatPercentage(action.targetPct)})
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-gray-600">Sapma: </span>
                          <span className={`font-bold ${
                            action.deviation > 10 ? 'text-red-600' : action.deviation > 5 ? 'text-orange-600' : 'text-green-600'
                          }`}>
                            {formatPercentage(action.deviation)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {action.needsAction && (
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          {shouldBuy ? (
                            <TrendingUp className="text-green-600" size={24} />
                          ) : (
                            <TrendingDown className="text-red-600" size={24} />
                          )}
                          <span className={`font-bold text-lg ${
                            shouldBuy ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {shouldBuy ? 'AL' : 'SAT'}
                          </span>
                        </div>
                        <div className={`text-xl font-bold ${
                          shouldBuy ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {shouldBuy ? '+' : '-'}{formatCurrency(Math.abs(action.difference))} ₺
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        isBalanced ? 'bg-green-500' : shouldBuy ? 'bg-blue-500' : 'bg-orange-500'
                      }`}
                      style={{ width: `${action.currentPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={Math.abs(totalTarget - 100) >= 0.01}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Hedefleri Güncelle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
