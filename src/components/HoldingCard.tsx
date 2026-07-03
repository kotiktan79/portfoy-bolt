import { useState, useEffect } from 'react';
import { Pencil, Trash2, TrendingUp, TrendingDown, Lock, Wallet, Coins, Banknote, PieChart, Package, Gem, LucideIcon } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { fmtQty, fmtPrice } from '../lib/chartTheme';
import { formatCurrency, formatPercentage } from '../services/priceService';
import { BuySellModal } from './BuySellModal';
import { detectCurrency, calculatePnLWithCurrency } from '../services/currencyService';
import { ASSET_TYPE_LABELS } from '../constants/assetTypes';
import { Sparkline } from './ui/Sparkline';

interface Props {
  holding: Holding;
  sparklineData?: number[];
  rank?: number; // 1-3 = top performers get gold/silver/bronze badge
  onEdit: (holding: Holding) => void;
  onDelete: (id: string) => void;
  onTransactionComplete: () => void;
}

const RANK_STYLES: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: 'bg-gradient-to-br from-yellow-400 to-yellow-500', text: 'text-white', label: '#1' },
  2: { bg: 'bg-gradient-to-br from-slate-300 to-slate-400', text: 'text-white', label: '#2' },
  3: { bg: 'bg-gradient-to-br from-amber-600 to-amber-700', text: 'text-white', label: '#3' },
};

const ASSET_ICONS: Record<string, LucideIcon> = {
  stock: PieChart,
  crypto: Coins,
  currency: Banknote,
  commodity: Gem,
  fund: Package,
  eurobond: Banknote,
  cash: Wallet,
};

const ASSET_TONES: Record<string, string> = {
  stock: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
  crypto: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  currency: 'bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-300',
  commodity: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  fund: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
  eurobond: 'bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-300',
  cash: 'bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-300',
};

export function HoldingCard({ holding, sparklineData, rank, onEdit, onDelete, onTransactionComplete }: Props) {
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [pnlData, setPnlData] = useState({ pnl: 0, pnlPercent: 0, currentValue: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const currency = holding.currency || detectCurrency(holding.symbol, holding.asset_type);
      const purchaseCurrency = holding.purchase_currency || currency;
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
  const Icon = ASSET_ICONS[holding.asset_type] || Package;
  const toneClass = ASSET_TONES[holding.asset_type] || ASSET_TONES.stock;
  const typeLabel = ASSET_TYPE_LABELS[holding.asset_type] || holding.asset_type;

  const rankStyle = rank && rank >= 1 && rank <= 3 ? RANK_STYLES[rank] : null;

  return (
    <>
      <div className="card-secondary p-4 hover-lift group relative">
        {rankStyle && (
          <div className={`absolute top-2 right-2 ${rankStyle.bg} ${rankStyle.text} text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-sm tabular-nums`}>
            {rankStyle.label}
          </div>
        )}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className={`p-1.5 rounded-lg ${toneClass}`}>
                <Icon size={14} />
              </div>
              <span className="font-bold text-base text-gray-900 dark:text-white truncate">{holding.symbol}</span>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${toneClass}`}>
                {typeLabel}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                {fmtPrice(holding.current_price)} ₺
              </span>
              {holding.manual_price && (
                <Lock size={11} className="text-brand-600" />
              )}
            </div>
          </div>

          <div className={`pill ${isPositive ? 'pill-positive' : 'pill-negative'} flex-shrink-0`}>
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {formatPercentage(pnlData.pnlPercent)}
          </div>
        </div>

        {sparklineData && sparklineData.length > 1 && (
          <div className="mb-3">
            <Sparkline data={sparklineData} width={240} height={36} />
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 py-2 border-t border-slate-100 dark:border-gray-800">
          <div>
            <p className="t-eyebrow !text-[9px]">Miktar</p>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums truncate">
              {fmtQty(holding.quantity)}
            </p>
          </div>
          <div>
            <p className="t-eyebrow !text-[9px]">Alış</p>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
              {fmtPrice(holding.purchase_price)} ₺
            </p>
          </div>
          <div>
            <p className="t-eyebrow !text-[9px]">Değer</p>
            <p className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">
              {formatCurrency(pnlData.currentValue, 0)} ₺
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-100 dark:border-gray-800">
          <div>
            <p className="t-eyebrow !text-[9px]">K/Z</p>
            <p className={`text-sm font-bold tabular-nums ${isPositive ? 'text-accent-600 dark:text-accent-400' : 'text-red-600 dark:text-red-400'}`}>
              {isPositive ? '+' : ''}{formatCurrency(pnlData.pnl, 0)} ₺
            </p>
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setShowBuyModal(true)}
              className="p-1.5 text-accent-600 hover:bg-accent-50 dark:hover:bg-accent-950/30 rounded-lg transition-colors"
              title="Alış"
            >
              <TrendingUp size={15} />
            </button>
            <button
              onClick={() => setShowSellModal(true)}
              className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
              title="Satış"
            >
              <TrendingDown size={15} />
            </button>
            <button
              onClick={() => onEdit(holding)}
              className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/30 rounded-lg transition-colors"
              title="Düzenle"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onDelete(holding.id)}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
              title="Sil"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

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
    </>
  );
}
