import { useEffect, useState } from 'react';
import { Briefcase, Plus, Settings, TrendingUp, Target } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  strategy_type: string;
  risk_tolerance: string;
  target_return_percent: number;
  created_at: string;
}

interface PortfolioSelectorProps {
  currentPortfolioId: string | null;
  onPortfolioChange: (portfolioId: string) => void;
}

export function PortfolioSelector({ currentPortfolioId, onPortfolioChange }: PortfolioSelectorProps) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPortfolios();
  }, []);

  async function loadPortfolios() {
    setLoading(true);
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (!error && data) {
      setPortfolios(data);
      if (!currentPortfolioId && data.length > 0) {
        const defaultPortfolio = data.find(p => p.is_default) || data[0];
        onPortfolioChange(defaultPortfolio.id);
      }
    }
    setLoading(false);
  }

  const currentPortfolio = portfolios.find(p => p.id === currentPortfolioId);

  const getStrategyIcon = (strategy: string) => {
    switch (strategy) {
      case 'growth': return '📈';
      case 'income': return '💰';
      case 'balanced': return '⚖️';
      default: return '🎯';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'conservative': return 'text-green-600';
      case 'moderate': return 'text-yellow-600';
      case 'aggressive': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-12 rounded-lg w-64"></div>
    );
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-gray-800 border-2 border-blue-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <Briefcase className="text-blue-600" size={20} />
          <div className="text-left">
            <div className="font-semibold text-gray-900 dark:text-white">
              {currentPortfolio?.name || 'Portföy Seçin'}
            </div>
            {currentPortfolio && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {getStrategyIcon(currentPortfolio.strategy_type)} {currentPortfolio.strategy_type}
              </div>
            )}
          </div>
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            ></div>
            <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-20">
              <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Portföyler</h3>
                  <button
                    onClick={() => {
                      setShowCreateModal(true);
                      setIsOpen(false);
                    }}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  >
                    <Plus size={18} className="text-blue-600" />
                  </button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {portfolios.map((portfolio) => (
                  <button
                    key={portfolio.id}
                    onClick={() => {
                      onPortfolioChange(portfolio.id);
                      setIsOpen(false);
                    }}
                    className={`w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      portfolio.id === currentPortfolioId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getStrategyIcon(portfolio.strategy_type)}</span>
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {portfolio.name}
                          </span>
                          {portfolio.is_default && (
                            <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                              Varsayılan
                            </span>
                          )}
                        </div>
                        {portfolio.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {portfolio.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          <span className={`flex items-center gap-1 ${getRiskColor(portfolio.risk_tolerance)}`}>
                            <Target size={12} />
                            {portfolio.risk_tolerance}
                          </span>
                          {portfolio.target_return_percent > 0 && (
                            <span className="flex items-center gap-1 text-green-600">
                              <TrendingUp size={12} />
                              {portfolio.target_return_percent}%
                            </span>
                          )}
                        </div>
                      </div>
                      <Settings size={16} className="text-gray-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {showCreateModal && (
        <CreatePortfolioModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            loadPortfolios();
            setShowCreateModal(false);
          }}
        />
      )}
    </>
  );
}

interface CreatePortfolioModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreatePortfolioModal({ onClose, onCreated }: CreatePortfolioModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [strategyType, setStrategyType] = useState('balanced');
  const [riskTolerance, setRiskTolerance] = useState('moderate');
  const [targetReturn, setTargetReturn] = useState(15);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const { error } = await supabase.from('portfolios').insert({
      name,
      description: description || null,
      strategy_type: strategyType,
      risk_tolerance: riskTolerance,
      target_return_percent: targetReturn,
      is_default: isDefault,
    });

    if (!error) {
      onCreated();
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Yeni Portföy Oluştur</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Portföy Adı *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Örn: Büyüme Portföyü"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Açıklama
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Portföy hakkında notlar..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Strateji Tipi
            </label>
            <select
              value={strategyType}
              onChange={(e) => setStrategyType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="growth">📈 Büyüme (Growth)</option>
              <option value="income">💰 Gelir (Income)</option>
              <option value="balanced">⚖️ Dengeli (Balanced)</option>
              <option value="custom">🎯 Özel (Custom)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Risk Toleransı
            </label>
            <select
              value={riskTolerance}
              onChange={(e) => setRiskTolerance(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="conservative">Muhafazakar (Conservative)</option>
              <option value="moderate">Orta (Moderate)</option>
              <option value="aggressive">Agresif (Aggressive)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Hedef Getiri (Yıllık %)
            </label>
            <input
              type="number"
              value={targetReturn}
              onChange={(e) => setTargetReturn(Number(e.target.value))}
              min="0"
              max="1000"
              step="0.1"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="isDefault" className="text-sm text-gray-700 dark:text-gray-300">
              Varsayılan portföy olarak ayarla
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving || !name}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Oluşturuluyor...' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
