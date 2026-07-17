import { useMemo, useState } from 'react';
import { Zap, SlidersHorizontal } from 'lucide-react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { calculateScenario, PRESET_SCENARIOS } from '../services/scenarioService';
import { assetName, fmtTRY0, fmtSignedTRY0 } from '../lib/chartTheme';

// Preset şoklar scenarioService'te varlık sınıfı bazında sabit yüzdeler —
// deterministik ve şeffaf: ne varsayıldığı tabloda aynen görünür.
const PRESET_LABELS: Record<string, { label: string; desc: string }> = {
  crisis: { label: '🔻 Kriz', desc: '2008 tipi şok: hisse −30, kripto −50, altın +20' },
  recession: { label: '📉 Resesyon', desc: 'Yavaşlama: hisse −20, kripto −40, eurobond +20' },
  stagflation: { label: '🐌 Stagflasyon', desc: 'Durgunluk+enflasyon: emtia +25, hisse −10' },
  inflation: { label: '🔥 Enflasyon şoku', desc: 'TL reel kayıp: emtia +40, döviz −25 (reel)' },
  boom: { label: '🚀 Boğa', desc: 'Risk iştahı: kripto +100, hisse +50' },
};

const CUSTOM_KEY = 'custom';

export default function StressTestCard() {
  const { holdings } = usePortfolio();
  const [selected, setSelected] = useState<string>('crisis');
  const [customShocks, setCustomShocks] = useState<Record<string, number>>({});

  const typesInPortfolio = useMemo(
    () => [...new Set(holdings.map((h) => h.asset_type))].filter((t) => t !== 'cash'),
    [holdings]
  );

  const activeShocks = useMemo<Record<string, number>>(() => {
    if (selected === CUSTOM_KEY) return customShocks;
    return PRESET_SCENARIOS[selected] || {};
  }, [selected, customShocks]);

  const result = useMemo(
    () => (holdings.length > 0 ? calculateScenario(holdings, activeShocks) : null),
    [holdings, activeShocks]
  );

  // Tüm preset'lerin net etkisi — tek bakışta karşılaştırma
  const presetSummary = useMemo(
    () =>
      holdings.length === 0
        ? []
        : Object.keys(PRESET_LABELS).map((key) => {
            const r = calculateScenario(holdings, PRESET_SCENARIOS[key]);
            return { key, pct: r.pnl_percent, change: r.pnl_change };
          }),
    [holdings]
  );

  // Varlık tipi bazında toplulaştırılmış etki
  const byType = useMemo(() => {
    if (!result) return [];
    const agg = new Map<string, { current: number; change: number }>();
    for (const a of result.asset_impacts) {
      const e = agg.get(a.asset_type) || { current: 0, change: 0 };
      e.current += a.current_value;
      e.change += a.change;
      agg.set(a.asset_type, e);
    }
    return [...agg.entries()]
      .map(([type, v]) => ({ type, ...v, pct: v.current > 0 ? (v.change / v.current) * 100 : 0 }))
      .sort((a, b) => a.change - b.change);
  }, [result]);

  const maxAbsChange = Math.max(1, ...byType.map((t) => Math.abs(t.change)));

  if (holdings.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-gray-700 flex items-center gap-2">
        <Zap className="text-brand-600 dark:text-brand-400" size={22} />
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Stres Testi</h3>
          <p className="text-xs text-slate-500 dark:text-gray-400">
            Varlık sınıfı bazında sabit şok senaryolarının portföye etkisi
          </p>
        </div>
      </div>

      {/* Senaryo seçici + karşılaştırma */}
      <div className="p-5 border-b border-slate-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-2">
          {presetSummary.map((p) => (
            <button
              key={p.key}
              onClick={() => setSelected(p.key)}
              title={PRESET_LABELS[p.key].desc}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
                selected === p.key
                  ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                  : 'bg-slate-50 dark:bg-gray-900/60 text-slate-700 dark:text-gray-200 border-slate-200 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-700'
              }`}
            >
              {PRESET_LABELS[p.key].label}
              <span className={`ml-1.5 text-xs font-bold ${
                selected === p.key
                  ? 'text-white/90'
                  : p.pct >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
              }`}>
                {p.pct >= 0 ? '+' : ''}{p.pct.toFixed(1)}%
              </span>
            </button>
          ))}
          <button
            onClick={() => setSelected(CUSTOM_KEY)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border flex items-center gap-1 ${
              selected === CUSTOM_KEY
                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                : 'bg-slate-50 dark:bg-gray-900/60 text-slate-700 dark:text-gray-200 border-slate-200 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-700'
            }`}
          >
            <SlidersHorizontal size={13} /> Özel
          </button>
        </div>

        {selected === CUSTOM_KEY && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
            {typesInPortfolio.map((t) => (
              <label key={t} className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">
                  {assetName(t)}
                </span>
                <div className="mt-1 flex items-center gap-1 bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-600 rounded-lg px-2 py-1.5">
                  <input
                    type="number"
                    step="5"
                    min="-99"
                    max="300"
                    value={customShocks[t] ?? 0}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setCustomShocks((prev) => ({ ...prev, [t]: Number.isFinite(v) ? v : 0 }));
                    }}
                    className="w-full bg-transparent text-sm font-bold text-gray-900 dark:text-white outline-none"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {result && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Sonuç özeti */}
          <div>
            <div className={`rounded-xl p-4 border ${
              result.pnl_change >= 0
                ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900'
                : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900'
            }`}>
              <p className="text-[11px] uppercase tracking-wide text-slate-600 dark:text-gray-300 mb-1">
                {selected === CUSTOM_KEY ? 'Özel senaryo' : PRESET_LABELS[selected]?.label} — net etki
              </p>
              <p className={`text-3xl font-bold ${
                result.pnl_change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {fmtSignedTRY0(result.pnl_change)}
                <span className="text-base font-semibold ml-2">
                  ({result.pnl_percent >= 0 ? '+' : ''}{result.pnl_percent.toFixed(1)}%)
                </span>
              </p>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                {fmtTRY0(result.current_value)} → {fmtTRY0(result.projected_value)}
              </p>
            </div>
            {selected !== CUSTOM_KEY && PRESET_LABELS[selected] && (
              <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-2">
                Varsayım: {PRESET_LABELS[selected].desc}
              </p>
            )}
          </div>

          {/* Tip bazında etki */}
          <div className="space-y-2">
            {byType.map((t) => (
              <div key={t.type} className="flex items-center gap-2 text-sm">
                <span className="w-28 shrink-0 font-semibold text-slate-700 dark:text-gray-200 truncate">
                  {assetName(t.type)}
                </span>
                <div className="flex-1 h-4 relative">
                  <div
                    className={`absolute inset-y-0 rounded ${t.change >= 0 ? 'bg-green-500/70 left-1/2' : 'bg-red-500/70 right-1/2'}`}
                    style={{ width: `${(Math.abs(t.change) / maxAbsChange) * 50}%` }}
                  />
                  <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300 dark:bg-gray-600" />
                </div>
                <span className={`w-28 shrink-0 text-right font-bold text-xs ${
                  t.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {fmtSignedTRY0(t.change)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
