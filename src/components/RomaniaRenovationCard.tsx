import { useEffect, useState } from 'react';
import { Home } from 'lucide-react';
import {
  buildRenovationSummary,
  formatTotalEUR,
  type RenovationSummary,
} from '../lib/romaniaRenovation';
import { loadRomaniaRenovation } from '../services/romaniaRenovationService';

const FALLBACK = buildRenovationSummary({});

/** Dağılım sayfasındaki Ev Parası bölümünün yanında duran salt okunur kart. */
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
      className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-gray-700 shadow-sm max-w-lg"
    >
      <h2 id="romania-renovation-title" className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Home className="w-5 h-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
        Romanya ev tadilat toplamı
      </h2>
      <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 mb-3">
        Yalnız bilgi. Portföy toplamına, getiriye, kâra, hedefe ve maaşa girmez.
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-gray-700">
        {summary.lines.map(line => (
          <li key={line.id} className="flex items-baseline justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="text-sm text-gray-900 dark:text-gray-100">{line.dateLabel}</div>
              {line.note && (
                <div className="text-[11px] text-slate-500 dark:text-gray-400">{line.note}</div>
              )}
            </div>
            <div className="text-right shrink-0">
              {line.currency === 'RON' ? (
                <>
                  <div className="text-sm tabular-nums text-gray-900 dark:text-gray-100">{line.nativeText}</div>
                  <div className="text-[11px] tabular-nums text-slate-500 dark:text-gray-400">≈ {line.eurText}</div>
                </>
              ) : (
                <div className="text-sm tabular-nums text-gray-900 dark:text-gray-100">{line.eurText}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-3 pt-3 border-t border-slate-200 dark:border-gray-700">
        <span className="text-sm font-bold text-gray-900 dark:text-white">Toplam</span>
        <span className="text-base font-bold tabular-nums text-gray-900 dark:text-white">{totalText}</span>
      </div>
    </section>
  );
}
