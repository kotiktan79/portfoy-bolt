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
  }) => void;
}

export function EditHoldingModal({ holding, onClose, onUpdate }: EditHoldingModalProps) {
  const [symbol, setSymbol] = useState(holding.symbol);
  const [assetType, setAssetType] = useState<AssetType>(holding.asset_type);
  const [purchasePrice, setPurchasePrice] = useState(holding.purchase_price.toString());
  const [quantity, setQuantity] = useState(holding.quantity.toString());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const price = parseFloat(purchasePrice);
    const qty = parseFloat(quantity);

    if (symbol && price > 0 && qty > 0) {
      onUpdate(holding.id, {
        symbol: symbol.toUpperCase(),
        asset_type: assetType,
        purchase_price: price,
        quantity: qty,
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Varlığı Düzenle</h2>
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
              Sembol
            </label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Varlık Tipi
            </label>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetType)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Alış Fiyatı
            </label>
            <input
              type="number"
              step="0.0001"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Miktar
            </label>
            <input
              type="number"
              step="0.00000001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
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
              Güncelle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
