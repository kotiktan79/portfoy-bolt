import { useState, useEffect } from 'react';
import { Zap, TrendingDown, TrendingUp, Flame, DollarSign, AlertTriangle, BarChart3, Shuffle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  calculateScenario,
  runMonteCarloSimulation,
  saveScenarioAnalysis,
  PRESET_SCENARIOS,
  type ScenarioResult,
  type MonteCarloResult,
} from '../services/scenarioService';
import { type Holding } from '../services/rebalancingService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function ScenarioSimulator() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>('crisis');
  const [customChanges, setCustomChanges] = useState<Record<string, number>>({});
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [showMonteCarlo, setShowMonteCarlo] = useState(false);

  useEffect(() => {
    loadHoldings();
  }, []);

  async function loadHoldings() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('holdings')
        .select('*')
        .gt('quantity', 0);

      if (data) {
        setHoldings(data);
        const initial: Record<string, number> = {};
        data.forEach((h) => {
          if (!initial[h.asset_type]) {
            initial[h.asset_type] = 0;
          }
        });
        setCustomChanges(initial);
      }
    } catch (error) {
      console.error('Error loading holdings:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleScenarioChange(scenarioKey: string) {
    setSelectedScenario(scenarioKey);
    setScenarioResult(null);

    if (scenarioKey === 'custom') {
      const custom: Record<string, number> = {};
      holdings.forEach((h) => {
        custom[h.asset_type] = 0;
      });
      setCustomChanges(custom);
    }
  }

  function handleCustomChange(assetType: string, value: number) {
    setCustomChanges((prev) => ({
      ...prev,
      [assetType]: value,
    }));
  }

  async function runScenario() {
    setSimulating(true);
    try {
      const priceChanges =
        selectedScenario === 'custom'
          ? customChanges
          : PRESET_SCENARIOS[selectedScenario];

      const result = calculateScenario(holdings, priceChanges);
      result.scenario_name = selectedScenario === 'custom' ? 'Özel Senaryo' : getScenarioName(selectedScenario);
      setScenarioResult(result);

      await saveScenarioAnalysis(
        'default',
        result.scenario_name,
        selectedScenario === 'custom' ? 'custom' : 'preset',
        priceChanges,
        result
      );
    } catch (error) {
      console.error('Error running scenario:', error);
    } finally {
      setSimulating(false);
    }
  }

  async function runMonteCarlo() {
    setSimulating(true);
    try {
      const result = runMonteCarloSimulation(holdings, 1000);
      setMonteCarloResult(result);
      setShowMonteCarlo(true);
    } catch (error) {
      console.error('Error running Monte Carlo:', error);
    } finally {
      setSimulating(false);
    }
  }

  function getScenarioName(key: string): string {
    const names: Record<string, string> = {
      crisis: 'Kriz Senaryosu',
      boom: 'Yükseliş Senaryosu',
      inflation: 'Enflasyon Senaryosu',
      recession: 'Durgunluk Senaryosu',
      stagflation: 'Stagflasyon Senaryosu',
    };
    return names[key] || key;
  }

  function getScenarioIcon(key: string) {
    const icons: Record<string, any> = {
      crisis: TrendingDown,
      boom: TrendingUp,
      inflation: Flame,
      recession: AlertTriangle,
      stagflation: DollarSign,
    };
    const Icon = icons[key] || Zap;
    return <Icon className="w-5 h-5" />;
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

  const currentValue = holdings.reduce((sum, h) => sum + h.current_price * h.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-purple-600" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Senaryo Analizi
            </h2>
          </div>
          <button
            onClick={runMonteCarlo}
            disabled={simulating}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            <Shuffle className="w-5 h-5" />
            Monte Carlo
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">Mevcut Değer</p>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-300">
              ₺{currentValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Varlık Sayısı</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {holdings.length}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Aktif Senaryo</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {selectedScenario === 'custom' ? 'Özel' : getScenarioName(selectedScenario)}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Senaryo Seçin
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.keys(PRESET_SCENARIOS).map((key) => (
              <button
                key={key}
                onClick={() => handleScenarioChange(key)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectedScenario === key
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
                }`}
              >
                <div className="flex items-center justify-center mb-2">
                  {getScenarioIcon(key)}
                </div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">
                  {getScenarioName(key)}
                </p>
              </button>
            ))}
            <button
              onClick={() => handleScenarioChange('custom')}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedScenario === 'custom'
                  ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
              }`}
            >
              <div className="flex items-center justify-center mb-2">
                <BarChart3 className="w-5 h-5" />
              </div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">
                Özel Senaryo
              </p>
            </button>
          </div>
        </div>

        {selectedScenario === 'custom' && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
              Özel Fiyat Değişimleri (%)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.keys(customChanges).map((assetType) => (
                <div key={assetType}>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1 capitalize">
                    {assetType}
                  </label>
                  <input
                    type="number"
                    min="-100"
                    max="200"
                    step="5"
                    value={customChanges[assetType] || 0}
                    onChange={(e) =>
                      handleCustomChange(assetType, parseFloat(e.target.value) || 0)
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedScenario !== 'custom' && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
              Senaryo Detayları
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(PRESET_SCENARIOS[selectedScenario] || {}).map(([type, change]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300 capitalize">{type}</span>
                  <span
                    className={`font-semibold ${
                      change >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {change > 0 ? '+' : ''}
                    {change}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={runScenario}
          disabled={simulating}
          className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors font-semibold"
        >
          {simulating ? 'Hesaplanıyor...' : 'Senaryoyu Çalıştır'}
        </button>
      </div>

      {scenarioResult && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
            Senaryo Sonuçları: {scenarioResult.scenario_name}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">Mevcut Değer</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-300">
                ₺{scenarioResult.current_value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
              <p className="text-sm text-purple-600 dark:text-purple-400 mb-1">
                Tahmini Değer
              </p>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-300">
                ₺{scenarioResult.projected_value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div
              className={`rounded-lg p-4 ${
                scenarioResult.pnl_change >= 0
                  ? 'bg-green-50 dark:bg-green-900/20'
                  : 'bg-red-50 dark:bg-red-900/20'
              }`}
            >
              <p
                className={`text-sm mb-1 ${
                  scenarioResult.pnl_change >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                Kar/Zarar
              </p>
              <p
                className={`text-2xl font-bold ${
                  scenarioResult.pnl_change >= 0
                    ? 'text-green-900 dark:text-green-300'
                    : 'text-red-900 dark:text-red-300'
                }`}
              >
                {scenarioResult.pnl_change >= 0 ? '+' : ''}₺
                {scenarioResult.pnl_change.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div
              className={`rounded-lg p-4 ${
                scenarioResult.pnl_percent >= 0
                  ? 'bg-green-50 dark:bg-green-900/20'
                  : 'bg-red-50 dark:bg-red-900/20'
              }`}
            >
              <p
                className={`text-sm mb-1 ${
                  scenarioResult.pnl_percent >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                Değişim Oranı
              </p>
              <p
                className={`text-2xl font-bold ${
                  scenarioResult.pnl_percent >= 0
                    ? 'text-green-900 dark:text-green-300'
                    : 'text-red-900 dark:text-red-300'
                }`}
              >
                {scenarioResult.pnl_percent >= 0 ? '+' : ''}
                {scenarioResult.pnl_percent.toFixed(2)}%
              </p>
            </div>
          </div>

          <div className="mb-6">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4">
              Varlık Bazında Etki
            </h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={scenarioResult.asset_impacts}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="symbol" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) =>
                    `₺${value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
                  }
                />
                <Bar dataKey="change" name="Değişim" radius={[8, 8, 0, 0]}>
                  {scenarioResult.asset_impacts.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.change >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Varlık
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Mevcut
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Tahmini
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Değişim
                  </th>
                </tr>
              </thead>
              <tbody>
                {scenarioResult.asset_impacts.map((impact) => (
                  <tr
                    key={impact.symbol}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                      {impact.symbol}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-700 dark:text-gray-300">
                      ₺{impact.current_value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-700 dark:text-gray-300">
                      ₺{impact.projected_value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`py-3 px-4 text-sm text-right font-semibold ${
                        impact.change >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {impact.change >= 0 ? '+' : ''}₺
                      {impact.change.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      <span className="text-xs ml-1">
                        ({impact.change_percent >= 0 ? '+' : ''}
                        {impact.change_percent.toFixed(1)}%)
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showMonteCarlo && monteCarloResult && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
            Monte Carlo Simülasyonu (1000 İterasyon)
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">Ortalama</p>
              <p className="text-xl font-bold text-blue-900 dark:text-blue-300">
                ₺{monteCarloResult.mean.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
              </p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
              <p className="text-sm text-purple-600 dark:text-purple-400 mb-1">Medyan</p>
              <p className="text-xl font-bold text-purple-900 dark:text-purple-300">
                ₺{monteCarloResult.median.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
              </p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
              <p className="text-sm text-red-600 dark:text-red-400 mb-1">En Kötü</p>
              <p className="text-xl font-bold text-red-900 dark:text-red-300">
                ₺{monteCarloResult.worst_case.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
              </p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <p className="text-sm text-green-600 dark:text-green-400 mb-1">En İyi</p>
              <p className="text-xl font-bold text-green-900 dark:text-green-300">
                ₺{monteCarloResult.best_case.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                %95 Güven Aralığı
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                ₺{monteCarloResult.confidence_95_lower.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
                {' - '}
                ₺{monteCarloResult.confidence_95_upper.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400 mb-1">Zarar Olasılığı</p>
                <p className="text-2xl font-bold text-red-900 dark:text-red-300">
                  %{monteCarloResult.probability_loss.toFixed(1)}
                </p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm text-green-600 dark:text-green-400 mb-1">
                  +10% Kazanç
                </p>
                <p className="text-2xl font-bold text-green-900 dark:text-green-300">
                  %{monteCarloResult.probability_gain_10.toFixed(1)}
                </p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm text-green-600 dark:text-green-400 mb-1">
                  +20% Kazanç
                </p>
                <p className="text-2xl font-bold text-green-900 dark:text-green-300">
                  %{monteCarloResult.probability_gain_20.toFixed(1)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
