import { useEffect, useMemo, useState } from 'react';
import { Wallet, Gauge, AlertCircle } from 'lucide-react';
import { supabase, Holding } from '../lib/supabase';
import { getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';
import { getDynamicSalary, getSalaryAccrual, DynamicSalary, SalaryAccrual } from '../services/salaryService';

// KÂR CÜZDANI — TEK ÖLÇÜ (2026-09-19, kullanıcı kararı, KESİN)
//   Bu ayın maaşı = GEÇEN AYIN KÂRI × 0,85  (salaryService, "Kar/Zarar Geçmişi → Aylık" ile aynı)
// Eski rezervuar/anapara/%4 tavan/4 yıla yayma mantığı KALDIRILDI — kullanıcıya
// uygulamanın diğer ekranlarından farklı rakamlar gösteriyordu.
// Çekim: bu ayın maaşından henüz çekilmemiş kısım, seçilen nakit pozisyonundan düşülür.

interface SalaryWithdrawal {
  id: string;
  withdrawn_at: string;
  amount_usd: number;
  reservoir_after_usd: number;
  portfolio_value_usd: number;
  note: string | null;
  source_symbol: string | null;
  source_quantity_deducted: number | null;
}

interface Props {
  holdings: Holding[];
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function KarCuzdani({ holdings }: Props) {
  const [salary, setSalary] = useState<DynamicSalary | null>(null);
  const [accrual, setAccrual] = useState<SalaryAccrual | null>(null);
  const [withdrawals, setWithdrawals] = useState<SalaryWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [sourceSymbol, setSourceSymbol] = useState<string>('EURO');
  const [amountInput, setAmountInput] = useState<string>('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [s, w, a] = await Promise.all([
      getDynamicSalary(),
      supabase.from('salary_withdrawals').select('*').order('withdrawn_at', { ascending: false }).limit(20),
      getSalaryAccrual(),
    ]);
    setSalary(s);
    setAccrual(a);
    if (w.data) setWithdrawals(w.data);
    setLoading(false);
  }

  const fxRates = useMemo(() => getFxRatesFromHoldings(holdings), [holdings]);
  const portfolioUsd = useMemo(() => {
    if (!holdings.length || !(fxRates.usd > 0)) return 0;
    return holdings.reduce((sum, h) => sum + holdingValueTRY(h, fxRates), 0) / fxRates.usd;
  }, [holdings, fxRates]);

  // Bu ay çekilenler (takvim ayı)
  const monthKey = new Date().toISOString().slice(0, 7);
  const withdrawnThisMonthUsd = withdrawals
    .filter(w => String(w.withdrawn_at).slice(0, 7) === monthKey)
    .reduce((sum, w) => sum + Number(w.amount_usd), 0);
  const salaryUsd = salary?.salaryUSD ?? 0;
  // Çekilebilir = birikmiş hak (Mart'tan beri tüm ayların maaşları − tüm çekimler).
  // Bu ayın maaşı bilgi; hak birikir, çekmediğin ay kaybolmaz.
  const remainingUsd = accrual ? accrual.availableUSD : Math.max(0, salaryUsd - withdrawnThisMonthUsd);
  const amount = Math.min(remainingUsd, Math.max(0, parseFloat(amountInput) || remainingUsd));

  // Likit kaynaklar
  const cashSources = useMemo(() => holdings
    .filter(h => h.asset_type === 'currency' && h.quantity > 0 && h.current_price > 0)
    .map(h => ({
      symbol: h.symbol,
      quantity: h.quantity,
      valueUsd: fxRates.usd > 0 ? holdingValueTRY(h, fxRates) / fxRates.usd : 0,
      ccyDisplay: h.symbol === 'EURO' ? 'EUR' : h.symbol,
      unitsPerUsd: fxRates.usd > 0 ? fxRates.usd / h.current_price : 0,
    }))
    .filter(s => s.valueUsd >= 100)
    .sort((a, b) => b.valueUsd - a.valueUsd), [holdings, fxRates]);

  const selectedSource = cashSources.find(s => s.symbol === sourceSymbol) || cashSources[0];
  const sourceQty = selectedSource ? amount * selectedSource.unitsPerUsd : 0;
  const sourceSufficient = selectedSource ? selectedSource.valueUsd >= amount : false;
  const canWithdraw = remainingUsd > 0 && amount > 0;

  async function handleWithdraw() {
    if (!canWithdraw || !selectedSource || !sourceSufficient) return;
    const sourceHolding = holdings.find(h => h.symbol === selectedSource.symbol && h.asset_type === 'currency');
    if (!sourceHolding) return;
    const newQty = Math.max(0, sourceHolding.quantity - sourceQty);
    const afterUsd = remainingUsd - amount; // bu aydan kalan hak

    // Tercih: tek transaction (withdraw_salary RPC); PGRST202 ise iki-adımlı telafi
    const { error: rpcErr } = await supabase.rpc('withdraw_salary', {
      p_holding_id: sourceHolding.id,
      p_new_quantity: newQty,
      p_amount_usd: amount,
      p_reservoir_after_usd: afterUsd,
      p_portfolio_value_usd: portfolioUsd,
      p_source_symbol: selectedSource.symbol,
      p_source_quantity_deducted: sourceQty,
    });
    if (rpcErr && rpcErr.code !== 'PGRST202') { alert('Çekim başarısız: ' + rpcErr.message); return; }
    if (rpcErr) {
      const { error: updErr } = await supabase.from('holdings').update({ quantity: newQty }).eq('id', sourceHolding.id);
      if (updErr) { alert('Kaynak holding güncellenemedi: ' + updErr.message); return; }
      const { error } = await supabase.from('salary_withdrawals').insert({
        amount_usd: amount, reservoir_after_usd: afterUsd, portfolio_value_usd: portfolioUsd,
        source_symbol: selectedSource.symbol, source_quantity_deducted: sourceQty,
      });
      if (error) {
        const { error: rbErr } = await supabase.from('holdings').update({ quantity: sourceHolding.quantity }).eq('id', sourceHolding.id);
        alert('Çekim kaydedilemedi: ' + error.message + (rbErr ? ` — DİKKAT: ${selectedSource.symbol} miktarı geri alınamadı, elle düzeltin: ${sourceHolding.quantity}` : ' (geri alındı)'));
        return;
      }
    }
    setConfirmWithdraw(false);
    await loadAll();
    window.location.reload();
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-6">
        <p className="text-slate-400 text-sm">Cüzdan yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-gray-800 rounded-2xl shadow-sm border-2 border-emerald-200 dark:border-emerald-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-emerald-200 dark:border-emerald-900 flex items-center gap-2">
        <Wallet className="text-emerald-600 dark:text-emerald-400" size={22} />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Kâr Cüzdanı</h3>
      </div>

      {/* Bu ayın maaşı — tek ölçü */}
      <div className={`mx-5 mt-4 rounded-xl p-4 border ${salaryUsd > 0
        ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900'
        : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'}`}>
        <div className="flex items-center gap-2 mb-1">
          <Gauge size={16} className={salaryUsd > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'} />
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300">Bu Ayın Dinamik Maaşı</p>
        </div>
        {salary ? (
          <>
            <p className={`text-3xl font-bold ${salaryUsd > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-700 dark:text-amber-300'}`}>
              ${fmt(salaryUsd)}<span className="text-sm font-normal text-slate-500 dark:text-gray-400">/ay</span>
              <span className="text-sm font-normal text-slate-500 dark:text-gray-400 ml-2">≈ {fmt(salary.salaryTRY)} TL</span>
            </p>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
              {salary.monthLabel} kârı <strong>{salary.profitTRY >= 0 ? '+' : ''}{fmt(salary.profitTRY)} TL</strong> (≈ ${fmt(salary.profitUSD)}) × 0,85.
              {salary.realizedTRY !== 0 && ` Satış kârı ${fmt(salary.realizedTRY)} TL dahil.`}
              {salaryUsd === 0 && ' Kâr yok → bu ay maaş yok; fark yastıktan.'}
            </p>
          </>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-300">Geçen aya ait kayıt bulunamadı.</p>
        )}
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <p className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">💰 Birikmiş Çekilmemiş Hak</p>
          <p className={`text-4xl font-bold ${remainingUsd > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-gray-500'}`}>
            ${fmt(remainingUsd)}
          </p>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
            {accrual
              ? `${accrual.fromLabel}'tan beri ${accrual.months} ayın maaşları $${fmt(accrual.earnedUSD)} − çekilen $${fmt(accrual.withdrawnUSD)}`
              : 'Geçmiş aylar hesaplanıyor…'}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-slate-500 dark:text-gray-400">Bu ay çekilen</p>
              <p className="font-bold text-gray-900 dark:text-white">${fmt(withdrawnThisMonthUsd)}</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-gray-400">Toplam çekilen</p>
              <p className="font-bold text-gray-900 dark:text-white">${fmt(accrual?.withdrawnUSD ?? 0)}</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-gray-400">Portföy</p>
              <p className="font-bold text-gray-900 dark:text-white">${fmt(portfolioUsd)}</p>
            </div>
          </div>
          <div className="mt-3 p-2 rounded-lg bg-slate-50 dark:bg-gray-900/40 border border-slate-200 dark:border-gray-700 flex items-start gap-2">
            <AlertCircle size={14} className="text-slate-500 dark:text-gray-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-600 dark:text-gray-300">
              Kural: her ay kâr varsa %85'i o ayın maaşı, kâr yoksa 0. Çekmediğin hak birikir, kaybolmaz; sıfır ayda birikmişten çek.
            </p>
          </div>
        </div>

        {/* Çekim paneli */}
        <div className="bg-white dark:bg-gray-900/50 rounded-xl p-4 border border-emerald-200 dark:border-emerald-900 flex flex-col">
          <p className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-2">💸 Maaş Çek</p>
          <div className="flex items-center gap-1 mb-2">
            <span className="text-lg font-bold">$</span>
            <input
              type="number"
              value={amountInput}
              placeholder={fmt(remainingUsd)}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full px-2 py-1 text-xl font-bold bg-slate-50 dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded"
            />
          </div>
          <p className="text-[10px] text-slate-500 dark:text-gray-400 mb-2">Boş bırakırsan birikmiş hakkın tamamı (${fmt(remainingUsd)}).</p>

          {canWithdraw && cashSources.length > 0 && (
            <div className="mb-2">
              <label className="text-[10px] text-slate-500 dark:text-gray-400 uppercase tracking-wide">Kaynak</label>
              <select
                value={sourceSymbol}
                onChange={(e) => setSourceSymbol(e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded"
              >
                {cashSources.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.ccyDisplay} — {s.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} (${fmt(s.valueUsd)})
                  </option>
                ))}
              </select>
              {selectedSource && (
                <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5">
                  Düşülecek: <strong>{sourceQty.toFixed(0)} {selectedSource.ccyDisplay}</strong>
                </p>
              )}
            </div>
          )}

          {confirmWithdraw ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-700 dark:text-gray-300">
                <strong>${fmt(amount)}</strong> çekilecek → {selectedSource?.ccyDisplay} pozisyonundan <strong>{sourceQty.toFixed(0)}</strong> düşer. Kalan hak: ${fmt(remainingUsd - amount)}
              </p>
              <div className="flex gap-2">
                <button onClick={handleWithdraw} className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg">✓ Onayla</button>
                <button onClick={() => setConfirmWithdraw(false)} className="flex-1 py-2 bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-sm font-semibold rounded-lg">İptal</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmWithdraw(true)}
              disabled={!canWithdraw || !sourceSufficient}
              className={`mt-auto py-3 rounded-lg font-bold text-sm transition-colors ${canWithdraw && sourceSufficient
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md'
                : 'bg-slate-200 dark:bg-gray-700 text-slate-400 dark:text-gray-500 cursor-not-allowed'}`}
            >
              {!canWithdraw ? 'Birikmiş hak yok' : !sourceSufficient ? `Kaynak yetersiz (${selectedSource?.ccyDisplay})` : `💸 $${fmt(amount)} Çek`}
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
                <span className="text-slate-600 dark:text-gray-400 w-20">
                  {new Date(w.withdrawn_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">-${Number(w.amount_usd).toFixed(0)}</span>
                {w.source_symbol && (
                  <span className="text-[10px] text-slate-500 dark:text-gray-500 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-gray-800">
                    {Number(w.source_quantity_deducted).toFixed(0)} {w.source_symbol === 'EURO' ? 'EUR' : w.source_symbol}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
