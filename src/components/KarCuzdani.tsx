import { useEffect, useMemo, useState } from 'react';
import { Wallet, TrendingUp, AlertCircle, Settings, Check, X, Gauge } from 'lucide-react';
import { supabase, Holding } from '../lib/supabase';
import { getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';
import { getDynamicWithdrawal } from '../services/analyticsService';
import { DynamicWithdrawal } from '../lib/portfolioMetrics';

interface SalarySettings {
  id: number;
  baseline_usd: number;
  target_monthly_usd: number;
  baseline_set_at: string;
}

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

export default function KarCuzdani({ holdings }: Props) {
  const [settings, setSettings] = useState<SalarySettings | null>(null);
  const [withdrawals, setWithdrawals] = useState<SalaryWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTarget, setEditingTarget] = useState(false);
  const [newTarget, setNewTarget] = useState('2000');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [sourceSymbol, setSourceSymbol] = useState<string>('EURO');
  const [dynamic, setDynamic] = useState<DynamicWithdrawal | null>(null);
  // Net external deposits (TRY) made AFTER the baseline date — principal, not
  // profit, so excluded from the withdrawable reservoir.
  const [netDepositsSinceBaselineTry, setNetDepositsSinceBaselineTry] = useState(0);

  useEffect(() => {
    loadAll();
    getDynamicWithdrawal().then(setDynamic);
  }, []);

  async function loadAll() {
    setLoading(true);
    const [s, w] = await Promise.all([
      supabase.from('salary_settings').select('*').eq('id', 1).single(),
      supabase.from('salary_withdrawals').select('*').order('withdrawn_at', { ascending: false }).limit(20),
    ]);
    if (s.data) {
      setSettings(s.data);
      setNewTarget(String(s.data.target_monthly_usd));
    }
    if (w.data) setWithdrawals(w.data);

    // Deposits made since the baseline date are re-deposited principal, not
    // profit; compute the net (deposits − withdrawals) from cumulative snapshot
    // figures so they can be stripped from the reservoir.
    if (s.data?.baseline_set_at) {
      const [cur, base] = await Promise.all([
        supabase.from('portfolio_snapshots').select('total_deposits,total_withdrawals').order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('portfolio_snapshots').select('total_deposits,total_withdrawals').gte('snapshot_date', s.data.baseline_set_at).order('snapshot_date', { ascending: true }).limit(1).maybeSingle(),
      ]);
      if (cur.data && base.data) {
        const dep = (Number(cur.data.total_deposits) || 0) - (Number(base.data.total_deposits) || 0);
        const wd = (Number(cur.data.total_withdrawals) || 0) - (Number(base.data.total_withdrawals) || 0);
        setNetDepositsSinceBaselineTry(Math.max(0, dep - wd));
      }
    }
    setLoading(false);
  }

  const fxRates = useMemo(() => getFxRatesFromHoldings(holdings), [holdings]);

  const portfolioUsd = useMemo(() => {
    if (!holdings.length) return 0;
    const totalTry = holdings.reduce((sum, h) => sum + holdingValueTRY(h, fxRates), 0);
    return totalTry / fxRates.usd;
  }, [holdings, fxRates]);

  const totalWithdrawnUsd = withdrawals.reduce((sum, w) => sum + Number(w.amount_usd), 0);
  const baseline = Number(settings?.baseline_usd ?? 0);
  // Deposits since baseline are principal (exclude). Salary withdrawals already
  // reduce the source holding → they're reflected in portfolioUsd, so do NOT
  // subtract totalWithdrawnUsd again (that was a double-count). salary_withdrawals
  // stays purely as an audit log.
  const depositsSinceBaselineUsd = fxRates.usd > 0 ? netDepositsSinceBaselineTry / fxRates.usd : 0;
  const reservoirUsd = Math.max(0, portfolioUsd - baseline - depositsSinceBaselineUsd);
  const target = Number(settings?.target_monthly_usd ?? 2000);
  const monthsAvailable = target > 0 ? reservoirUsd / target : 0;
  const canWithdraw = reservoirUsd >= target;
  const portfolioAboveBaseline = portfolioUsd > baseline + depositsSinceBaselineUsd;

  // Likit kaynaklar (cash & cash equivalents)
  const cashSources = useMemo(() => {
    // One consistent path for EVERY currency holding: TRY value via holdingValueTRY,
    // then /usd. The old bespoke per-symbol logic only handled USD/EURO and
    // mis-valued anything else (e.g. USDC came out ~46x too small and got dropped
    // by the >=100 filter). current_price is TRY-per-unit, so units-per-USD = usd/price.
    const sources = holdings
      .filter(h => h.asset_type === 'currency' && h.quantity > 0 && h.current_price > 0)
      .map(h => ({
        symbol: h.symbol,
        quantity: h.quantity,
        valueUsd: fxRates.usd > 0 ? holdingValueTRY(h, fxRates) / fxRates.usd : 0,
        ccyDisplay: h.symbol === 'EURO' ? 'EUR' : h.symbol,
        unitsPerUsd: fxRates.usd > 0 ? fxRates.usd / h.current_price : 0,
      }))
      .filter(s => s.valueUsd >= 100)
      .sort((a, b) => b.valueUsd - a.valueUsd);
    return sources;
  }, [holdings, fxRates]);

  const selectedSource = cashSources.find(s => s.symbol === sourceSymbol) || cashSources[0];
  const targetSourceQty = selectedSource ? target * selectedSource.unitsPerUsd : 0;
  const sourceSufficient = selectedSource ? selectedSource.valueUsd >= target : false;

  async function handleWithdraw() {
    if (!canWithdraw || !settings || !selectedSource || !sourceSufficient) return;
    const newReservoir = reservoirUsd - target;

    // 1. Kaynak holding'in quantity'sini düşür
    const sourceHolding = holdings.find(h => h.symbol === selectedSource.symbol && h.asset_type === 'currency');
    if (!sourceHolding) return;
    const newQty = sourceHolding.quantity - targetSourceQty;
    const { error: updErr } = await supabase
      .from('holdings')
      .update({ quantity: newQty })
      .eq('id', sourceHolding.id);
    if (updErr) {
      alert('Kaynak holding güncellenemedi: ' + updErr.message);
      return;
    }

    // 2. Çekim kaydını yaz
    const { error } = await supabase.from('salary_withdrawals').insert({
      amount_usd: target,
      reservoir_after_usd: newReservoir,
      portfolio_value_usd: portfolioUsd,
      source_symbol: selectedSource.symbol,
      source_quantity_deducted: targetSourceQty,
    });
    if (!error) {
      setConfirmWithdraw(false);
      await loadAll();
      // Sayfayı yenile ki holdings de tazelensin
      window.location.reload();
    }
  }

  async function handleSaveTarget() {
    const t = parseFloat(newTarget);
    if (isNaN(t) || t <= 0) return;
    await supabase.from('salary_settings').update({
      target_monthly_usd: t,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    setEditingTarget(false);
    await loadAll();
  }

  async function handleResetBaseline() {
    if (!confirm(`Anaparayı şu anki değere ($${portfolioUsd.toFixed(0)}) sabitle? Cüzdan sıfırlanır.`)) return;
    await supabase.from('salary_settings').update({
      baseline_usd: portfolioUsd,
      baseline_set_at: new Date().toISOString(),
    }).eq('id', 1);
    // Geçmiş çekimleri temizleme — kullanıcıya sor
    if (confirm('Çekim geçmişini de sıfırla?')) {
      await supabase.from('salary_withdrawals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    await loadAll();
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-6">
        <p className="text-slate-400 text-sm">Cüzdan yükleniyor...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-6">
        <p className="text-red-500 text-sm">Maaş ayarları yüklenemedi</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-gray-800 rounded-2xl shadow-sm border-2 border-emerald-200 dark:border-emerald-900 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-emerald-200 dark:border-emerald-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="text-emerald-600 dark:text-emerald-400" size={22} />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Kâr Cüzdanı</h3>
        </div>
        <button
          onClick={handleResetBaseline}
          className="text-[11px] text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 flex items-center gap-1"
          title="Anaparayı şu anki portföy değerine sabitle"
        >
          <Settings size={12} /> Anapara: ${baseline.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </button>
      </div>

      {/* Dinamik güvenli maaş — USD bazlı reel büyümeye göre */}
      {dynamic && (
        <div className={`mx-5 mt-4 rounded-xl p-4 border ${
          dynamic.status === 'positive'
            ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900'
            : dynamic.status === 'low'
            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
            : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <Gauge size={16} className={
              dynamic.status === 'positive' ? 'text-blue-600 dark:text-blue-400'
              : dynamic.status === 'low' ? 'text-amber-600 dark:text-amber-400'
              : 'text-red-600 dark:text-red-400'
            } />
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300">
              Bu Ay Güvenli Max (dinamik)
            </p>
          </div>
          {dynamic.status === 'negative' ? (
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              Reel büyüme negatif (%{dynamic.annualGrowthPct.toFixed(1)}/yıl). Anaparaya dokunma — sadece pasif gelir + trim.
            </p>
          ) : (
            <>
              <p className={`text-3xl font-bold ${dynamic.status === 'positive' ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
                ${dynamic.safeMonthlyUSD.toFixed(0)}<span className="text-sm font-normal text-slate-500 dark:text-gray-400">/ay</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                Son {Math.round(dynamic.periodDays)} günde reel büyüme <strong>%{dynamic.annualGrowthPct.toFixed(1)}/yıl</strong> (USD bazlı, yeni para hariç). Büyümenin %85'i güvenli çekim.
              </p>
            </>
          )}
        </div>
      )}

      {/* Ana içerik */}
      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Cüzdan bakiyesi */}
        <div className="md:col-span-2">
          <p className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            💰 Birikmiş Cüzdan
          </p>
          <p className={`text-4xl font-bold ${reservoirUsd > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-gray-500'}`}>
            ${reservoirUsd.toFixed(0)}
          </p>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
            Anapara üzerine biriken çekilebilir kâr
          </p>

          {/* Portföy durumu */}
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-500 dark:text-gray-400">Portföy</p>
              <p className="font-bold text-gray-900 dark:text-white">${portfolioUsd.toFixed(0)}</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-gray-400">Toplam Çekilen</p>
              <p className="font-bold text-gray-900 dark:text-white">${totalWithdrawnUsd.toFixed(0)}</p>
            </div>
          </div>

          {/* Açıklama */}
          {!portfolioAboveBaseline && (
            <div className="mt-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                Portföy henüz anaparanın üzerine çıkmadı. Yeni kâr birikene kadar maaş yok.
              </p>
            </div>
          )}
        </div>

        {/* Maaş çekme paneli */}
        <div className="bg-white dark:bg-gray-900/50 rounded-xl p-4 border border-emerald-200 dark:border-emerald-900 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wide">🎯 Hedef Maaş</p>
            {!editingTarget && (
              <button
                onClick={() => setEditingTarget(true)}
                className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
              >
                Değiştir
              </button>
            )}
          </div>

          {editingTarget ? (
            <div className="flex items-center gap-1 mb-3">
              <span className="text-lg font-bold">$</span>
              <input
                type="number"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                className="w-full px-2 py-1 text-2xl font-bold bg-slate-50 dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded"
                autoFocus
              />
              <button
                onClick={handleSaveTarget}
                className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded"
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => { setEditingTarget(false); setNewTarget(String(target)); }}
                className="p-1.5 bg-slate-300 dark:bg-gray-600 hover:bg-slate-400 dark:hover:bg-gray-500 text-white rounded"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
              ${target.toFixed(0)}<span className="text-sm font-normal text-slate-500 dark:text-gray-400">/ay</span>
            </p>
          )}

          <p className="text-xs text-slate-500 dark:text-gray-400 mb-3">
            <TrendingUp size={11} className="inline" /> Cüzdanda <strong>{monthsAvailable.toFixed(1)} ay</strong> daha hak var
          </p>

          {/* Kaynak seçici */}
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
                    {s.ccyDisplay} cash — {s.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} {s.ccyDisplay} (${s.valueUsd.toFixed(0)})
                  </option>
                ))}
              </select>
              {selectedSource && (
                <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5">
                  Düşülecek: <strong>{targetSourceQty.toFixed(0)} {selectedSource.ccyDisplay}</strong>
                </p>
              )}
            </div>
          )}

          {confirmWithdraw ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-700 dark:text-gray-300">
                <strong>{targetSourceQty.toFixed(0)} {selectedSource?.ccyDisplay}</strong> ({selectedSource?.symbol} cash) düşülecek.
                <br/>Cüzdan: ${reservoirUsd.toFixed(0)} → ${(reservoirUsd - target).toFixed(0)}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleWithdraw}
                  className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg"
                >
                  ✓ Onayla
                </button>
                <button
                  onClick={() => setConfirmWithdraw(false)}
                  className="flex-1 py-2 bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-sm font-semibold rounded-lg"
                >
                  İptal
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmWithdraw(true)}
              disabled={!canWithdraw || !sourceSufficient}
              className={`mt-auto py-3 rounded-lg font-bold text-sm transition-colors ${
                canWithdraw && sourceSufficient
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-200 dark:bg-gray-700 text-slate-400 dark:text-gray-500 cursor-not-allowed'
              }`}
            >
              {!canWithdraw ? 'Cüzdan Yetersiz' : !sourceSufficient ? `Kaynak Yetersiz (${selectedSource?.ccyDisplay})` : `💸 ${target.toFixed(0)}$ Maaşı Çek`}
            </button>
          )}
        </div>
      </div>

      {/* Çekim geçmişi */}
      {withdrawals.length > 0 && (
        <div className="px-5 pb-5">
          <p className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-2">Son Çekimler</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {withdrawals.slice(0, 5).map((w) => {
              const sourceLabel = w.source_symbol === 'EURO' ? 'EUR' : w.source_symbol;
              return (
                <div key={w.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-white/60 dark:bg-gray-900/30 border border-slate-200 dark:border-gray-700">
                  <span className="text-slate-600 dark:text-gray-400 w-20">
                    {new Date(w.withdrawn_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    -${Number(w.amount_usd).toFixed(0)}
                  </span>
                  {w.source_symbol && (
                    <span className="text-[10px] text-slate-500 dark:text-gray-500 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-gray-800">
                      {Number(w.source_quantity_deducted).toFixed(0)} {sourceLabel}
                    </span>
                  )}
                  <span className="text-slate-500 dark:text-gray-500">
                    Kalan: ${Number(w.reservoir_after_usd).toFixed(0)}
                  </span>
                </div>
              );
            })}
          </div>
          {withdrawals.length > 5 && (
            <p className="text-[10px] text-slate-400 mt-1 text-center">+{withdrawals.length - 5} eski çekim</p>
          )}
        </div>
      )}
    </div>
  );
}
