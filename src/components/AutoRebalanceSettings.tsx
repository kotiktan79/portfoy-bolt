import { useState } from 'react';
import { Target, Clock, Zap, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AutoRebalanceSettingsProps {
  onClose: () => void;
  onSave: () => void;
}

export function AutoRebalanceSettings({ onClose, onSave }: AutoRebalanceSettingsProps) {
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [threshold, setThreshold] = useState(5);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);

    try {
      const { error } = await supabase
        .from('automation_settings')
        .upsert({
          user_id: 'default',
          auto_rebalance: enabled,
          rebalance_frequency: frequency,
          rebalance_threshold: threshold,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving auto-rebalance settings:', error);
    }

    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Target className="text-white" size={24} />
            <h2 className="text-xl font-bold text-white">Otomatik Rebalance</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
            <div className="flex items-center gap-3">
              <Zap className="text-purple-600" size={20} />
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                  Otomatik Rebalance
                </h4>
                <p className="text-xs text-slate-600 dark:text-gray-400">
                  Portföyünüzü otomatik olarak dengeler
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
            </label>
          </div>

          {enabled && (
            <>
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">
                  <Clock size={16} />
                  Sıklık
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['daily', 'weekly', 'monthly'] as const).map((freq) => (
                    <button
                      key={freq}
                      onClick={() => setFrequency(freq)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        frequency === freq
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {freq === 'daily' ? 'Günlük' : freq === 'weekly' ? 'Haftalık' : 'Aylık'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">
                  <Target size={16} />
                  Sapma Eşiği: %{threshold}
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <div className="flex justify-between text-xs text-slate-500 dark:text-gray-400 mt-1">
                  <span>%1</span>
                  <span>%10</span>
                  <span>%20</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-gray-400 mt-2">
                  Hedef dağılımdan bu kadar sapınca otomatik rebalance yapılır
                </p>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                <div className="flex items-start gap-2">
                  <CheckCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={16} />
                  <p className="text-xs text-slate-700 dark:text-gray-300">
                    Otomatik rebalance, belirlediğiniz sıklıkta ve eşik değerinde portföyünüzü
                    hedef dağılıma göre yeniden dengeleyecektir.
                  </p>
                </div>
              </div>
            </>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
