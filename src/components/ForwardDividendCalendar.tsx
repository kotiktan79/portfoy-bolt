import { useMemo, useState } from 'react';
import { Calendar, Coins, Info } from 'lucide-react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { forecastDividends, MonthlyDividend } from '../services/dividendForecastService';
import { formatCurrency } from '../services/priceService';

const TYPE_COLORS: Record<string, string> = {
  dividend: 'bg-emerald-500',
  staking: 'bg-purple-500',
  coupon: 'bg-amber-500',
};

const TYPE_LABELS: Record<string, string> = {
  dividend: 'Temettü',
  staking: 'Staking',
  coupon: 'Kupon',
};

export default function ForwardDividendCalendar() {
  const { holdings } = usePortfolio();
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const forecast = useMemo(() => forecastDividends(holdings), [holdings]);

  if (holdings.length === 0) return null;

  const maxMonth = Math.max(...forecast.months.map(m => m.total), 1);
  const selected: MonthlyDividend | null =
    selectedMonth !== null ? forecast.months[selectedMonth] : null;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-gray-800 flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-md">
          <Coins className="text-white" size={18} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            12 Aylık Temettü Takvimi
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
              tahmini
            </span>
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Mevcut pozisyonlardan beklenen pasif gelir
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-3">
            <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Yıllık Toplam
            </div>
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
              {formatCurrency(forecast.annualTotal)} ₺
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-500 mt-0.5">
              %{forecast.effectiveYieldPct.toFixed(2)} efektif verim
            </div>
          </div>
          <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-3">
            <div className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
              Aylık Ortalama
            </div>
            <div className="text-lg font-bold text-blue-700 dark:text-blue-300 mt-0.5">
              {formatCurrency(forecast.averageMonthly)} ₺
            </div>
            <div className="text-[10px] text-blue-600 dark:text-blue-500 mt-0.5">
              Yıllık ÷ 12
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/40 p-3">
            <div className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Kapsama
            </div>
            <div className="text-lg font-bold text-gray-800 dark:text-gray-200 mt-0.5">
              {forecast.coverageCount}
              <span className="text-xs text-gray-500 font-normal"> / {forecast.coverageCount + forecast.uncoveredCount}</span>
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {forecast.uncoveredCount} pozisyon temettüsüz
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Calendar size={11} /> 12 Ay
          </h4>
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
            {forecast.months.map((m, i) => {
              const heightPct = (m.total / maxMonth) * 100;
              const isSelected = selectedMonth === i;
              const isCurrent = i === 0;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedMonth(isSelected ? null : i)}
                  className={`flex flex-col items-stretch h-24 rounded-lg border transition-colors ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 ring-2 ring-emerald-300 dark:ring-emerald-700'
                      : isCurrent
                      ? 'border-blue-300 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800'
                      : 'border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-slate-50 dark:hover:bg-gray-800/60'
                  }`}
                  title={`${m.monthLabel}: ${formatCurrency(m.total)} ₺`}
                >
                  <div className="flex-1 flex items-end p-1">
                    <div
                      className={`w-full rounded ${
                        m.total > 0
                          ? isSelected
                            ? 'bg-emerald-600'
                            : 'bg-emerald-400 dark:bg-emerald-700'
                          : 'bg-transparent'
                      }`}
                      style={{ height: `${heightPct}%`, minHeight: m.total > 0 ? '3px' : 0 }}
                    />
                  </div>
                  <div className="border-t border-slate-200 dark:border-gray-800 px-1 py-1 text-center">
                    <div className="text-[10px] font-bold text-gray-700 dark:text-gray-300">
                      {m.monthLabel}
                    </div>
                    <div className="text-[9px] font-semibold text-gray-500 dark:text-gray-500 tabular-nums">
                      {m.total > 0 ? formatCurrency(m.total, 0) : '–'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selected && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                {selected.monthLabel} Detayı
              </h4>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                Toplam: {formatCurrency(selected.total)} ₺
              </span>
            </div>
            {selected.payments.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                Bu ay için beklenen ödeme yok.
              </p>
            ) : (
              <div className="space-y-1">
                {selected.payments.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs bg-white dark:bg-gray-900/40 rounded px-2 py-1.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${TYPE_COLORS[p.type]}`} />
                      <span className="font-bold text-gray-900 dark:text-gray-100">{p.symbol}</span>
                      <span className="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-gray-800">
                        {TYPE_LABELS[p.type]}
                      </span>
                      <span className="text-[10px] text-gray-500">%{p.yieldPct.toFixed(1)}</span>
                    </div>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 ml-2 flex-shrink-0">
                      {formatCurrency(p.amount)} ₺
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-start gap-1.5 text-[10px] text-gray-500 dark:text-gray-500 italic">
          <Info size={10} className="mt-0.5 flex-shrink-0" />
          <span>
            BIST temettü tarihleri yıllık genel patternlere göre hesaplanır. Gerçek ödemeler şirket
            kararına göre değişebilir. Eurobond için 6 ayda bir Şubat/Ağustos kupon, kripto için
            sürekli staking varsayılır.
          </span>
        </div>
      </div>
    </div>
  );
}
