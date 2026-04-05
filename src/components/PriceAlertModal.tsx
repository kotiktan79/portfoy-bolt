import { useState } from 'react';
import { X, Bell } from 'lucide-react';
import { addPriceAlert } from '../services/transactionService';
import { notifyPriceAlert } from '../services/notificationService';

interface PriceAlertModalProps {
  onClose: () => void;
  onAdd: () => void;
}

export function PriceAlertModal({ onClose, onAdd }: PriceAlertModalProps) {
  const [symbol, setSymbol] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [condition, setCondition] = useState<'above' | 'below'>('above');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await addPriceAlert({
      symbol: symbol.toUpperCase(),
      target_price: parseFloat(targetPrice),
      condition,
      is_active: true,
    });

    notifyPriceAlert(symbol.toUpperCase(), parseFloat(targetPrice), parseFloat(targetPrice), condition);

    onAdd();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Bell className="text-slate-700" size={24} />
            <h2 className="text-2xl font-bold text-gray-900">Fiyat Alarmı Ekle</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Varlık Sembolü
            </label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="Örn: USD, BTC, AAPL"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hedef Fiyat
            </label>
            <input
              type="number"
              step="0.01"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Koşul</label>
            <div className="flex gap-3">
              <label className="flex-1 flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all hover:bg-slate-50">
                <input
                  type="radio"
                  value="above"
                  checked={condition === 'above'}
                  onChange={(e) => setCondition(e.target.value as 'above')}
                  className="mr-2"
                />
                <span className="font-medium">Üstüne Çıkınca</span>
              </label>
              <label className="flex-1 flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all hover:bg-slate-50">
                <input
                  type="radio"
                  value="below"
                  checked={condition === 'below'}
                  onChange={(e) => setCondition(e.target.value as 'below')}
                  className="mr-2"
                />
                <span className="font-medium">Altına Düşünce</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              İptal
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Alarm Ekle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
