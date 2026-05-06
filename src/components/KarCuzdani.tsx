import { useEffect, useMemo, useState } from 'react';
import { Wallet, TrendingUp, AlertCircle, Settings, Check, X } from 'lucide-react';
import { supabase, Holding } from '../lib/supabase';
import { getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';

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

  useEffect(() => {
    loadAll();
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
    setLoading(false);
  }

  const fxRates = useMemo(() => getFxRatesFromHoldings(holdings), [holdings]);

  const portfolioUsd = useMemo(() => {
    if (!holdings.length) return 0;
    const totalTry = holdings.reduce((sum, h) => sum + holdingValueTRY(h, fxRates), 0);
    return totalTry / fxRates.usd;
  }, [holdings, fxRates]);

  // Cüzdan hesabı:
  // available = max(0, current_portfolio - baseline - total_withdrawn)
  const totalWithdrawnUsd = withdrawals.reduce((sum, w) => sum + Number(w.amount_usd), 0);
  const baseline = Number(settings?.baseline_usd ?? 0);
  const reservoirUsd = Math.max(0, portfolioUsd - baseline - totalWithdrawnUsd);
  const target = Number(settings?.target_monthly_usd ?? 2000);
  const monthsAvailable = target > 0 ? reservoirUsd / target : 0;
  const canWithdraw = reservoirUsd >= target;
  const portfolioAboveBaseline = portfolioUsd > baseline + totalWithdrawnUsd;

  async function handleWithdraw() {
    if (!canWithdraw || !settings) return;
    const newReservoir = reservoirUsd - target;
    const { error } = await supabase.from('salary_withdrawals').insert({
      amount_usd: target,
      reservoir_after_usd: newReservoir,
      portfolio_value_usd: portfolioUsd,
    });
    if (!error) {
      setConfirmWithdraw(false);
      await loadAll();
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

          {confirmWithdraw ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-700 dark:text-gray-300">
                ${target.toFixed(0)} çekildiğinde cüzdan ${(reservoirUsd - target).toFixed(0)} olacak. Emin misin?
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
              disabled={!canWithdraw}
              className={`mt-auto py-3 rounded-lg font-bold text-sm transition-colors ${
                canWithdraw
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-200 dark:bg-gray-700 text-slate-400 dark:text-gray-500 cursor-not-allowed'
              }`}
            >
              {canWithdraw ? `💸 ${target.toFixed(0)}$ Maaşı Çek` : 'Cüzdan Yetersiz'}
            </button>
          )}
        </div>
      </div>

      {/* Çekim geçmişi */}
      {withdrawals.length > 0 && (
        <div className="px-5 pb-5">
          <p className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-2">Son Çekimler</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {withdrawals.slice(0, 5).map((w) => (
              <div key={w.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-white/60 dark:bg-gray-900/30 border border-slate-200 dark:border-gray-700">
                <span className="text-slate-600 dark:text-gray-400">
                  {new Date(w.withdrawn_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  -${Number(w.amount_usd).toFixed(0)}
                </span>
                <span className="text-slate-500 dark:text-gray-500">
                  Kalan: ${Number(w.reservoir_after_usd).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
          {withdrawals.length > 5 && (
            <p className="text-[10px] text-slate-400 mt-1 text-center">+{withdrawals.length - 5} eski çekim</p>
          )}
        </div>
      )}
    </div>
  );
}
