import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { assetName } from '../lib/assetNames';
import { incomeViews, type IncomeSource, type IncomeView } from '../lib/incomeDisplay';

export function IncomePanel() {
  const [rows, setRows] = useState<IncomeView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [inc, div] = await Promise.all([
        supabase.from('income_records').select('id,income_date,income_type,source_symbol,amount,currency,amount_try,notes,is_projected,destination').order('income_date', { ascending: false }).limit(100),
        supabase.from('dividends').select('id,holding_id,amount,payment_date,notes').order('payment_date', { ascending: false }).limit(100),
      ]);
      if (inc.error) throw new Error(inc.error.message);
      const dividends = div.error ? [] : ((div.data || []) as IncomeSource[]);
      if (!cancel) setRows(incomeViews((inc.data || []) as IncomeSource[], dividends));
    })().catch((e: unknown) => {
      if (!cancel) setError(e instanceof Error ? e.message : 'Gelir yüklenemedi');
    });
    return () => { cancel = true; };
  }, []);

  if (error) return <p className="text-xs text-red-600">{error}</p>;
  if (!rows) return <p className="text-xs text-slate-400">Gelir yükleniyor…</p>;

  const coupons = rows.filter(r => r.kind === 'coupon').length;
  const trySum = rows.reduce((s, r) => s + r.amountTry, 0);

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300">Gelir kayıtları</p>
        <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
          Kupon ve temettü burada gelir olarak durur. Kâr cetveline yalnız kasaya işlenenler girer; bu listedekiler cetveli değiştirmez.
        </p>
      </div>
      <p className="text-[11px] text-slate-600 dark:text-gray-300">
        {rows.length} kayıt · {coupons} kupon · toplam {trySum.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">Henüz kupon, temettü veya gelir kaydı yok.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 dark:bg-gray-900/40 px-2.5 py-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-gray-100">
                  {r.label}{r.source ? ` · ${assetName(r.source)}` : ''}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-gray-400">
                  {r.date}
                  {r.source ? ` · ${r.source}` : ''}
                  {r.inProfitEngine ? ' · kâr cetvelinde' : ' · kâr cetveline eklenmedi'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                  {r.amount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} {r.currency}
                </p>
                {r.currency !== 'TRY' && r.amountTry > 0 && (
                  <p className="text-[10px] text-slate-500 tabular-nums">{r.amountTry.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
