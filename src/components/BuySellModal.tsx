import { useState } from 'react';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { addTransaction } from '../services/transactionService';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../services/priceService';
import { updateCashBalance } from '../services/cashService';
import { useToast } from '../hooks/useToast';

interface BuySellModalProps {
  holding: Holding;
  type: 'buy' | 'sell';
  onClose: () => void;
  onComplete: () => void;
}

export function BuySellModal({ holding, type, onClose, onComplete }: BuySellModalProps) {
  const toast = useToast();
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState(holding.current_price.toString());
  const [fee, setFee] = useState('0');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const totalAmount = parseFloat(quantity || '0') * parseFloat(price || '0');
  const totalWithFee = type === 'buy'
    ? totalAmount + parseFloat(fee || '0')
    : totalAmount - parseFloat(fee || '0');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const qty = parseFloat(quantity);
    const prc = parseFloat(price);
    const feeVal = parseFloat(fee || '0');

    if (isNaN(qty) || qty <= 0) {
      toast.error('Lütfen geçerli bir miktar girin');
      return;
    }

    if (isNaN(prc) || prc <= 0) {
      toast.error('Lütfen geçerli bir fiyat girin');
      return;
    }

    if (isNaN(feeVal) || feeVal < 0) {
      toast.error('Komisyon negatif olamaz');
      return;
    }

    if (type === 'sell' && qty > holding.quantity) {
      toast.error('Satış miktarı mevcut miktardan fazla olamaz');
      return;
    }

    setLoading(true);

    try {
      const transactionData = {
        holding_id: holding.id,
        transaction_type: type,
        quantity: qty,
        price: prc,
        total_amount: totalAmount,
        fee: feeVal,
        notes: notes || undefined,
        transaction_date: new Date().toISOString(),
      };

      const transactionResult = await addTransaction(transactionData);
      if (!transactionResult) {
        throw new Error('İşlem kaydedilemedi');
      }

      const newQuantity = type === 'buy'
        ? holding.quantity + qty
        : holding.quantity - qty;

      if (type === 'buy') {
        const totalCost = (holding.purchase_price * holding.quantity) + totalWithFee;
        const newAvgPrice = totalCost / newQuantity;

        await updateCashBalance('TRY', totalWithFee, 'buy',
          `${holding.symbol} alış - ${quantity} adet x ${price} ₺`,
          holding.id
        );

        const { error: updateError } = await supabase
          .from('holdings')
          .update({
            quantity: newQuantity,
            purchase_price: newAvgPrice,
            updated_at: new Date().toISOString(),
          })
          .eq('id', holding.id);

        if (updateError) {
          throw new Error(`Varlık güncellenemedi: ${updateError.message}`);
        }
      } else {
        const realizedProfit = (prc - holding.purchase_price) * qty - feeVal;

        await updateCashBalance('TRY', totalWithFee, 'sell',
          `${holding.symbol} satış - ${quantity} adet x ${price} ₺ (Kar/Zarar: ${realizedProfit.toFixed(2)} ₺)`,
          holding.id
        );

        const { error: profitError } = await supabase
          .from('transactions')
          .update({
            realized_profit: realizedProfit,
          })
          .eq('holding_id', holding.id)
          .eq('transaction_date', transactionData.transaction_date);

        if (profitError) {
          console.warn('Realized profit update failed:', profitError);
        }

        if (newQuantity <= 0) {
          const { error: deleteError } = await supabase
            .from('holdings')
            .delete()
            .eq('id', holding.id);

          if (deleteError) {
            throw new Error(`Varlık silinemedi: ${deleteError.message}`);
          }
        } else {
          const { error: updateError } = await supabase
            .from('holdings')
            .update({
              quantity: newQuantity,
              updated_at: new Date().toISOString(),
            })
            .eq('id', holding.id);

          if (updateError) {
            throw new Error(`Varlık güncellenemedi: ${updateError.message}`);
          }
        }
      }

      onComplete();
      onClose();
    } catch (error) {
      console.error('Transaction error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu';
      toast.error(`İşlem başarısız: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }

  const isBuy = type === 'buy';
  const canSell = !isBuy && parseFloat(quantity || '0') > holding.quantity;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className={`flex items-center justify-between p-6 border-b ${
          isBuy ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-3">
            {isBuy ? (
              <TrendingUp className="text-green-600" size={24} />
            ) : (
              <TrendingDown className="text-red-600" size={24} />
            )}
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {isBuy ? 'Alış İşlemi' : 'Satış İşlemi'}
              </h2>
              <p className="text-sm text-gray-600">
                {holding.symbol} - {formatCurrency(holding.current_price)} ₺
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!isBuy && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              Mevcut Miktar: <strong>{formatCurrency(holding.quantity)} adet</strong>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Miktar
            </label>
            <input
              type="number"
              step="0.00000001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fiyat (₺)
            </label>
            <input
              type="number"
              step="0.0001"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Komisyon (₺)
            </label>
            <input
              type="number"
              step="0.01"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Not (Opsiyonel)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="İşlem notu..."
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="p-4 bg-slate-50 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Toplam:</span>
              <span className="font-semibold text-gray-900">
                {formatCurrency(totalAmount)} ₺
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Komisyon:</span>
              <span className="font-semibold text-gray-900">
                {formatCurrency(parseFloat(fee || '0'))} ₺
              </span>
            </div>
            <div className="h-px bg-gray-300 my-2"></div>
            <div className="flex justify-between">
              <span className="font-semibold text-gray-700">
                {isBuy ? 'Ödenecek:' : 'Alınacak:'}
              </span>
              <span className={`text-lg font-bold ${isBuy ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(totalWithFee)} ₺
              </span>
            </div>
          </div>

          {canSell && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              <strong>Uyarı:</strong> Satış miktarı mevcut miktardan fazla olamaz!
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              disabled={loading}
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || canSell}
              className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                isBuy
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {loading ? 'İşleniyor...' : isBuy ? 'Satın Al' : 'Sat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
