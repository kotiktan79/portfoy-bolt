import { useEffect, useState } from 'react';
import { Shield, TrendingUp, TrendingDown, Plus, Trash2, Bell, BellOff } from 'lucide-react';
import { supabase, Holding } from '../lib/supabase';
import { formatCurrency } from '../services/priceService';

interface StopLossRule {
  id: string;
  holding_id: string;
  rule_type: 'stop_loss' | 'take_profit';
  trigger_price: number | null;
  trigger_percent: number | null;
  is_active: boolean;
  notify_only: boolean;
  notes: string | null;
  triggered_at: string | null;
  created_at: string;
}

interface StopLossTakeProfitProps {
  holdings: Holding[];
}

export function StopLossTakeProfit({ holdings }: StopLossTakeProfitProps) {
  const [rules, setRules] = useState<StopLossRule[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    setLoading(true);
    const { data, error } = await supabase
      .from('stop_loss_take_profit')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRules(data);
    }
    setLoading(false);
  }

  async function deleteRule(id: string) {
    const { error } = await supabase
      .from('stop_loss_take_profit')
      .delete()
      .eq('id', id);

    if (!error) {
      setRules(rules.filter(r => r.id !== id));
    }
  }

  async function toggleActive(id: string, currentState: boolean) {
    const { error } = await supabase
      .from('stop_loss_take_profit')
      .update({ is_active: !currentState })
      .eq('id', id);

    if (!error) {
      setRules(rules.map(r => r.id === id ? { ...r, is_active: !currentState } : r));
    }
  }

  const getHoldingInfo = (holdingId: string) => {
    return holdings.find(h => h.id === holdingId);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-slate-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Shield className="text-blue-600" size={24} />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Stop Loss / Take Profit
            </h3>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={18} />
            Kural Ekle
          </button>
        </div>

        {rules.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Shield size={48} className="mx-auto mb-4 opacity-50" />
            <p>Henüz kural eklenmemiş</p>
            <p className="text-sm mt-2">Varlıklarınız için otomatik alım/satım kuralları ekleyin</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => {
              const holding = getHoldingInfo(rule.holding_id);
              if (!holding) return null;

              const isStopLoss = rule.rule_type === 'stop_loss';
              const currentPrice = holding.current_price;
              const triggerPrice = rule.trigger_price ||
                (rule.trigger_percent ? holding.purchase_price * (1 + rule.trigger_percent / 100) : 0);

              const distancePercent = triggerPrice > 0
                ? ((currentPrice - triggerPrice) / triggerPrice) * 100
                : 0;

              return (
                <div
                  key={rule.id}
                  className={`border rounded-lg p-4 ${
                    rule.is_active
                      ? 'border-gray-200 dark:border-gray-700'
                      : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 opacity-60'
                  } ${rule.triggered_at ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {isStopLoss ? (
                          <TrendingDown className="text-red-600" size={20} />
                        ) : (
                          <TrendingUp className="text-green-600" size={20} />
                        )}
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {holding.symbol}
                        </span>
                        <span className={`text-sm px-2 py-0.5 rounded ${
                          isStopLoss
                            ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                            : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                        }`}>
                          {isStopLoss ? 'Stop Loss' : 'Take Profit'}
                        </span>
                        {rule.notify_only && (
                          <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                            Sadece Bildirim
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">Mevcut Fiyat</p>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(currentPrice)} ₺
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">Tetiklenme Fiyatı</p>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(triggerPrice)} ₺
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">Mesafe</p>
                          <p className={`font-semibold ${
                            distancePercent > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {distancePercent > 0 ? '+' : ''}{distancePercent.toFixed(2)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">Durum</p>
                          <p className={`font-semibold ${
                            rule.triggered_at
                              ? 'text-yellow-600'
                              : rule.is_active
                                ? 'text-green-600'
                                : 'text-gray-600'
                          }`}>
                            {rule.triggered_at ? 'Tetiklendi' : rule.is_active ? 'Aktif' : 'Pasif'}
                          </p>
                        </div>
                      </div>

                      {rule.notes && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          {rule.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => toggleActive(rule.id, rule.is_active)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        title={rule.is_active ? 'Devre Dışı Bırak' : 'Aktif Et'}
                      >
                        {rule.is_active ? (
                          <Bell className="text-blue-600" size={18} />
                        ) : (
                          <BellOff className="text-gray-400" size={18} />
                        )}
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900 rounded"
                        title="Sil"
                      >
                        <Trash2 className="text-red-600" size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddRuleModal
          holdings={holdings}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            loadRules();
            setShowAddModal(false);
          }}
        />
      )}
    </>
  );
}

interface AddRuleModalProps {
  holdings: Holding[];
  onClose: () => void;
  onAdded: () => void;
}

function AddRuleModal({ holdings, onClose, onAdded }: AddRuleModalProps) {
  const [holdingId, setHoldingId] = useState('');
  const [ruleType, setRuleType] = useState<'stop_loss' | 'take_profit'>('stop_loss');
  const [triggerType, setTriggerType] = useState<'price' | 'percent'>('percent');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [triggerPercent, setTriggerPercent] = useState('-10');
  const [notifyOnly, setNotifyOnly] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const { error } = await supabase.from('stop_loss_take_profit').insert({
      holding_id: holdingId,
      rule_type: ruleType,
      trigger_price: triggerType === 'price' ? parseFloat(triggerPrice) : null,
      trigger_percent: triggerType === 'percent' ? parseFloat(triggerPercent) : null,
      is_active: true,
      notify_only: notifyOnly,
      notes: notes || null,
    });

    if (!error) {
      onAdded();
    }
    setSaving(false);
  }

  const selectedHolding = holdings.find(h => h.id === holdingId);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Yeni Kural Ekle</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Varlık Seçin *
            </label>
            <select
              value={holdingId}
              onChange={(e) => setHoldingId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Seçiniz...</option>
              {holdings.map(h => (
                <option key={h.id} value={h.id}>
                  {h.symbol} - {formatCurrency(h.current_price)} ₺
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Kural Tipi *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRuleType('stop_loss')}
                className={`p-3 rounded-lg border-2 ${
                  ruleType === 'stop_loss'
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                <TrendingDown className="text-red-600 mx-auto mb-1" size={24} />
                <div className="text-sm font-semibold text-gray-900 dark:text-white">Stop Loss</div>
              </button>
              <button
                type="button"
                onClick={() => setRuleType('take_profit')}
                className={`p-3 rounded-lg border-2 ${
                  ruleType === 'take_profit'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                <TrendingUp className="text-green-600 mx-auto mb-1" size={24} />
                <div className="text-sm font-semibold text-gray-900 dark:text-white">Take Profit</div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tetiklenme Türü
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTriggerType('percent')}
                className={`px-4 py-2 rounded-lg border ${
                  triggerType === 'percent'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                Yüzde (%)
              </button>
              <button
                type="button"
                onClick={() => setTriggerType('price')}
                className={`px-4 py-2 rounded-lg border ${
                  triggerType === 'price'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                Fiyat (₺)
              </button>
            </div>
          </div>

          {triggerType === 'percent' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tetiklenme Yüzdesi (%) *
              </label>
              <input
                type="number"
                value={triggerPercent}
                onChange={(e) => setTriggerPercent(e.target.value)}
                required
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="-10"
              />
              {selectedHolding && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Alış fiyatı: {formatCurrency(selectedHolding.purchase_price)} ₺ →
                  Tetikleme: {formatCurrency(selectedHolding.purchase_price * (1 + parseFloat(triggerPercent || '0') / 100))} ₺
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tetiklenme Fiyatı (₺) *
              </label>
              <input
                type="number"
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(e.target.value)}
                required
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="100.00"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="notifyOnly"
              checked={notifyOnly}
              onChange={(e) => setNotifyOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="notifyOnly" className="text-sm text-gray-700 dark:text-gray-300">
              Sadece bildirim gönder (otomatik satış yapma)
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notlar
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Ek notlar..."
            />
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
              disabled={saving || !holdingId}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor...' : 'Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
