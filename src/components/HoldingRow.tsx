import { useState, useEffect, memo } from 'react';
import { Pencil, Trash2, TrendingUp, TrendingDown, Edit3, Lock, Wallet } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { formatCurrency, formatCurrencyUSD, formatPercentage, getCachedUSDRate } from '../services/priceService';
import { BuySellModal } from './BuySellModal';
import { ManualPriceUpdateModal } from './ManualPriceUpdateModal';
import { detectCurrency, calculatePnLWithCurrency, getCurrencySymbol, getExchangeRate } from '../services/currencyService';
import { ASSET_TYPE_LABELS } from '../constants/assetTypes';
import { DEFAULT_USD_TRY_RATE } from '../config';

interface HoldingRowProps {
  holding: Holding;
  onEdit: (holding: Holding) => void;
  onDelete: (id: string) => void;
  onTransactionComplete: () => void;
}

export const HoldingRow = memo(function HoldingRow({ holding, onEdit, onDelete, onTransactionComplete }: HoldingRowProps) {
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [showPriceUpdateModal, setShowPriceUpdateModal] = useState(false);
  const [usdRate, setUsdRate] = useState(DEFAULT_USD_TRY_RATE);
  const [pnlData, setPnlData] = useState({ pnl: 0, pnlPercent: 0, currentValue: 0 });
  const [cashTRYRate, setCashTRYRate] = useState(1);

  const isCash = holding.asset_type === 'cash';

  useEffect(() => {
    let cancelled = false;
    getCachedUSDRate().then(rate => { if (!cancelled) setUsdRate(rate); });
    if (isCash && holding.symbol !== 'TRY') {
      getExchangeRate(holding.symbol, 'TRY').then(rate => { if (!cancelled) setCashTRYRate(rate || 1); });
    } else {
      setCashTRYRate(1);
    }

    (async () => {
      const currency = (holding as any).currency || detectCurrency(holding.symbol, holding.asset_type);
      const purchaseCurrency = (holding as any).purchase_currency || currency;
      const result = await calculatePnLWithCurrency(
        holding.purchase_price, purchaseCurrency,
        holding.current_price, currency,
        holding.quantity, 'TRY'
      );
      if (!cancelled) {
        setPnlData({ pnl: result.pnl, pnlPercent: result.pnlPercent, currentValue: result.currentValue });
      }
    })();

    return () => { cancelled = true; };
  }, [holding]);

  const isPositive = pnlData.pnl >= 0;

  const getAssetTypeLabel = (type: string) => ASSET_TYPE_LABELS[type] || type;

  if (isCash) {
    const tryValue = holding.quantity * cashTRYRate;
    const curSymbol = holding.symbol === 'TRY' ? '₺'
      : holding.symbol === 'USD' ? '$'
      : holding.symbol === 'EUR' ? '€'
      : holding.symbol === 'GBP' ? '£'
      : holding.symbol === 'RUB' ? '₽'
      : holding.symbol;

    return (
      <>
        <tr className="border-b border-brand-50 bg-brand-50/30 hover:bg-brand-50/60 transition-colors">
          <td className="px-3 md:px-5 py-3 md:py-4">
            <div className="flex items-center gap-2">
              <Wallet size={16} className="text-brand-500" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs md:text-sm text-gray-900 dark:text-white">{curSymbol} {holding.symbol}</span>
                <span className="text-xs text-brand-500">Nakit</span>
              </div>
            </div>
          </td>
          <td className="px-3 md:px-5 py-3 md:py-4 text-right text-gray-500 text-xs md:text-sm hidden sm:table-cell">-</td>
          <td className="px-3 md:px-5 py-3 md:py-4 text-right text-gray-700 dark:text-gray-300 text-xs md:text-sm hidden md:table-cell">
            {holding.quantity.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </td>
          <td className="px-3 md:px-5 py-3 md:py-4 text-right">
            <div className="flex flex-col items-end">
              {holding.symbol !== 'TRY' ? (
                <>
                  <span className="font-semibold text-xs md:text-sm text-gray-900 dark:text-white">1 {holding.symbol}</span>
                  <span className="text-[10px] md:text-xs text-brand-600">= {cashTRYRate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ₺</span>
                </>
              ) : (
                <span className="font-semibold text-xs md:text-sm text-gray-900 dark:text-white">1 ₺</span>
              )}
            </div>
          </td>
          <td className="px-3 md:px-5 py-3 md:py-4 text-right hidden lg:table-cell">
            <div className="flex flex-col items-end">
              <span className="font-bold text-sm text-gray-900 dark:text-white">{tryValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
              {holding.symbol !== 'TRY' && (
                <span className="text-xs text-brand-500">${formatCurrencyUSD(tryValue, usdRate)}</span>
              )}
            </div>
          </td>
          <td className="px-3 md:px-5 py-3 md:py-4 text-right">
            <span className="text-xs md:text-sm text-gray-400">-</span>
          </td>
          <td className="px-3 md:px-5 py-3 md:py-4">
            <div className="flex items-center justify-end gap-1 md:gap-2">
              <button
                onClick={() => onEdit(holding)}
                className="p-1.5 md:p-2 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                title="Düzenle"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => onDelete(holding.id)}
                className="p-1.5 md:p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                title="Sil"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </td>
        </tr>
      </>
    );
  }

  return (
    <>
      <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        {/* Varlik */}
        <td className="px-3 md:px-5 py-3 md:py-4">
          <div className="flex flex-col">
            <span className="font-semibold text-xs md:text-sm text-gray-900 dark:text-white">{holding.symbol}</span>
            <span className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400">{getAssetTypeLabel(holding.asset_type)}</span>
            {holding.price_notes && (
              <span className="text-[9px] text-gray-400 dark:text-gray-500">
                {holding.price_notes.includes('Binance') ? '\u2B21 Binance' :
                 holding.price_notes.includes('Revolut') ? '\u25C8 Revolut' :
                 ''}
              </span>
            )}
          </div>
        </td>
        {/* Alis Fiyati - hidden on mobile */}
        <td className="px-3 md:px-5 py-3 md:py-4 text-right text-xs md:text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">
          {formatCurrency(holding.purchase_price, 4)}
        </td>
        {/* Miktar - hidden on mobile */}
        <td className="px-3 md:px-5 py-3 md:py-4 text-right text-xs md:text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">
          {formatCurrency(holding.quantity, 8)}
        </td>
        {/* Guncel Fiyat */}
        <td className="px-3 md:px-5 py-3 md:py-4 text-right">
          <div className="flex items-center justify-end gap-1 md:gap-2">
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-xs md:text-sm text-gray-900 dark:text-white">
                  {formatCurrency(holding.current_price, 4)}
                </span>
                {holding.manual_price && (
                  <Lock size={10} className="text-brand-600 md:hidden" />
                )}
                {holding.manual_price && (
                  <Lock size={12} className="text-brand-600 hidden md:inline" />
                )}
              </div>
              {holding.manual_price && holding.manual_price_updated_at && (
                <span className="text-[10px] md:text-xs text-brand-600 hidden sm:block">
                  {new Date(holding.manual_price_updated_at).toLocaleDateString('tr-TR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              )}
              {holding.price_notes && (
                <span className="text-[10px] md:text-xs text-gray-500 italic max-w-[80px] md:max-w-[150px] truncate hidden sm:block" title={holding.price_notes}>
                  {holding.price_notes}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowPriceUpdateModal(true)}
              className="p-1 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors hidden sm:inline-flex"
              title="Manuel Fiyat Güncelle"
            >
              <Edit3 size={14} />
            </button>
          </div>
        </td>
        {/* Toplam Deger - hidden on mobile */}
        <td className="px-3 md:px-5 py-3 md:py-4 text-right hidden lg:table-cell">
          <div className="flex flex-col items-end">
            <span className="font-bold text-sm text-gray-900 dark:text-white">
              {formatCurrency(pnlData.currentValue)} ₺
            </span>
            <span className="text-xs text-brand-600 dark:text-brand-400">
              ${formatCurrencyUSD(pnlData.currentValue, usdRate)}
            </span>
            {((holding as any).currency && (holding as any).currency !== 'TRY') && (
              <span className="text-[10px] text-brand-600">
                {getCurrencySymbol((holding as any).currency)} bazlı
              </span>
            )}
          </div>
        </td>
        {/* K/Z */}
        <td className="px-3 md:px-5 py-3 md:py-4 text-right">
          <div className="flex flex-col items-end">
            <span className={`font-bold text-xs md:text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(pnlData.pnl)} ₺
            </span>
            <span className={`text-[10px] md:text-xs font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {formatPercentage(pnlData.pnlPercent)}
            </span>
          </div>
        </td>
        {/* Islemler */}
        <td className="px-2 md:px-5 py-3 md:py-4">
          <div className="flex items-center justify-end gap-0.5 md:gap-2">
            <button
              onClick={() => setShowBuyModal(true)}
              className="p-1.5 md:p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              title="Alış Yap"
            >
              <TrendingUp size={15} className="md:hidden" />
              <TrendingUp size={18} className="hidden md:block" />
            </button>
            <button
              onClick={() => setShowSellModal(true)}
              className="p-1.5 md:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Satış Yap"
            >
              <TrendingDown size={15} className="md:hidden" />
              <TrendingDown size={18} className="hidden md:block" />
            </button>
            <button
              onClick={() => onEdit(holding)}
              className="p-1.5 md:p-2 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors hidden sm:inline-flex"
              title="Düzenle"
            >
              <Pencil size={18} />
            </button>
            <button
              onClick={() => onDelete(holding.id)}
              className="p-1.5 md:p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors hidden sm:inline-flex"
              title="Sil"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </td>
      </tr>

      {showBuyModal && (
        <BuySellModal
          holding={holding}
          type="buy"
          onClose={() => setShowBuyModal(false)}
          onComplete={() => {
            setShowBuyModal(false);
            onTransactionComplete();
          }}
        />
      )}

      {showSellModal && (
        <BuySellModal
          holding={holding}
          type="sell"
          onClose={() => setShowSellModal(false)}
          onComplete={() => {
            setShowSellModal(false);
            onTransactionComplete();
          }}
        />
      )}

      {showPriceUpdateModal && (
        <ManualPriceUpdateModal
          isOpen={showPriceUpdateModal}
          onClose={() => setShowPriceUpdateModal(false)}
          symbol={holding.symbol}
          currentPrice={holding.current_price}
          onUpdatePrice={async (_symbol, newPrice, notes) => {
            const { supabase } = await import('../lib/supabase');
            const { error } = await supabase
              .from('holdings')
              .update({
                current_price: newPrice,
                manual_price: true,
                manual_price_updated_at: new Date().toISOString(),
                price_notes: notes || null,
                updated_at: new Date().toISOString()
              })
              .eq('id', holding.id);

            if (error) throw error;
            onTransactionComplete();
          }}
        />
      )}
    </>
  );
});
