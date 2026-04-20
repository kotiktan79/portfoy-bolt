import { PieChart, TrendingUp, TrendingDown } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { formatCurrency } from '../services/priceService';

interface AssetBreakdownWidgetProps {
  holdings: Holding[];
  totalValue: number;
}

const ASSET_TYPE_CONFIG: Record<string, { label: string; color: string; bgLight: string; bgDark: string }> = {
  stock: { label: 'Hisse', color: 'bg-brand-500', bgLight: 'bg-brand-50', bgDark: 'dark:bg-brand-900/20' },
  crypto: { label: 'Kripto', color: 'bg-amber-500', bgLight: 'bg-amber-50', bgDark: 'dark:bg-amber-900/20' },
  commodity: { label: 'Emtia', color: 'bg-brand-500', bgLight: 'bg-brand-50', bgDark: 'dark:bg-brand-900/20' },
  forex: { label: 'Döviz', color: 'bg-green-500', bgLight: 'bg-green-50', bgDark: 'dark:bg-green-900/20' },
  fund: { label: 'Fon', color: 'bg-accent-500', bgLight: 'bg-accent-50', bgDark: 'dark:bg-accent-900/20' },
  eurobond: { label: 'Eurobond', color: 'bg-brand-500', bgLight: 'bg-brand-50', bgDark: 'dark:bg-brand-900/20' },
  other: { label: 'Diğer', color: 'bg-gray-500', bgLight: 'bg-gray-50', bgDark: 'dark:bg-gray-900/20' },
};

export function AssetBreakdownWidget({ holdings, totalValue }: AssetBreakdownWidgetProps) {
  const breakdown = holdings.reduce((acc, h) => {
    const type = h.asset_type || 'other';
    if (!acc[type]) acc[type] = { value: 0, count: 0, pnl: 0 };
    const value = h.current_price * h.quantity;
    const pnl = (h.current_price - h.purchase_price) * h.quantity;
    acc[type].value += value;
    acc[type].count += 1;
    acc[type].pnl += pnl;
    return acc;
  }, {} as Record<string, { value: number; count: number; pnl: number }>);

  const sortedTypes = Object.entries(breakdown).sort((a, b) => b[1].value - a[1].value);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-gray-700/70 flex items-center gap-2">
        <div className="p-1.5 bg-brand-100 dark:bg-brand-900/30 rounded-lg">
          <PieChart size={16} className="text-brand-600 dark:text-brand-400" />
        </div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-gray-200">Varlık Dağılımı</h3>
        <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{holdings.length} varlık</span>
      </div>
      <div className="p-4 space-y-3">
        {sortedTypes.map(([type, data]) => {
          const config = ASSET_TYPE_CONFIG[type] || ASSET_TYPE_CONFIG.other;
          const percentage = totalValue > 0 ? (data.value / totalValue) * 100 : 0;
          const isPositivePnl = data.pnl >= 0;

          return (
            <div key={type}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${config.color}`}></div>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{config.label}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{data.count} adet</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold flex items-center gap-0.5 ${isPositivePnl ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {isPositivePnl ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {formatCurrency(data.pnl)} ₺
                  </span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 w-12 text-right">{percentage.toFixed(1)}%</span>
                </div>
              </div>
              <div className="w-full bg-slate-100 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-700 ${config.color}`}
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
            </div>
          );
        })}
        {sortedTypes.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">Henüz varlık yok</p>
        )}
      </div>
    </div>
  );
}
