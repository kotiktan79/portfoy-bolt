import { useState, useEffect } from 'react';
import { X, Wallet } from 'lucide-react';
import { AssetType } from '../lib/supabase';

interface AddHoldingModalProps {
  onClose: () => void;
  onAdd: (holding: {
    symbol: string;
    asset_type: AssetType;
    purchase_price: number;
    quantity: number;
    current_price: number;
  }) => Promise<void>;
}

export function AddHoldingModal({ onClose, onAdd }: AddHoldingModalProps) {
  const [symbol, setSymbol] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('stock');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [cashCurrency, setCashCurrency] = useState('TRY');
  const [error, setError] = useState('');

  const isCash = assetType === 'cash';

  useEffect(() => {
    if (isCash) {
      setSymbol(cashCurrency);
      setPurchasePrice('1');
    }
  }, [isCash, cashCurrency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isCash) {
      const amount = parseFloat(cashAmount);
      if (isNaN(amount) || amount <= 0) {
        setError('Geçerli bir tutar girin');
        return;
      }
      try {
        await onAdd({
          symbol: cashCurrency,
          asset_type: 'cash',
          purchase_price: 1,
          quantity: amount,
          current_price: 1,
        });
        onClose();
      } catch {
        setError('Nakit eklenirken bir hata oluştu');
      }
      return;
    }

    if (!symbol.trim()) {
      setError('Sembol boş olamaz');
      return;
    }

    if (symbol.length > 20) {
      setError('Sembol çok uzun (max 20 karakter)');
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

    try {
      await onAdd({
        symbol: symbol.toUpperCase().trim(),
        asset_type: assetType,
        purchase_price: price,
        quantity: qty,
        current_price: price,
      });
      onClose();
    } catch (err) {
      setError('Varlık eklenirken bir hata oluştu');
      console.error('Error adding holding:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Yeni Varlık Ekle</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Varlık Tipi
            </label>
            <select
              value={assetType}
              onChange={(e) => {
                setAssetType(e.target.value as AssetType);
                setError('');
              }}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="stock">Hisse</option>
              <option value="crypto">Kripto</option>
              <option value="currency">Döviz</option>
              <option value="fund">Fon</option>
              <option value="eurobond">Eurobond</option>
              <option value="commodity">Emtia</option>
              <option value="cash">Nakit</option>
            </select>
          </div>

          {isCash ? (
            <>
              <div className="p-3 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg flex items-center gap-2 text-sm text-brand-700 dark:text-brand-300">
                <Wallet size={16} />
                Nakit varlık portföyünüze TRY, USD veya EUR olarak eklenir.
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Para Birimi
                </label>
                <select
                  value={cashCurrency}
                  onChange={(e) => setCashCurrency(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value="TRY">TRY - Türk Lirası</option>
                  <option value="USD">USD - Amerikan Doları</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - İngiliz Sterlini</option>
                  <option value="CHF">CHF - İsviçre Frangı</option>
                  <option value="RON">RON - Rumen Leyi</option>
                  <option value="RUB">RUB - Rus Rublesi</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tutar ({cashCurrency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  required
                  autoFocus
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Sembol
                </label>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="AKSEN, BTC, USD..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  required
                />
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
                  placeholder="0.00"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
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
                  placeholder="0.00"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  required
                />
              </div>
            </>
          )}

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
            >
              İptal
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium shadow-lg hover:shadow-xl hover:scale-105"
            >
              {isCash ? 'Nakit Ekle' : 'Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
