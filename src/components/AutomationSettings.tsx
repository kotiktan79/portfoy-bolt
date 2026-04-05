import { useState } from 'react';
import { Settings, Zap, Target, TrendingUp, Save } from 'lucide-react';
import { supabase, Holding } from '../lib/supabase';

interface AutomationSettingsProps {
  holdings: Holding[];
  onClose: () => void;
  onSave: () => void;
}

interface AutoRebalanceSettings {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  threshold: number;
}

interface DCASettings {
  enabled: boolean;
  symbol: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly';
}

interface TakeProfitSettings {
  enabled: boolean;
  symbol: string;
  targetPrice: number;
  sellPercentage: number;
}

export function AutomationSettings({ holdings, onClose, onSave }: AutomationSettingsProps) {
  const [activeTab, setActiveTab] = useState<'rebalance' | 'dca' | 'takeprofit'>('rebalance');

  const [rebalanceSettings, setRebalanceSettings] = useState<AutoRebalanceSettings>({
    enabled: false,
    frequency: 'weekly',
    threshold: 5,
  });

  const [dcaSettings, setDCASettings] = useState<DCASettings>({
    enabled: false,
    symbol: holdings[0]?.symbol || '',
    amount: 1000,
    frequency: 'monthly',
  });

  const [takeProfitSettings, setTakeProfitSettings] = useState<TakeProfitSettings>({
    enabled: false,
    symbol: holdings[0]?.symbol || '',
    targetPrice: 0,
    sellPercentage: 50,
  });

  async function handleSave() {
    try {
      await supabase.from('automation_settings').upsert({
        user_id: 'default',
        auto_rebalance: rebalanceSettings,
        dca: dcaSettings,
        take_profit: takeProfitSettings,
        updated_at: new Date().toISOString(),
      });

      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving automation settings:', error);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="text-white" size={24} />
            <h2 className="text-xl font-bold text-white">Otomasyon Ayarları</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b border-slate-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('rebalance')}
            className={`flex-1 px-4 py-3 font-medium text-sm transition-all ${
              activeTab === 'rebalance'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                : 'text-slate-600 dark:text-gray-400'
            }`}
          >
            <Settings className="inline mr-2" size={16} />
            Oto-Rebalance
          </button>
          <button
            onClick={() => setActiveTab('dca')}
            className={`flex-1 px-4 py-3 font-medium text-sm transition-all ${
              activeTab === 'dca'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                : 'text-slate-600 dark:text-gray-400'
            }`}
          >
            <TrendingUp className="inline mr-2" size={16} />
            DCA
          </button>
          <button
            onClick={() => setActiveTab('takeprofit')}
            className={`flex-1 px-4 py-3 font-medium text-sm transition-all ${
              activeTab === 'takeprofit'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                : 'text-slate-600 dark:text-gray-400'
            }`}
          >
            <Target className="inline mr-2" size={16} />
            Take-Profit
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {activeTab === 'rebalance' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-gray-900 rounded-lg">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Otomatik Rebalance
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-gray-400">
                    Portföyü hedef alokasyona otomatik ayarla
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rebalanceSettings.enabled}
                    onChange={(e) =>
                      setRebalanceSettings({ ...rebalanceSettings, enabled: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {rebalanceSettings.enabled && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2">
                      Rebalance Sıklığı
                    </label>
                    <select
                      value={rebalanceSettings.frequency}
                      onChange={(e) =>
                        setRebalanceSettings({
                          ...rebalanceSettings,
                          frequency: e.target.value as 'daily' | 'weekly' | 'monthly',
                        })
                      }
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-white"
                    >
                      <option value="daily">Günlük</option>
                      <option value="weekly">Haftalık</option>
                      <option value="monthly">Aylık</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2">
                      Eşik Değeri (%)
                    </label>
                    <input
                      type="number"
                      value={rebalanceSettings.threshold}
                      onChange={(e) =>
                        setRebalanceSettings({
                          ...rebalanceSettings,
                          threshold: parseFloat(e.target.value),
                        })
                      }
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-white"
                      min="1"
                      max="20"
                      step="0.5"
                    />
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                      Hedef alokasyondan bu kadar sapınca rebalance yapılır
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'dca' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-gray-900 rounded-lg">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Dollar Cost Averaging
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-gray-400">
                    Düzenli otomatik alım yapın
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dcaSettings.enabled}
                    onChange={(e) => setDCASettings({ ...dcaSettings, enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {dcaSettings.enabled && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2">
                      Varlık
                    </label>
                    <select
                      value={dcaSettings.symbol}
                      onChange={(e) => setDCASettings({ ...dcaSettings, symbol: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-white"
                    >
                      {holdings.map((h) => (
                        <option key={h.symbol} value={h.symbol}>
                          {h.symbol}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2">
                      Tutar (₺)
                    </label>
                    <input
                      type="number"
                      value={dcaSettings.amount}
                      onChange={(e) =>
                        setDCASettings({ ...dcaSettings, amount: parseFloat(e.target.value) })
                      }
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-white"
                      min="100"
                      step="100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2">
                      Sıklık
                    </label>
                    <select
                      value={dcaSettings.frequency}
                      onChange={(e) =>
                        setDCASettings({
                          ...dcaSettings,
                          frequency: e.target.value as 'daily' | 'weekly' | 'monthly',
                        })
                      }
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-white"
                    >
                      <option value="daily">Günlük</option>
                      <option value="weekly">Haftalık</option>
                      <option value="monthly">Aylık</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'takeprofit' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-gray-900 rounded-lg">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Take-Profit Emirleri
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-gray-400">
                    Hedef fiyata ulaşınca otomatik sat
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={takeProfitSettings.enabled}
                    onChange={(e) =>
                      setTakeProfitSettings({ ...takeProfitSettings, enabled: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {takeProfitSettings.enabled && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2">
                      Varlık
                    </label>
                    <select
                      value={takeProfitSettings.symbol}
                      onChange={(e) =>
                        setTakeProfitSettings({ ...takeProfitSettings, symbol: e.target.value })
                      }
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-white"
                    >
                      {holdings.map((h) => (
                        <option key={h.symbol} value={h.symbol}>
                          {h.symbol} (Mevcut: {h.current_price.toFixed(2)} ₺)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2">
                      Hedef Fiyat (₺)
                    </label>
                    <input
                      type="number"
                      value={takeProfitSettings.targetPrice}
                      onChange={(e) =>
                        setTakeProfitSettings({
                          ...takeProfitSettings,
                          targetPrice: parseFloat(e.target.value),
                        })
                      }
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-white"
                      step="0.01"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2">
                      Satış Yüzdesi (%)
                    </label>
                    <input
                      type="number"
                      value={takeProfitSettings.sellPercentage}
                      onChange={(e) =>
                        setTakeProfitSettings({
                          ...takeProfitSettings,
                          sellPercentage: parseFloat(e.target.value),
                        })
                      }
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-white"
                      min="1"
                      max="100"
                      step="5"
                    />
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                      Hedef fiyata ulaşınca pozisyonun ne kadarını satacaksınız
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 dark:border-gray-700 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-lg transition-all"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
          >
            <Save size={18} />
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
