import { useEffect, useMemo, useState } from 'react';
import { supabase, Holding } from '../lib/supabase';
import { fxToTRY, getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';
import {
  BUY_INSTRUMENTS, BUY_TARGET_DATE, BUY_TARGET_EUR, BUY_PLAN_START, BUY_WEIGHTS,
  buyProgress, fundingHint, pacePerMonth, priceDropPct, splitBuy, sumInvestedEUR,
} from '../lib/buyPlan';

const fmt = (n: number) => Math.round(n).toLocaleString('de-DE');

interface BuyRow { symbol: string; amountEUR: number; date: string }

function cashEUR(holdings: Holding[], symbols: string[]): number {
  const fx = getFxRatesFromHoldings(holdings);
  const eur = fx.eur > 0 ? fx.eur : 0;
  if (!(eur > 0)) return 0;
  return holdings
    .filter(h => h.asset_type === 'currency' && symbols.includes(h.symbol.toUpperCase()))
    .reduce((s, h) => s + holdingValueTRY(h, fx) / eur, 0);
}

export function BuyPlanCard({ holdings }: { holdings: Holding[] }) {
  const [amount, setAmount] = useState('1000');
  const [buys, setBuys] = useState<BuyRow[]>([]);
  const [drop, setDrop] = useState<number | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const fx = getFxRatesFromHoldings(holdings);
      const eur = fx.eur > 0 ? fx.eur : 0;
      const byId = new Map(holdings.map(h => [String(h.id), h]));
      const since = new Date(Date.now() - 10 * 86400000).toISOString();
      const [txRes, pxRes] = await Promise.all([
        supabase.from('transactions').select('holding_id,transaction_type,total_amount,transaction_date').eq('transaction_type', 'buy').gte('transaction_date', BUY_PLAN_START),
        supabase.from('price_history').select('price,recorded_at').eq('symbol', 'VWCE').gte('recorded_at', since).order('recorded_at', { ascending: true }),
      ]);
      if (cancel) return;
      const rows: BuyRow[] = [];
      if (!txRes.error) {
        for (const t of txRes.data || []) {
          const h = byId.get(String(t.holding_id));
          if (!h || !(eur > 0)) continue;
          const native = Number(t.total_amount) || 0;
          rows.push({
            symbol: h.symbol,
            date: String(t.transaction_date || ''),
            amountEUR: fxToTRY(native, h.currency, fx) / eur,
          });
        }
      }
      setBuys(rows);
      const px = pxRes.error ? [] : (pxRes.data || []);
      if (px.length >= 2) {
        const a = px[0], b = px[px.length - 1];
        const span = (new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()) / 86400000;
        setDrop(span >= 5 ? priceDropPct(Number(a.price), Number(b.price)) : null);
      } else setDrop(null);
    })();
    return () => { cancel = true; };
  }, [holdings]);

  const progress = useMemo(() => buyProgress(sumInvestedEUR(buys)), [buys]);
  const pace = useMemo(() => pacePerMonth(progress.remainingEUR, new Date()), [progress.remainingEUR]);
  const entered = Math.max(0, parseFloat(amount.replace(',', '.')) || 0);
  const split = splitBuy(entered, drop);
  const euroCash = cashEUR(holdings, ['EURO', 'EUR']);
  const usdCash = cashEUR(holdings, ['USD']);
  const hasVwce = holdings.some(h => h.symbol.toUpperCase() === 'VWCE' && h.quantity > 0);

  return (
    <div className="rounded-lg bg-white/60 dark:bg-gray-900/30 border border-slate-200 dark:border-gray-700 p-3 mb-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300">Esnek alım planı</p>
      <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
        Sabit haftalık takvim yok. Hedef <strong>€{fmt(BUY_TARGET_EUR)}</strong>, {BUY_TARGET_DATE.split('-').reverse().join('.')} tarihine kadar.
        Oran: VWCE %{BUY_WEIGHTS.VWCE * 100} / V3YL %{BUY_WEIGHTS.V3YL * 100} / XEON %{BUY_WEIGHTS.XEON * 100}.
      </p>

      <div className="mt-2">
        <div className="flex justify-between text-[11px] text-slate-600 dark:text-gray-300 mb-1">
          <span>Yatırılan €{fmt(progress.investedEUR)}</span>
          <span>Kalan €{fmt(progress.remainingEUR)}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
          <div className="h-full bg-brand-600" style={{ width: `${progress.pct}%` }} />
        </div>
        <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-1">%{progress.pct.toFixed(0)} · {BUY_PLAN_START} sonrası VWCE, V3YL ve XEON alışları</p>
      </div>

      <p className="text-[11px] text-slate-600 dark:text-gray-300 mt-2">
        {pace.pastDue
          ? `Hedef tarihi geçti. Kalan €${fmt(progress.remainingEUR)} — acele yok, kendi hızında yatırabilirsin.`
          : `Ayda yaklaşık €${fmt(pace.perMonthEUR)} yatırırsan ${BUY_TARGET_DATE.split('-').reverse().join('.')} tarihine yetişir. Yetişmezse de sorun değil.`}
      </p>
      <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-1">Kaynak sırası: {fundingHint(euroCash, usdCash)}</p>
      {!(getFxRatesFromHoldings(holdings).eur > 0) && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">Euro kuru yok. Son gerçek kur da yoksa usd ile çarpılarak euro uydurulmaz.</p>
      )}
      {!hasVwce && (
        <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-1">
          VWCE henüz yok. Eklemek için sembol <strong>VWCE</strong> — {BUY_INSTRUMENTS.VWCE.venue} {BUY_INSTRUMENTS.VWCE.yahoo}, ISIN {BUY_INSTRUMENTS.VWCE.isin}, EUR.
        </p>
      )}

      <div className="mt-3">
        <label className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-gray-400">Bugün €X yatırırsan</label>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-sm font-bold">€</span>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-2 py-1 text-sm font-semibold bg-slate-50 dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded"
          />
        </div>
        <p className="text-[11px] text-slate-700 dark:text-gray-200 mt-1.5">
          €{fmt(split.VWCE)} VWCE · €{fmt(split.V3YL)} V3YL · €{fmt(split.XEON)} XEON
        </p>
        {split.dipped && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
            VWCE son 7 günde %{Math.abs(drop || 0).toFixed(1)} düştü. XEON'daki tutarın yarısını VWCE'ye ekleyebilirsin.
          </p>
        )}
      </div>
    </div>
  );
}
