import { useEffect, useState } from 'react';
import {
  buildRenovationSummary,
  formatTotalEUR,
  type RenovationSummary,
} from '../lib/romaniaRenovation';
import { loadRomaniaRenovation } from '../services/romaniaRenovationService';

const FALLBACK = buildRenovationSummary({});

/** Romanya Ev Tadilatı ekranının salt okunur listesi. Portföy sayfalarında durmaz. */
export function RomaniaRenovationCard({ summary: injected }: { summary?: RenovationSummary }) {
  const [summary, setSummary] = useState<RenovationSummary>(injected ?? FALLBACK);

  useEffect(() => {
    if (injected) {
      setSummary(injected);
      return;
    }
    let cancelled = false;
    loadRomaniaRenovation().then(next => {
      if (!cancelled) setSummary(next);
    });
    return () => { cancelled = true; };
  }, [injected]);

  const totalText = formatTotalEUR(summary);

  return (
    <section
      aria-labelledby="romania-renovation-title"
      className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-gray-700 shadow-sm"
    >
      <h2 id="romania-renovation-title" className="text-base font-bold text-gray-900 dark:text-white">
        Harcamalar
      </h2>
      <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
        Yalnız bilgi. Portföy toplamına, kâr ve zarara, Kâr Cüzdanına, performansa, anlık görüntülere, maaşa ve nakit dağılımına girmez.
      </p>
      <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 mb-3">
        Yeni harcama, kasa çekimi olarak notunda tadilat veya remont geçecek şekilde yazıldığında burada görünür.
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-gray-700">
        {summary.lines.map(line => (
          <li key={line.id} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{line.dateLabel}</div>
                <div className="text-sm text-slate-600 dark:text-gray-300 break-words">{line.description}</div>
                {line.note && (
                  <div className="text-[11px] text-slate-500 dark:text-gray-400">{line.note}</div>
                )}
                {line.currency !== 'EUR' && (
                  <div className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">{line.fxNote}</div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] text-slate-500 dark:text-gray-400">Tutar</div>
                <div className="text-sm tabular-nums text-gray-900 dark:text-gray-100">{line.nativeText}</div>
                <div className="text-[11px] text-slate-500 dark:text-gray-400 mt-1">Euro karşılığı</div>
                <div className="text-sm tabular-nums text-gray-900 dark:text-gray-100">
                  {line.currency === 'EUR' ? line.eurText : line.included ? `≈ ${line.eurText}` : line.eurText}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="pt-3 mt-1 border-t border-slate-200 dark:border-gray-700" aria-label="Yıl alt toplamları">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Yıl alt toplamları</h3>
        <ul className="space-y-1">
          {summary.years.map(year => (
            <li key={year.year} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-slate-600 dark:text-gray-300">{year.year}</span>
              <span className="tabular-nums text-gray-900 dark:text-gray-100">{year.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-baseline justify-between gap-3 pt-3 mt-3 border-t border-slate-200 dark:border-gray-700">
        <span className="text-sm font-bold text-gray-900 dark:text-white">Toplam</span>
        <span className="text-base font-bold tabular-nums text-gray-900 dark:text-white">{totalText}</span>
      </div>
    </section>
  );
}
