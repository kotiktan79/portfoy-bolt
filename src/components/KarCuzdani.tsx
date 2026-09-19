import { useEffect, useMemo, useState } from 'react';
import { Wallet, Gauge, AlertCircle } from 'lucide-react';
import { supabase, Holding } from '../lib/supabase';
import { getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';
import { getDynamicSalary, getSalaryAccrual, getMonthToDate, DynamicSalary, SalaryAccrual, MonthToDate } from '../services/salaryService';
import { dayInTZ } from '../lib/eurPnl';
import { currentYM } from '../services/salaryService';

// KÂR CÜZDANI — TEK CETVEL: EURO (2026-09-19 gece)
//   bu ayın maaşı = geçen ayın çekilebilir reel EUR kârı × 0,85 (salaryService → eurPnl)
//   çekilebilir   = devreden açık + (euro servet artışı − dış akış − %2/yıl enflasyon payı), ≥0
// Çekim: EURO pozisyonundan (ya da başka nakit pozisyonundan) düşülür; kayıt salary_withdrawals'a
// USD karşılığıyla (eski şema) + notta EUR tutar.

interface SalaryWithdrawal { id: string; withdrawn_at: string; amount_usd: number; note: string | null; source_symbol: string | null; source_quantity_deducted: number | null }
interface Props { holdings: Holding[] }
const fmt = (n: number) => Math.round(Math.abs(n)).toLocaleString('de-DE');
const sgn = (n: number) => (n >= 0 ? '+' : '−');

export default function KarCuzdani({ holdings }: Props) {
  const [salary, setSalary] = useState<DynamicSalary | null>(null);
  const [accrual, setAccrual] = useState<SalaryAccrual | null>(null);
  const [mtd, setMtd] = useState<MonthToDate | null>(null);
  const [withdrawals, setWithdrawals] = useState<SalaryWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [sourceSymbol, setSourceSymbol] = useState<string>('EURO');
  const [amountInput, setAmountInput] = useState<string>('');

  useEffect(() => { loadAll(); }, []);
  async function loadAll() {
    setLoading(true);
    setLoadError(null);
    try {
      const [s, a, w, m] = await Promise.all([
        getDynamicSalary(), getSalaryAccrual(),
        supabase.from('salary_withdrawals').select('*').order('withdrawn_at', { ascending: false }).limit(20),
        getMonthToDate(),
      ]);
      setSalary(s); setAccrual(a); setMtd(m); if (w.data) setWithdrawals(w.data);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'veri yüklenemedi');   // motor hatası: rakam gösterme
    } finally {
      setLoading(false);
    }
  }

  const fx = useMemo(() => getFxRatesFromHoldings(holdings), [holdings]);
  const eurRate = fx.eur > 0 ? fx.eur : fx.usd * 1.15;
  const portfolioEur = useMemo(() => holdings.length && eurRate > 0 ? holdings.reduce((s, h) => s + holdingValueTRY(h, fx), 0) / eurRate : 0, [holdings, fx, eurRate]);

  // Ay sınırı kullanıcının saat diliminde (salaryService ile aynı kural)
  const monthKey = currentYM();
  const withdrawnThisMonthEur = withdrawals.filter(w => dayInTZ(String(w.withdrawn_at)).slice(0, 7) === monthKey).reduce((s, w) => s + Number(w.amount_usd) * (fx.usd / eurRate), 0);
  const salaryEur = salary?.salaryEUR ?? 0;
  const remainingEur = Math.max(0, salaryEur - withdrawnThisMonthEur);
  const amountEur = Math.min(remainingEur, Math.max(0, parseFloat(amountInput) || remainingEur));

  const cashSources = useMemo(() => holdings
    .filter(h => h.asset_type === 'currency' && h.quantity > 0 && h.current_price > 0)
    .map(h => ({ symbol: h.symbol, quantity: h.quantity, valueEur: eurRate > 0 ? holdingValueTRY(h, fx) / eurRate : 0, ccyDisplay: h.symbol === 'EURO' ? 'EUR' : h.symbol, unitsPerEur: h.current_price > 0 ? eurRate / h.current_price : 0 }))
    .filter(s => s.valueEur >= 100).sort((a, b) => b.valueEur - a.valueEur), [holdings, fx, eurRate]);
  const selectedSource = cashSources.find(s => s.symbol === sourceSymbol) || cashSources[0];
  const sourceQty = selectedSource ? amountEur * selectedSource.unitsPerEur : 0;
  const sourceSufficient = selectedSource ? selectedSource.valueEur >= amountEur : false;
  const canWithdraw = remainingEur > 0 && amountEur > 0;

  async function handleWithdraw() {
    if (!canWithdraw || !selectedSource || !sourceSufficient) return;
    const h = holdings.find(x => x.symbol === selectedSource.symbol && x.asset_type === 'currency'); if (!h) return;
    const newQty = Math.max(0, h.quantity - sourceQty);
    const amountUsd = amountEur * eurRate / fx.usd;
    const { error: rpcErr } = await supabase.rpc('withdraw_salary', {
      p_holding_id: h.id, p_new_quantity: newQty, p_amount_usd: amountUsd, p_reservoir_after_usd: (remainingEur - amountEur) * eurRate / fx.usd,
      p_portfolio_value_usd: portfolioEur * eurRate / fx.usd, p_source_symbol: selectedSource.symbol, p_source_quantity_deducted: sourceQty,
    });
    if (rpcErr && rpcErr.code !== 'PGRST202') { alert('Çekim başarısız: ' + rpcErr.message); return; }
    if (rpcErr) {
      const { error: u } = await supabase.from('holdings').update({ quantity: newQty }).eq('id', h.id); if (u) { alert('Kaynak güncellenemedi: ' + u.message); return; }
      const { error } = await supabase.from('salary_withdrawals').insert({ amount_usd: amountUsd, reservoir_after_usd: (remainingEur - amountEur) * eurRate / fx.usd, portfolio_value_usd: portfolioEur * eurRate / fx.usd, source_symbol: selectedSource.symbol, source_quantity_deducted: sourceQty, note: `€${fmt(amountEur)} maaş` });
      if (error) { await supabase.from('holdings').update({ quantity: h.quantity }).eq('id', h.id); alert('Çekim kaydedilemedi: ' + error.message); return; }
    }
    setConfirmWithdraw(false); await loadAll(); window.location.reload();
  }

  if (loadError) return <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-red-200 dark:border-red-900 p-6"><p className="text-sm font-semibold text-red-600">Maaş verisi yüklenemedi</p><p className="text-xs text-red-500 mt-1">{loadError}</p><button onClick={loadAll} className="mt-3 text-xs underline text-red-600">Tekrar dene</button></div>;
  if (loading) return <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-6"><p className="text-slate-400 text-sm">Cüzdan yükleniyor...</p></div>;

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-gray-800 rounded-2xl shadow-sm border-2 border-emerald-200 dark:border-emerald-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-emerald-200 dark:border-emerald-900 flex items-center justify-between">
        <div className="flex items-center gap-2"><Wallet className="text-emerald-600 dark:text-emerald-400" size={22} /><h3 className="text-lg font-bold text-gray-900 dark:text-white">Kâr Cüzdanı</h3></div>
        <span className="text-[11px] text-slate-500 dark:text-gray-400">euro cetveli</span>
      </div>

      <div className={`mx-5 mt-4 rounded-xl p-4 border ${salaryEur > 0 ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900' : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'}`}>
        <div className="flex items-center gap-2 mb-1"><Gauge size={16} className={salaryEur > 0 ? 'text-blue-600' : 'text-amber-600'} /><p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300">Bu Ayın Dinamik Maaşı</p></div>
        {salary ? (
          <>
            <p className={`text-3xl font-bold ${salaryEur > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-700 dark:text-amber-300'}`}>€{fmt(salaryEur)}<span className="text-sm font-normal text-slate-500 dark:text-gray-400">/ay</span></p>
            <div className="text-xs text-slate-600 dark:text-gray-300 mt-2 space-y-0.5">
              <p>{salary.monthLabel}: servet €{fmt(salary.startWealthEUR)} → €{fmt(salary.endWealthEUR)}, dış para hariç kâr <strong>{sgn(salary.profitEUR)}€{fmt(salary.profitEUR)}</strong></p>
              <p>− enflasyon payı (%2/yıl) €{fmt(salary.inflationEUR)} = reel <strong>{sgn(salary.realGainEUR)}€{fmt(salary.realGainEUR)}</strong>{salary.carryInEUR < 0 && <> · devreden açık <strong>−€{fmt(salary.carryInEUR)}</strong></>}</p>
              <p>→ çekilebilir €{fmt(salary.withdrawableEUR)} × 0,85 = <strong>€{fmt(salary.salaryEUR)}</strong>{salaryEur === 0 && ' — bu ay maaş yok, fark yastıktan'}</p>
            </div>
          </>
        ) : <p className="text-sm text-amber-700 dark:text-amber-300">Geçen aya ait kayıt bulunamadı.</p>}
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><p className="text-slate-500 dark:text-gray-400">Bu ay çekilen</p><p className="font-bold text-gray-900 dark:text-white">€{fmt(withdrawnThisMonthEur)}</p></div>
            <div><p className="text-slate-500 dark:text-gray-400">Kalan hak</p><p className="font-bold text-emerald-600 dark:text-emerald-400">€{fmt(remainingEur)}</p></div>
            <div><p className="text-slate-500 dark:text-gray-400">Portföy</p><p className="font-bold text-gray-900 dark:text-white">€{fmt(portfolioEur)}</p></div>
          </div>
          {mtd && (
            <div className="mt-3 p-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-xs text-slate-700 dark:text-gray-300">
              <span className="font-semibold">{mtd.monthLabel} şimdiye kadar ({mtd.asOf.slice(8)}. gün):</span> kâr {sgn(mtd.gainEUR)}€{fmt(mtd.gainEUR)} · enflasyon payı €{fmt(mtd.inflationEUR)} · reel {sgn(mtd.realGainEUR)}€{fmt(mtd.realGainEUR)}
              {mtd.carryInEUR < 0 && <> · devreden açık −€{fmt(mtd.carryInEUR)} → kalan açık €{fmt(Math.min(0, mtd.carryInEUR + mtd.realGainEUR))}</>}
              <br />→ <span className="font-semibold">gelecek ay maaş ön izlemesi: €{fmt(mtd.projectedSalaryEUR)}</span> (ay sonuna kadar değişir)
            </div>
          )}
          {accrual && (
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-3">
              {accrual.fromLabel}'dan beri {accrual.months} ay: kâr {sgn(accrual.nominalEUR)}€{fmt(accrual.nominalEUR)} − enflasyon €{fmt(accrual.inflationEUR)} = reel {sgn(accrual.realEUR)}€{fmt(accrual.realEUR)}
              {accrual.deficitEUR > 0 && <> · <span className="text-amber-700 dark:text-amber-300">açık −€{fmt(accrual.deficitEUR)}, yeni kâr önce bunu kapatır</span></>}
            </p>
          )}
          <div className="mt-3 p-2 rounded-lg bg-slate-50 dark:bg-gray-900/40 border border-slate-200 dark:border-gray-700 flex items-start gap-2">
            <AlertCircle size={14} className="text-slate-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-600 dark:text-gray-300">Kâr = euro servetin artışı (koyduğun/çektiğin para hariç). Kur hareketi kâr değildir. Zarar ay birikmişten düşer, ana paraya dokunulmaz. Sıfır ayda yastıktan geçin.</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900/50 rounded-xl p-4 border border-emerald-200 dark:border-emerald-900 flex flex-col">
          <p className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-2">💸 Maaş Çek</p>
          <div className="flex items-center gap-1 mb-2"><span className="text-lg font-bold">€</span>
            <input type="number" value={amountInput} placeholder={fmt(remainingEur)} onChange={(e) => setAmountInput(e.target.value)} className="w-full px-2 py-1 text-xl font-bold bg-slate-50 dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded" /></div>
          <p className="text-[10px] text-slate-500 dark:text-gray-400 mb-2">Boş bırakırsan kalan hakkın tamamı (€{fmt(remainingEur)}).</p>
          {canWithdraw && cashSources.length > 0 && (
            <div className="mb-2">
              <label className="text-[10px] text-slate-500 dark:text-gray-400 uppercase tracking-wide">Kaynak</label>
              <select value={sourceSymbol} onChange={(e) => setSourceSymbol(e.target.value)} className="w-full mt-0.5 px-2 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded">
                {cashSources.map((s) => <option key={s.symbol} value={s.symbol}>{s.ccyDisplay} — {s.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} (€{fmt(s.valueEur)})</option>)}
              </select>
              {selectedSource && <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5">Düşülecek: <strong>{sourceQty.toFixed(0)} {selectedSource.ccyDisplay}</strong></p>}
            </div>
          )}
          {confirmWithdraw ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-700 dark:text-gray-300"><strong>€{fmt(amountEur)}</strong> çekilecek → {selectedSource?.ccyDisplay} pozisyonundan <strong>{sourceQty.toFixed(0)}</strong> düşer.</p>
              <div className="flex gap-2">
                <button onClick={handleWithdraw} className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg">✓ Onayla</button>
                <button onClick={() => setConfirmWithdraw(false)} className="flex-1 py-2 bg-slate-200 dark:bg-gray-700 text-sm font-semibold rounded-lg">İptal</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmWithdraw(true)} disabled={!canWithdraw || !sourceSufficient}
              className={`mt-auto py-3 rounded-lg font-bold text-sm ${canWithdraw && sourceSufficient ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md' : 'bg-slate-200 dark:bg-gray-700 text-slate-400 cursor-not-allowed'}`}>
              {!canWithdraw ? 'Bu ay hak yok' : !sourceSufficient ? `Kaynak yetersiz (${selectedSource?.ccyDisplay})` : `💸 €${fmt(amountEur)} Çek`}
            </button>
          )}
        </div>
      </div>

      {withdrawals.length > 0 && (
        <div className="px-5 pb-5">
          <p className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-2">Son Çekimler</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {withdrawals.slice(0, 5).map((w) => (
              <div key={w.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-white/60 dark:bg-gray-900/30 border border-slate-200 dark:border-gray-700">
                <span className="text-slate-600 dark:text-gray-400 w-20">{new Date(w.withdrawn_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{w.note || `-$${Number(w.amount_usd).toFixed(0)}`}</span>
                {w.source_symbol && <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-gray-800">{Number(w.source_quantity_deducted).toFixed(0)} {w.source_symbol === 'EURO' ? 'EUR' : w.source_symbol}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
