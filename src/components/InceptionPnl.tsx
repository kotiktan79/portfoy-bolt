import { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { getInceptionPnl, type InceptionSummary } from '../services/inceptionPnlService';
import { fmtEUR0, fmtSignedEUR0 } from '../lib/chartTheme';

// KURULUŞTAN BUGÜNE (EURO): her pozisyonun alış günü kuruyla euro maliyeti vs bugünkü euro değeri.
// Kur şişmesi yok: €30.100 EUR nakit → kâr 0; USD nakit → sadece EUR/USD hareketi.
export function InceptionPnl() {
  const [d, setD] = useState<InceptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { getInceptionPnl().then(x => setD(x)).catch(e => setErr(e?.message || 'hesaplanamadı')).finally(() => setLoading(false)); }, []);
  if (err) return <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-red-200 dark:border-red-900 p-6"><p className="text-sm font-semibold text-red-600">Kuruluştan bugüne kâr hesaplanamadı</p><p className="text-xs text-red-500 mt-1">{err}</p></div>;
  if (loading) return <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-6 text-sm text-slate-400">Kuruluştan bugüne hesaplanıyor…</div>;
  if (!d) return null;
  const pos = d.totalGainEUR >= 0;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2"><Landmark className="text-brand-600 dark:text-brand-400" size={22} /><h3 className="text-lg font-bold text-gray-900 dark:text-white">Kuruluştan Bugüne (€)</h3></div>
        <span className="text-[11px] text-slate-500 dark:text-gray-400">alış günü kuruyla maliyet · {d.eurTryInception} → {d.asOf}</span>
      </div>
      <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div><p className="text-xs text-slate-500 dark:text-gray-400">Euro maliyet</p><p className="text-lg font-bold text-gray-900 dark:text-white">{fmtEUR0(d.totalCostEUR)}</p></div>
        <div><p className="text-xs text-slate-500 dark:text-gray-400">Bugünkü euro değer</p><p className="text-lg font-bold text-gray-900 dark:text-white">{fmtEUR0(d.totalValueEUR)}</p></div>
        <div><p className="text-xs text-slate-500 dark:text-gray-400">Toplam kâr (satışlar dahil)</p><p className={`text-lg font-bold ${pos ? 'text-green-600' : 'text-red-600'}`}>{fmtSignedEUR0(d.totalGainEUR)} <span className="text-sm">({d.totalGainPct >= 0 ? '+' : ''}{d.totalGainPct.toFixed(1)}%)</span></p></div>
        <div><p className="text-xs text-slate-500 dark:text-gray-400">≈ TL kârı (kur dahil, bilgi)</p><p className="text-lg font-bold text-slate-600 dark:text-gray-300">₺{Math.round(d.totalGainTRY).toLocaleString('tr-TR')}</p></div>
      </div>
      <div className="px-5 pb-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[['Kazandıranlar', d.rows.filter(r => r.gainEUR > 0).slice(0, 8), 'text-green-600'], ['Kaybettirenler', d.rows.filter(r => r.gainEUR < 0).slice(-8).reverse(), 'text-red-600']].map(([title, rows, cls]) => (
            <div key={title as string}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400 mb-2">{title as string}</p>
              <div className="space-y-1">
                {(rows as typeof d.rows).map(r => (
                  <div key={r.symbol} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-slate-50 dark:bg-gray-900/40">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{r.symbol} <span className="text-slate-400 font-normal">{r.currency}</span></span>
                    <span className={`font-bold ${cls as string}`}>{fmtSignedEUR0(r.gainEUR)} <span className="font-normal text-slate-400">({r.gainPct >= 0 ? '+' : ''}{r.gainPct.toFixed(0)}%)</span></span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-3">
          Satılmış pozisyonların gerçekleşen kârı {fmtSignedEUR0(d.realizedEUR)} dahil. Alış tarihi = sisteme giriş tarihi (22 Eki 2025 toplu giriş); gerçek alış daha eskiyse euro kârı biraz farklıdır. Nisan 2026 öncesi kurlar ECB referans kuru.
        </p>
      </div>
    </div>
  );
}
