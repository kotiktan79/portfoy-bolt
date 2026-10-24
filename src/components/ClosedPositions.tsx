import { useEffect, useState } from 'react';
import { supabase, type Holding } from '../lib/supabase';
import { assetName } from '../lib/assetNames';
import { isClosedHolding, salesForHolding, sumRealizedEUR, type ClosedSale } from '../lib/closedPositions';
import { getAllTransactions } from '../services/transactionService';

interface Row {
  holding: Holding;
  sales: ClosedSale[];
  eur: number | null;
}

export function ClosedPositions({ holdings }: { holdings: Holding[] }) {
  const closed = holdings.filter(isClosedHolding);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const list = holdings.filter(isClosedHolding);
    if (!list.length) { setRows([]); return; }
    let cancel = false;
    setLoading(true);
    (async () => {
      const [txs, eurRows, usdRows] = await Promise.all([
        getAllTransactions(),
        supabase.from('exchange_rates_daily').select('day,rate,source').eq('from_currency', 'EUR').eq('to_currency', 'TRY').in('source', ['api', 'ecb']),
        supabase.from('exchange_rates_daily').select('day,rate,source').eq('from_currency', 'USD').eq('to_currency', 'TRY').in('source', ['api', 'ecb']),
      ]);
      const eurAt = rateFn(eurRows.data || []);
      const usdAt = rateFn(usdRows.data || []);
      const next = list.map(holding => {
        const sales = salesForHolding(holding, txs);
        return { holding, sales, eur: sumRealizedEUR(sales, (ccy, day) => ccy === 'USD' ? usdAt(day) : eurAt(day)) };
      });
      if (!cancel) { setRows(next); setLoading(false); }
    })().catch(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [holdings]);

  if (!closed.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 md:px-5 py-4">
      <h3 className="text-sm font-bold text-slate-700 dark:text-gray-200">Kapanmış pozisyonlar</h3>
      <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5 mb-3">
        Adet sıfır, itfa etmiş tahvil dahil. Geçmiş durur. Realize euro satış gününün kuruyla; kâr cetveline burada eklenmez.
      </p>
      {loading && <p className="text-xs text-slate-400">Yükleniyor…</p>}
      <div className="space-y-2">
        {rows.map(({ holding, sales, eur }) => {
          const native = sales.reduce((s, x) => s + x.native, 0);
          const ccy = sales[0]?.currency || String(holding.currency || 'TRY').toUpperCase();
          return (
            <div key={holding.id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 dark:bg-gray-900/40 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{assetName(holding.symbol, holding.price_notes)}</p>
                <p className="text-[11px] text-slate-500 dark:text-gray-400">
                  {holding.symbol}
                  {holding.maturity_date ? ` · itfa ${holding.maturity_date.slice(0, 10)}` : ''}
                  {' · adet 0'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold tabular-nums text-slate-800 dark:text-gray-100">
                  {eur == null ? 'kur yok' : `${eur >= 0 ? '+' : '−'}€${Math.abs(eur).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`}
                </p>
                <p className="text-[10px] text-slate-500 tabular-nums">
                  {native.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} {ccy === 'TRY' ? '₺' : ccy} realize
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function rateFn(rows: Array<{ day: string; rate: number; source: string }>): (day: string) => number {
  const m = new Map<string, number>();
  for (const r of rows) {
    const d = String(r.day).slice(0, 10);
    const rate = Number(r.rate);
    if (!(rate > 1)) continue;
    if (r.source === 'api' || !m.has(d)) m.set(d, rate);
  }
  const sorted = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return (day: string) => {
    let best = 0;
    for (const [d, rate] of sorted) { if (d <= day) best = rate; else break; }
    return best;
  };
}
