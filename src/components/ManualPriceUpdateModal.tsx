import React, { useState } from 'react';
import { X, DollarSign, Info } from 'lucide-react';
import { useToast } from '../hooks/useToast';

interface ManualPriceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  currentPrice: number;
  onUpdatePrice: (symbol: string, newPrice: number, notes?: string) => Promise<void>;
}

export function ManualPriceUpdateModal({
  isOpen,
  onClose,
  symbol,
  currentPrice,
  onUpdatePrice,
}: ManualPriceUpdateModalProps) {
  const toast = useToast();
  const [price, setPrice] = useState(currentPrice.toString());
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newPrice = parseFloat(price);
    if (isNaN(newPrice) || newPrice <= 0) {
      toast.error('Geçerli bir fiyat giriniz');
      return;
    }

    setIsSubmitting(true);
    try {
      await onUpdatePrice(symbol, newPrice, notes);
      onClose();
    } catch (error) {
      console.error('Price update failed:', error);
      toast.error('Fiyat güncellenemedi');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Manuel Fiyat Güncelle
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sembol
            </label>
            <input
              type="text"
              value={symbol}
              disabled
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Mevcut Fiyat
            </label>
            <input
              type="text"
              value={`₺${currentPrice.toFixed(4)}`}
              disabled
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Yeni Fiyat (₺)
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="number"
                step="0.0001"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-white"
                placeholder="0.0000"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Not (Opsiyonel)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-700 dark:text-white resize-none"
              placeholder="Fiyat kaynağı veya notlar (ör: 'Bloomberg terminal', 'Kurumdan alınan rapor')"
              rows={3}
            />
          </div>

          <div className="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg p-3">
            <div className="flex gap-2">
              <Info size={16} className="text-brand-600 dark:text-brand-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-brand-800 dark:text-brand-300">
                <p className="font-medium mb-1">Manuel Fiyat Koruması</p>
                <p>Bu fiyat manuel olarak işaretlenecek ve otomatik güncellemelerden etkilenmeyecektir.</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              disabled={isSubmitting}
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Güncelleniyor...' : 'Güncelle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
