import { useEffect, useMemo, useState } from 'react';
import { Banknote } from 'lucide-react';
import type { Holding } from '../lib/supabase';
import { getKasaFx } from '../services/kasaFxService';
import {
  buildCashDistribution,
  type CashShare,
  type KasaLoadStatus,
  type KasaSlice,
} from '../lib/cashDistribution';

function ShareBar({ shares, label }: { shares: CashShare[]; label: string }) {
  const visible = shares.filter(s => s.pct > 0);
  if (!visible.length) return null;
  return (
    <div className="mt-3">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800"
        role="img"
        aria-label={label}
      >
        {visible.map(s => (
          <div
            key={s.currency}
            style={{ width: `${s.pct}%`, background: s.color }}
            title={`${s.label} %${s.pct}`}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div
          className="relative h-14 w-14 shrink-0 rounded-full"
          style={{ background: `conic-gradient(${visible.map((s, i) => {
            const start = visible.slice(0, i).reduce((sum, x) => sum + x.pct, 0);
            return `${s.color} ${start}% ${start + s.pct}%`;
          }).join(',')})` }}
          aria-hidden
        >
          <div className="absolute inset-[7px] rounded-full bg-white dark:bg-gray-900" />
        </div>
        <p className="text-xs sm:text-sm text-slate-700 dark:text-gray-200">{label}</p>
      </div>
    </div>
  );
}

export function CashDistributionCard({
  holdings,
  kasa,
}: {
  holdings: Holding[];
  /** Verilirse kasa servisi çağrılmaz. Test ve önizleme için. */
  kasa?: KasaSlice[] | null;
}) {
  const [remote, setRemote] = useState<{ status: KasaLoadStatus; rows: KasaSlice[] }>(() => (
    kasa === undefined
      ? { status: 'loading', rows: [] }
      : { status: kasa == null ? 'unavailable' : 'ready', rows: kasa ?? [] }
  ));

  useEffect(() => {
    if (kasa !== undefined) {
      setRemote({ status: kasa == null ? 'unavailable' : 'ready', rows: kasa ?? [] });
      return;
    }
    let cancel = false;
    setRemote({ status: 'loading', rows: [] });
    getKasaFx()
      .then(value => {
        if (cancel) return;
        if (!value) {
          setRemote({ status: 'unavailable', rows: [] });
          return;
        }
        setRemote({
          status: 'ready',
          rows: [
            ...value.rows.map(r => ({ currency: r.currency, balance: r.balance, eur: r.eurNow })),
            ...(value.missingBalances ?? []).map(m => ({ currency: m.currency, balance: m.balance, eur: null })),
          ],
        });
      })
      .catch(() => {
        if (!cancel) setRemote({ status: 'unavailable', rows: [] });
      });
    return () => { cancel = true; };
  }, [kasa]);

  const model = useMemo(
    () => buildCashDistribution(holdings, remote.rows, remote.status),
    [holdings, remote.rows, remote.status],
  );

  if (remote.status !== 'loading' && model.rows.length === 0 && !model.houseText) return null;

  return (
    <section
      aria-labelledby="nakit-dagilimi-title"
      className="card-secondary p-3 sm:p-4"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <Banknote className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 id="nakit-dagilimi-title" className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
            Nakit Dağılımı
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-gray-400 mt-0.5">
            Portföy ve kasa, euro karşılığı. Sıfır bakiyeler gizli. Ev parası toplama dahil değil.
          </p>
        </div>
      </div>

      {model.warnings.length > 0 && (
        <div className="mt-2 space-y-1">
          {model.warnings.map(w => (
            <p key={w} className="text-[11px] text-amber-700 dark:text-amber-300">{w}</p>
          ))}
        </div>
      )}

      {model.rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[11px] sm:text-sm">
            <thead>
              <tr className="text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-800">
                <th scope="col" className="py-1.5 pr-2 font-medium">Para</th>
                <th scope="col" className="py-1.5 pr-2 font-medium">Nerede</th>
                <th scope="col" className="py-1.5 pr-2 font-medium text-right">Tutar</th>
                <th scope="col" className="py-1.5 font-medium text-right">Euro karşılığı</th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map(r => (
                <tr key={r.key} className="border-b border-slate-100 dark:border-gray-800/80">
                  <th scope="row" className="py-1.5 pr-2 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{r.label}</th>
                  <td className="py-1.5 pr-2 text-slate-600 dark:text-gray-300 whitespace-nowrap">{r.placeLabel}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap">{r.amountText}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium whitespace-nowrap">{r.eurText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-slate-200 dark:border-gray-800 pt-3">
        <span className="text-sm font-bold text-gray-900 dark:text-white">{model.totalLabel}</span>
        <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{model.totalText}</span>
      </div>
      <ShareBar shares={model.shares} label={model.shareText} />
      <p className="mt-2 text-[12px] leading-snug text-slate-600 dark:text-gray-300">{model.note}</p>
      {model.houseText && (
        <p className="mt-2 border-t border-dashed border-slate-200 dark:border-gray-800 pt-2 text-[12px] text-slate-500 dark:text-gray-400">
          {model.houseText}
        </p>
      )}
    </section>
  );
}
