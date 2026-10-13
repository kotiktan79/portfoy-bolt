import { useMemo } from 'react';
import { Target, ArrowUpCircle, ArrowDownCircle, Lock, CalendarClock } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';
import { allocationClassOf, type AllocationClass } from '../config/portfolioPolicy';
import { planRebalance, type RebalanceAction } from '../lib/rebalance';

const fmtEUR = (n: number) => `€${Math.round(n).toLocaleString('de-DE')}`;

export function RebalancePlan({ holdings, totalCashValue }: { holdings: Holding[]; totalCashValue: number }) {
  const model = useMemo(() => {
    const fx = getFxRatesFromHoldings(holdings);
    const eur = fx.eur > 0 ? fx.eur : 0;
    const values: Partial<Record<AllocationClass, number>> = {};
    let xeonEUR = 0;
    for (const h of holdings) {
      if (!(eur > 0)) continue;
      const cls = allocationClassOf(h.asset_type, h.symbol);
      if (!cls) continue;
      const v = holdingValueTRY(h, fx) / eur;
      values[cls] = (values[cls] || 0) + v;
      if (h.symbol.toUpperCase() === 'XEON') xeonEUR += v;
    }
    const kasaEUR = eur > 0 ? (totalCashValue || 0) / eur : 0;
    return { ...planRebalance({ valuesEUR: values, xeonEUR, asOf: new Date() }), kasaEUR };
  }, [holdings, totalCashValue]);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300">
        <Target size={13} /> Dengeleme
      </div>
      <p className="text-[11px] text-slate-500 dark:text-gray-400 mb-3">
        Portföy {fmtEUR(model.totalEUR)} (kasa hariç). Bant dışına çıkınca uyarı; somut al/sat yalnız sapma ±10 puanı geçince.
      </p>
      {!(getFxRatesFromHoldings(holdings).eur > 0) && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300 mb-2">Euro kuru yok. Son gerçek kur da yoksa usd ile çarpılarak euro uydurulmaz.</p>
      )}

      {model.annual && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-2.5">
          <CalendarClock size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-bold text-amber-800 dark:text-amber-200">Yıllık dengeleme zamanı</p>
            <p className="text-[11px] text-amber-700 dark:text-amber-300">Ocak ayı. Önce satışsız adımlar, tutar ancak bant çok kaçtıysa.</p>
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        {model.rows.map(r => (
          <div key={r.key} className="rounded-lg bg-white/60 dark:bg-gray-900/30 border border-slate-200 dark:border-gray-700 p-2.5">
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{r.label}</span>
              <span className={`text-[11px] tabular-nums ${r.outsideBand ? 'text-amber-700 dark:text-amber-300 font-semibold' : 'text-slate-500 dark:text-gray-400'}`}>
                %{r.currentPct.toFixed(1)} · hedef %{r.targetPct} · bant %{r.min}–{r.max}
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-slate-100 dark:bg-gray-800 mb-1">
              <div
                className="absolute top-0 h-full rounded-full bg-emerald-200/80 dark:bg-emerald-900/50"
                style={{ left: `${r.min}%`, width: `${r.max - r.min}%` }}
              />
              <div className="absolute top-0 h-full w-0.5 bg-gray-900 dark:bg-white" style={{ left: `${r.targetPct}%` }} title={`Hedef %${r.targetPct}`} />
              <div
                className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-gray-900 ${r.outsideBand ? 'bg-amber-500' : 'bg-brand-600'}`}
                style={{ left: `calc(${Math.min(100, Math.max(0, r.currentPct))}% - 5px)` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 dark:text-gray-400">
              Sapma {r.drift >= 0 ? '+' : ''}{r.drift.toFixed(1)} puan
              {r.outsideBand ? ' · bant dışı' : ' · bant içinde'}
              {r.hint ? ` · ${r.hint}` : ''}
            </p>
          </div>
        ))}
      </div>

      {model.actions.filter(a => a.kind !== 'annual').length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-gray-400">Önerilen adımlar</p>
          {model.actions.filter(a => a.kind !== 'annual').map(a => (
            <ActionRow key={a.id} action={a} />
          ))}
        </div>
      )}

      <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-3 leading-relaxed">
        Yeşil şerit bant, siyah çizgi hedef, nokta bugünkü pay. Kasa {fmtEUR(model.kasaEUR)} portföy dışıdır, bu hesaba girmez. Altın fiziki: fazla ise yeni alım yok, seyrelt.
      </p>
    </div>
  );
}

function ActionRow({ action }: { action: RebalanceAction }) {
  const icon = action.kind === 'trade' && action.amountEUR > 0 && action.title.includes('azalt')
    ? <ArrowDownCircle size={13} />
    : action.kind === 'dilute'
      ? <Lock size={13} />
      : <ArrowUpCircle size={13} />;
  const tone = action.kind === 'dilute'
    ? 'text-slate-600 dark:text-gray-300'
    : action.kind === 'trade' && action.title.includes('azalt')
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-emerald-700 dark:text-emerald-300';
  return (
    <div className={`rounded-lg border border-slate-200 dark:border-gray-700 p-2 ${tone}`}>
      <p className="text-[11px] font-semibold flex items-center gap-1.5">
        {icon}
        {action.title}
        {action.amountEUR > 0.5 && <span className="font-bold">{fmtEUR(action.amountEUR)}</span>}
      </p>
      <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5">{action.detail}</p>
    </div>
  );
}
