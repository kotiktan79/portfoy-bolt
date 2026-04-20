import { useState, useEffect } from 'react';
import { Scale, TrendingUp, AlertTriangle, Check, X, Sparkles, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import {
  calculateCurrentAllocations,
  calculateDeviations,
  calculateTotalDeviation,
  generateRebalancingTrades,
  saveRebalancingSimulation,
  executeRebalancing,
  PRESET_STRATEGIES,
  type Holding,
  type Allocation,
  type Trade,
} from '../services/rebalancingService';

export default function RebalancingEngine() {
  const toast = useToast();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('balanced');
  const [customAllocations, setCustomAllocations] = useState<Record<string, number>>({});
  const [trades, setTrades] = useState<Trade[]>([]);
  const [totalDeviation, setTotalDeviation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);

  useEffect(() => {
    loadPortfolioData();
  }, []);

  async function loadPortfolioData() {
    setLoading(true);
    try {
      const { data: holdingsData } = await supabase
        .from('holdings')
        .select('*')
        .gt('quantity', 0);

      if (holdingsData) {
        setHoldings(holdingsData);
        const currentAllocations = await calculateCurrentAllocations(holdingsData);
        setAllocations(currentAllocations);

        const strategy = PRESET_STRATEGIES[selectedStrategy];
        const withDeviations = calculateDeviations(currentAllocations, strategy.target_allocations);
        setAllocations(withDeviations);
        setTotalDeviation(calculateTotalDeviation(withDeviations));
      }
    } catch (error) {
      console.error('Error loading portfolio:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleStrategyChange(strategyKey: string) {
    setSelectedStrategy(strategyKey);
    setShowSimulation(false);

    if (strategyKey === 'custom') {
      const custom: Record<string, number> = {};
      allocations.forEach((a) => {
        custom[a.asset_type] = a.current_percent;
      });
      setCustomAllocations(custom);
    } else {
      const strategy = PRESET_STRATEGIES[strategyKey];
      const withDeviations = calculateDeviations(allocations, strategy.target_allocations);
      setAllocations(withDeviations);
      setTotalDeviation(calculateTotalDeviation(withDeviations));
    }
  }

  function handleCustomAllocationChange(assetType: string, value: number) {
    setCustomAllocations((prev) => ({
      ...prev,
      [assetType]: value,
    }));
  }

  function applyCustomAllocations() {
    const withDeviations = calculateDeviations(allocations, customAllocations);
    setAllocations(withDeviations);
    setTotalDeviation(calculateTotalDeviation(withDeviations));
  }

  async function runSimulation() {
    setSimulating(true);
    try {
      const targetAllocations =
        selectedStrategy === 'custom'
          ? customAllocations
          : PRESET_STRATEGIES[selectedStrategy].target_allocations;

      const suggestedTrades = generateRebalancingTrades(holdings, targetAllocations, 0.1);
      setTrades(suggestedTrades);
      setShowSimulation(true);
    } catch (error) {
      console.error('Error running simulation:', error);
    } finally {
      setSimulating(false);
    }
  }

  async function executeRebalance() {
    if (!confirm('Rebalancing işlemini onaylıyor musunuz?')) return;

    setExecuting(true);
    try {
      const targetAllocations =
        selectedStrategy === 'custom'
          ? customAllocations
          : PRESET_STRATEGIES[selectedStrategy].target_allocations;

      const simulationId = await saveRebalancingSimulation({
        portfolio_id: 'default',
        current_allocations: Object.fromEntries(
          allocations.map((a) => [a.asset_type, a.current_percent])
        ),
        target_allocations: targetAllocations,
        suggested_trades: trades,
        expected_cost: trades.reduce((sum, t) => sum + t.amount, 0) * 0.001,
        deviation_before: totalDeviation,
        deviation_after: 0,
        status: 'pending',
      });

      await executeRebalancing(simulationId, 'default', trades);

      toast.success('Rebalancing başarıyla tamamlandı!');
      setShowSimulation(false);
      await loadPortfolioData();
    } catch (error) {
      console.error('Error executing rebalance:', error);
      toast.error('Rebalancing sırasında hata oluştu!');
    } finally {
      setExecuting(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  const totalValue = holdings.reduce((sum, h) => sum + h.current_price * h.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Scale className="w-6 h-6 text-brand-600" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Portföy Rebalancing
            </h2>
          </div>
          {totalDeviation > 10 && (
            <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-2 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                Kritik sapma: {totalDeviation.toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-brand-50 dark:bg-brand-900/20 rounded-lg p-4">
            <p className="text-sm text-brand-600 dark:text-brand-400 mb-1">Portföy Değeri</p>
            <p className="text-2xl font-bold text-brand-900 dark:text-brand-300">
              ₺{totalValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
            <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-1">Toplam Sapma</p>
            <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-300">
              {totalDeviation.toFixed(1)}%
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <p className="text-sm text-green-600 dark:text-green-400 mb-1">Varlık Sayısı</p>
            <p className="text-2xl font-bold text-green-900 dark:text-green-300">
              {holdings.length}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Strateji Seçin
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(PRESET_STRATEGIES).map(([key, strategy]) => (
              <button
                key={key}
                onClick={() => handleStrategyChange(key)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectedStrategy === key
                    ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-brand-300'
                }`}
              >
                <p className="font-semibold text-gray-900 dark:text-white">{strategy.name}</p>
              </button>
            ))}
            <button
              onClick={() => handleStrategyChange('custom')}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedStrategy === 'custom'
                  ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-brand-300'
              }`}
            >
              <p className="font-semibold text-gray-900 dark:text-white">Özel</p>
            </button>
          </div>
        </div>

        {selectedStrategy === 'custom' && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
              Özel Dağılım Ayarla
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {allocations.map((allocation) => (
                <div key={allocation.asset_type}>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                    {allocation.asset_type}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={customAllocations[allocation.asset_type] || 0}
                    onChange={(e) =>
                      handleCustomAllocationChange(
                        allocation.asset_type,
                        parseFloat(e.target.value) || 0
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={applyCustomAllocations}
              className="mt-4 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              Uygula
            </button>
          </div>
        )}

        <div className="space-y-3 mb-6">
          {allocations.map((allocation) => (
            <div key={allocation.asset_type} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">
                  {allocation.asset_type}
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-600 dark:text-gray-400">
                    Mevcut: {allocation.current_percent.toFixed(1)}%
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">
                    Hedef: {allocation.target_percent.toFixed(1)}%
                  </span>
                  <span
                    className={`font-semibold ${
                      Math.abs(allocation.deviation) > 5
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}
                  >
                    {allocation.deviation > 0 ? '+' : ''}
                    {allocation.deviation.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="absolute h-full bg-brand-600 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(allocation.current_percent, 100)}%` }}
                />
                <div
                  className="absolute h-full border-2 border-green-500 rounded-full"
                  style={{
                    left: `${Math.min(allocation.target_percent, 100)}%`,
                    width: '2px',
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={runSimulation}
            disabled={simulating || totalDeviation < 1}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-5 h-5" />
            {simulating ? 'Simüle ediliyor...' : 'Simülasyon Çalıştır'}
          </button>
        </div>
      </div>

      {showSimulation && trades.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="w-6 h-6 text-brand-600" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              Önerilen İşlemler
            </h3>
          </div>

          <div className="space-y-3 mb-6">
            {trades.map((trade, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  {trade.action === 'buy' ? (
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  ) : (
                    <X className="w-5 h-5 text-red-600" />
                  )}
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {trade.symbol}
                      <span
                        className={`ml-2 text-sm ${
                          trade.action === 'buy' ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {trade.action === 'buy' ? 'AL' : 'SAT'}
                      </span>
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{trade.reason}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900 dark:text-white">
                    ₺{trade.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {trade.shares.toFixed(4)} adet
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowSimulation(false)}
              className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              İptal
            </button>
            <button
              onClick={executeRebalance}
              disabled={executing}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="w-5 h-5" />
              {executing ? 'İşleniyor...' : 'Onayla ve Uygula'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
