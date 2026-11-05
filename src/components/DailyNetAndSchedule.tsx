import { useEffect, useMemo, useState } from 'react';
import { supabase, Holding } from '../lib/supabase';
import { computePortfolioMetrics } from '../lib/portfolioMetrics';
import { dailyNetChange } from '../lib/dailyNetChange';
import { investmentSchedule, ScheduleBuy } from '../lib/investmentSchedule';
import { INVESTMENT_SCHEDULE } from '../config';

const eur = (n: number) => `€${Math.round(Math.abs(n)).toLocaleString('tr-TR')}`;
const trDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const card = 'rounded-2xl border border-gold-200/60 dark:border-gold-900/40 bg-white/70 dark:bg-ink-900/60 p-4';

export function DailyNetChangeCard({ holdings }: { holdings: Holding[] }) {
  const [snap, setSnap] = useState<{ v: number; d: string } | null>(null);
  useEffect(() => {
    let c = false;
    void (async () => {
      const { data } = await supabase.from('portfolio_snapshots').select('snapshot_date,total_value').order('snapshot_date', { ascending: false }).order('created_at', { ascending: false }).limit(1);
      if (!c && data?.length) setSnap({ v: Number(data[0].total_value), d: String(data[0].snapshot_date) });
    })();
    return () => { c = true; };
  }, []);
  const m = useMemo(() => computePortfolioMetrics(holdings), [holdings]);
  const r = snap ? dailyNetChange(m.totalValueTRY, snap.v, m.fxRates.eur, snap.d) : null;
  const pos = (r?.changeEUR ?? 0) >= 0;
  return (
    <div className={card}>
      <div className="text-sm font-semibold text-ink-700 dark:text-gold-100">Günlük net değişim</div>
      <div className="text-xs text-ink-500 dark:text-gold-200/60">Dünkü kapanışa göre{r ? ` (${trDate(r.prevDate)} kaydı)` : ''}</div>
      {r ? (
        <div className={`mt-2 text-2xl font-bold ${pos ? 'text-emerald-600' : 'text-rose-600'}`}>
          {pos ? '+' : '−'}{eur(r.changeEUR)} <span className="text-base">({pos ? '+' : '−'}%{Math.abs(r.changePct).toFixed(2).replace('.', ',')})</span>
        </div>
      ) : <div className="mt-2 text-sm text-ink-500">hesaplanıyor…</div>}
      {r && <div className="text-xs text-ink-500 dark:text-gold-200/60 mt-1">Şimdi {eur(r.nowEUR)} · kapanış {eur(r.prevEUR)} (aynı euro kuruyla)</div>}
    </div>
  );
}

export function InvestmentScheduleCard({ holdings }: { holdings: Holding[] }) {
  const [buys, setBuys] = useState<ScheduleBuy[] | null>(null);
  const vwce = holdings.find(h => h.symbol === INVESTMENT_SCHEDULE.SYMBOL);
  const euroQty = Number(holdings.find(h => h.symbol === 'EURO')?.quantity) || 0;
  const usdQty = Number(holdings.find(h => h.symbol === 'USD')?.quantity) || 0;
  useEffect(() => {
    if (!vwce) { setBuys([]); return; }
    let c = false;
    void (async () => {
      const { data } = await supabase.from('transactions').select('transaction_date,total_amount').eq('holding_id', vwce.id).eq('transaction_type', 'buy').gte('transaction_date', INVESTMENT_SCHEDULE.START_DATE);
      if (!c) setBuys((data || []).map(t => ({ date: String(t.transaction_date), amountEUR: Number(t.total_amount) })));
    })();
    return () => { c = true; };
  }, [vwce?.id]);
  const s = buys ? investmentSchedule(euroQty, buys, new Date().toISOString().slice(0, 10)) : null;
  return (
    <div className={card}>
      <div className="text-sm font-semibold text-ink-700 dark:text-gold-100">Yatırım takvimi</div>
      <div className="text-xs text-ink-500 dark:text-gold-200/60">Haftada {eur(INVESTMENT_SCHEDULE.WEEKLY_EUR)} VWCE · {eur(INVESTMENT_SCHEDULE.RESERVE_EUR)} euro yedekte kalır</div>
      {s ? (<>
        <div className="mt-3 h-3 w-full rounded-full bg-slate-200 dark:bg-ink-800 overflow-hidden">
          <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, s.pct)}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-1 text-sm">
          <span>Yatırıldı: <b>{eur(s.deployedEUR)}</b> ({s.buys} alım)</span>
          <span>Kalan: <b>{eur(s.remainingEUR)}</b></span>
        </div>
        <div className="text-xs text-ink-500 dark:text-gold-200/60 mt-1">
          %{s.pct.toFixed(0)} tamam · {s.finishDate ? `bu hızla bitiş: ${trDate(s.finishDate)} (${s.weeksLeft} hafta)` : 'plan tamamlandı'}
        </div>
      </>) : <div className="mt-2 text-sm text-ink-500">hesaplanıyor…</div>}
      {usdQty > 0 && <div className="mt-3 text-xs rounded-lg bg-amber-50 dark:bg-amber-900/20 px-2 py-1">Dolar ${Math.round(usdQty).toLocaleString('tr-TR')}: karar bekliyor (plana dahil değil)</div>}
    </div>
  );
}
