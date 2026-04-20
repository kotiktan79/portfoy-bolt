import { useMemo } from 'react';
import { Calculator, AlertTriangle } from 'lucide-react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { AssetType } from '../lib/supabase';
import { formatCurrency } from '../services/priceService';

interface TaxRule {
  label: string;
  rate: number;
  assetTypes: AssetType[];
}

const TAX_RULES: TaxRule[] = [
  { label: 'Hisse Senedi (BIST)', rate: 0, assetTypes: ['stock'] },
  { label: 'Kripto', rate: 0, assetTypes: ['crypto'] },
  { label: 'Eurobond', rate: 0.10, assetTypes: ['eurobond'] },
  { label: 'Yatırım Fonu', rate: 0.10, assetTypes: ['fund'] },
  { label: 'Döviz / Altın', rate: 0, assetTypes: ['currency', 'commodity'] },
  { label: 'Mevduat Faizi', rate: 0.15, assetTypes: ['cash'] },
];

export function TaxCalculator() {
  const { holdings } = usePortfolio();

  const taxData = useMemo(() => {
    const rows = TAX_RULES.map((rule) => {
      const realizedGain = holdings
        .filter((h) => rule.assetTypes.includes(h.asset_type))
        .reduce((sum, h) => sum + (h.total_realized_pnl ?? 0), 0);

      const estimatedTax = realizedGain > 0 ? realizedGain * rule.rate : 0;

      return {
        label: rule.label,
        realizedGain,
        rate: rule.rate,
        estimatedTax,
      };
    });

    const totalTax = rows.reduce((sum, r) => sum + r.estimatedTax, 0);
    return { rows, totalTax };
  }, [holdings]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
        <Calculator className="text-brand-500" size={16} />
        Stopaj Hesaplayıcı
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-gray-700">
              <th className="text-left py-2 pr-3 text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider">
                Varlık Türü
              </th>
              <th className="text-right py-2 px-3 text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider">
                Gerçekleşmiş Kâr
              </th>
              <th className="text-right py-2 px-3 text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider">
                Stopaj Oranı
              </th>
              <th className="text-right py-2 pl-3 text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider">
                Tahmini Vergi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-gray-700/50">
            {taxData.rows.map((row) => (
              <tr key={row.label}>
                <td className="py-2.5 pr-3 text-slate-600 dark:text-gray-300 font-medium">
                  {row.label}
                </td>
                <td className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                  row.realizedGain > 0
                    ? 'text-green-600 dark:text-green-400'
                    : row.realizedGain < 0
                    ? 'text-red-500 dark:text-red-400'
                    : 'text-slate-400 dark:text-gray-500'
                }`}>
                  ₺{formatCurrency(row.realizedGain)}
                </td>
                <td className="py-2.5 px-3 text-right text-slate-500 dark:text-gray-400">
                  %{(row.rate * 100).toFixed(0)}
                </td>
                <td className={`py-2.5 pl-3 text-right font-mono tabular-nums font-medium ${
                  row.estimatedTax > 0
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-400 dark:text-gray-500'
                }`}>
                  ₺{formatCurrency(row.estimatedTax)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 dark:border-gray-600">
              <td colSpan={3} className="py-3 pr-3 text-slate-700 dark:text-gray-200 font-semibold">
                Toplam Tahmini Vergi
              </td>
              <td className={`py-3 pl-3 text-right font-mono tabular-nums font-bold text-base ${
                taxData.totalTax > 0
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-slate-400 dark:text-gray-500'
              }`}>
                ₺{formatCurrency(taxData.totalTax)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800/50">
        <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={14} />
        <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
          Bu hesaplama tahminidir, kesin vergi hesabı için mali müşavirinize danışın.
        </p>
      </div>
    </div>
  );
}
