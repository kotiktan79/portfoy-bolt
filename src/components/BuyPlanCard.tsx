import { useEffect, useMemo, useState } from 'react';
import { supabase, Holding } from '../lib/supabase';
import { policySnapshot } from '../lib/policyAllocation';
import {
  BUY_INSTRUMENTS,
  buildWeeklyPlan, euroCashEUR, vwcePriceEUR, weeklyPlanCopy,
} from '../lib/buyPlan';

export function WeeklyBuySummary({ holdings }: { holdings: Holding[] }) {
  const [histPrice, setHistPrice] = useState<number | null>(null);
  const fromHolding = vwcePriceEUR(holdings);
  useEffect(() => {
    if (fromHolding != null) return;
    let cancel = false;
    void (async () => {
      try {
        const { data, error } = await supabase.from('price_history').select('price').eq('symbol', 'VWCE').order('recorded_at', { ascending: false }).limit(1);
        if (cancel || error || !data?.length) return;
        const p = Number(data[0].price);
        if (p > 0) setHistPrice(p);
      } catch {
        // Fiyat yoksa adet boş kalır.
      }
    })();
    return () => { cancel = true; };
  }, [fromHolding]);

  const plan = useMemo(() => {
    const snap = policySnapshot(holdings);
    const safePct = snap.totalEUR > 0 ? (snap.rows.find(r => r.key === 'safe')?.currentPct ?? null) : null;
    return buildWeeklyPlan({
      euroCashEUR: euroCashEUR(holdings),
      safePct,
      vwcePriceEUR: fromHolding ?? histPrice,
    });
  }, [holdings, fromHolding, histPrice]);
  const copy = weeklyPlanCopy(plan);
  const hasVwce = holdings.some(h => h.symbol.toUpperCase() === 'VWCE' && Number(h.quantity) > 0);

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-slate-700 dark:text-gray-200 font-semibold">{copy.weekLine}</p>
      <p className="text-[11px] text-slate-700 dark:text-gray-200">{copy.unitsLine}</p>
      <p className="text-[11px] text-slate-600 dark:text-gray-300">{copy.cashLine}</p>
      <p className="text-[11px] text-slate-500 dark:text-gray-400">{copy.holdLine}</p>
      {!hasVwce && (
        <p className="text-[11px] text-slate-500 dark:text-gray-400">
          VWCE henüz yok. Eklemek için sembol <strong>VWCE</strong> — {BUY_INSTRUMENTS.VWCE.venue} {BUY_INSTRUMENTS.VWCE.yahoo}, ISIN {BUY_INSTRUMENTS.VWCE.isin}, EUR.
        </p>
      )}
    </div>
  );
}

export function BuyPlanCard({ holdings }: { holdings: Holding[] }) {
  return (
    <div className="rounded-lg bg-white/60 dark:bg-gray-900/30 border border-slate-200 dark:border-gray-700 p-3 mb-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300">Haftalık alım planı</p>
      <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5 mb-2">
        Her hafta EUR nakitten sabit €1.000. Kaynak EUR nakit; USD bu plana girmez.
      </p>
      <WeeklyBuySummary holdings={holdings} />
    </div>
  );
}
