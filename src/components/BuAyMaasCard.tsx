import { useEffect, useState } from 'react';
import {
  buildMonthSalaryCard,
  type MonthSalaryCardView,
  type MonthSalaryInputs,
} from '../lib/monthSalaryCard';
import { loadMonthSalaryInputs } from '../services/monthSalaryCardService';

export function BuAyMaasCard({ inputs }: { inputs?: MonthSalaryInputs }) {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>(inputs ? 'ready' : 'loading');
  const [view, setView] = useState<MonthSalaryCardView | null>(inputs ? buildMonthSalaryCard(inputs) : null);

  useEffect(() => {
    if (inputs) {
      setView(buildMonthSalaryCard(inputs));
      setStatus('ready');
      return;
    }
    let cancel = false;
    setStatus('loading');
    loadMonthSalaryInputs()
      .then(next => {
        if (cancel) return;
        setView(buildMonthSalaryCard(next));
        setStatus('ready');
      })
      .catch(() => {
        if (!cancel) setStatus('error');
      });
    return () => { cancel = true; };
  }, [inputs]);

  return (
    <section
      aria-labelledby="bu-ay-maas-title"
      className="card-primary border-2 border-emerald-200 dark:border-emerald-900 p-4 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="bu-ay-maas-title" className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
          Bu Ay Maaşın
        </h2>
        <a
          href="#kar-cuzdani"
          className="shrink-0 pt-0.5 text-sm font-semibold text-emerald-700 underline underline-offset-2 dark:text-emerald-300"
        >
          Detay
        </a>
      </div>

      {status === 'loading' && (
        <p className="mt-4 text-base text-slate-500 dark:text-gray-400">Maaş bakılıyor…</p>
      )}

      {status === 'error' && (
        <p className="mt-4 text-base text-slate-700 dark:text-gray-200">Maaş rakamı okunamadı.</p>
      )}

      {status === 'ready' && view && (
        <div className="mt-3 space-y-2">
          {view.notice && (
            <p className="text-lg sm:text-xl font-semibold text-amber-800 dark:text-amber-300">
              {view.notice}
            </p>
          )}
          <p className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight text-gray-900 dark:text-white break-words">
            {view.primary}
          </p>
          {view.sourceLine && (
            <p className="text-base sm:text-lg text-slate-700 dark:text-gray-200">
              {view.sourceLine}
            </p>
          )}
          <p className="pt-1 text-base text-slate-600 dark:text-gray-300">
            {view.rule}
          </p>
        </div>
      )}
    </section>
  );
}
