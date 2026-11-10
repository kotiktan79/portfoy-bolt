import { useMemo } from 'react';
import { useSilentRefresh } from '../hooks/useSilentRefresh';
import {
  buildMonthSalaryCard,
  type MonthSalaryInputs,
} from '../lib/monthSalaryCard';
import { loadMonthSalaryInputs } from '../services/monthSalaryCardService';
import type { Holding } from '../lib/supabase';

export function BuAyMaasCard({ inputs, holdings }: { inputs?: MonthSalaryInputs; holdings?: Holding[] }) {
  const resource = useSilentRefresh(async () => buildMonthSalaryCard(await loadMonthSalaryInputs(new Date(), holdings)), !inputs);
  const inputView = useMemo(() => inputs ? buildMonthSalaryCard(inputs) : null, [inputs]);
  const view = inputView ?? resource.data;
  const status = inputs || view ? 'ready' : resource.loading ? 'loading' : 'error';

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
          {view.profitLine && (
            <p
              data-testid="bu-ay-kar"
              className={`text-lg sm:text-xl font-semibold ${(view.monthProfitEUR ?? 0) < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-300'}`}
            >
              {view.profitLine}
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
          {view.remainingLine && <p className="text-sm text-slate-600 dark:text-gray-300">{view.remainingLine}</p>}
          <p className="pt-1 text-base text-slate-600 dark:text-gray-300">
            {view.rule}
          </p>
          <p className="text-sm text-slate-500 dark:text-gray-400">
            {view.inflationNote}
          </p>
        </div>
      )}
    </section>
  );
}
