import { useState } from 'react';
import { X } from 'lucide-react';
import { Holding, AssetType } from '../lib/supabase';

interface EditHoldingModalProps {
  holding: Holding;
  onClose: () => void;
  onUpdate: (id: string, updates: {
    symbol: string;
    asset_type: AssetType;
    purchase_price: number;
    quantity: number;
  }) => Promise<void>;
}

export function EditHoldingModal({ holding, onClose, onUpdate }: EditHoldingModalProps) {
  const [symbol, setSymbol] = useState(holding.symbol);
  const [assetType, setAssetType] = useState<AssetType>(holding.asset_type);
  const [purchasePrice, setPurchasePrice] = useState(holding.purchase_price.toString());
  const [quantity, setQuantity] = useState(holding.quantity.toString());
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!symbol.trim()) {
      setError('Sembol boş olamaz');
      return;
    }

    const price = parseFloat(purchasePrice);
    const qty = parseFloat(quantity);

    if (isNaN(price) || price <= 0) {
      setError('Geçerli bir alış fiyatı girin');
      return;
    }

    if (isNaN(qty) || qty <= 0) {
      setError('Geçerli bir miktar girin');
      return;
    }

    setSubmitting(true);
    try {
      await onUpdate(holding.id, {
        symbol: symbol.toUpperCase(),
        asset_type: assetType,
        purchase_price: price,
        quantity: qty,
      });
      onClose();
    } catch (err) {
      setError('Güncelleme sırasında bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Varlığı Düzenle</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Sembol
            </label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Varlık Tipi
            </label>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetType)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="stock">Hisse</option>
              <option value="crypto">Kripto</option>
              <option value="currency">Döviz</option>
              <option value="fund">Fon</option>
              <option value="eurobond">Eurobond</option>
              <option value="commodity">Emtia</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Alış Fiyatı
            </label>
            <input
              type="number"
              step="0.0001"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Miktar
            </label>
            <input
              type="number"
              step="0.00000001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            >
              {submitting ? 'Güncelleniyor...' : 'Güncelle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
