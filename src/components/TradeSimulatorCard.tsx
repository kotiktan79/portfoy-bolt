import { useMemo, useState } from 'react';
import { FlaskConical, Plus, Trash2, ArrowRight, AlertTriangle } from 'lucide-react';
import { Holding, AssetType } from '../lib/supabase';
import { applyTrades, ProposedTrade } from '../services/tradeSimulatorService';
import { getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';
import { assetColor, assetName, fmtTRY0, fmtSignedTRY0 } from '../lib/chartTheme';
import { useDarkMode } from '../hooks/useDarkMode';

// "Şunu satıp şuna girsem dağılım ne olur?" — hiçbir şey kaydetmez,
// tamamen istemci tarafı simülasyon (tradeSimulatorService.applyTrades).

const ASSET_TYPE_OPTIONS: AssetType[] = ['stock', 'crypto', 'fund', 'commodity', 'eurobond', 'currency'];

interface TypeSlice {
  type: string;
  value: number;
  pct: number;
}

function allocationByType(holdings: Holding[]): { slices: TypeSlice[]; total: number } {
  const rates = getFxRatesFromHoldings(holdings);
  const agg = new Map<string, number>();
  let total = 0;
  for (const h of holdings) {
    const v = holdingValueTRY(h, rates);
    total += v;
    agg.set(h.asset_type, (agg.get(h.asset_type) || 0) + v);
  }
  const slices = [...agg.entries()]
    .map(([type, value]) => ({ type, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  return { slices, total };
}

let tradeSeq = 0;

export default function TradeSimulatorCard({ holdings }: { holdings: Holding[] }) {
  const { isDark } = useDarkMode();
  const [trades, setTrades] = useState<ProposedTrade[]>([]);

  const symbols = useMemo(
    () => [...new Set(holdings.filter(h => h.quantity > 0).map(h => h.symbol))].sort(),
    [holdings]
  );

  const result = useMemo(
    () => (trades.length > 0 ? applyTrades(holdings, trades) : null),
    [holdings, trades]
  );

  const before = useMemo(() => allocationByType(holdings), [holdings]);
  const after = useMemo(
    () => (result ? allocationByType(result.afterHoldings) : null),
    [result]
  );

  function addTrade(action: 'sell' | 'buy') {
    tradeSeq += 1;
    setTrades(t => [
      ...t,
      {
        id: `t${tradeSeq}`,
        action,
        symbol: action === 'sell' ? (symbols[0] || '') : '',
        assetType: 'stock',
        amountTry: 10000,
      },
    ]);
  }

  function updateTrade(id: string, patch: Partial<ProposedTrade>) {
    setTrades(t => t.map(tr => (tr.id === id ? { ...tr, ...patch } : tr)));
  }

  function removeTrade(id: string) {
    setTrades(t => t.filter(tr => tr.id !== id));
  }

  if (holdings.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="text-brand-600 dark:text-brand-400" size={22} />
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Ne Olurdu? — İşlem Simülatörü</h3>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              Varsayımsal alım/satımların dağılıma etkisi — hiçbir şey kaydedilmez
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => addTrade('sell')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors"
          >
            <Plus size={14} /> Satış
          </button>
          <button
            onClick={() => addTrade('buy')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors"
          >
            <Plus size={14} /> Alım
          </button>
        </div>
      </div>

      {/* İşlem satırları */}
      {trades.length === 0 ? (
        <p className="p-5 text-sm text-slate-400 dark:text-gray-500 italic">
          "+ Satış" veya "+ Alım" ile varsayımsal işlem ekle — dağılımın nasıl değişeceğini anında gör.
        </p>
      ) : (
        <div className="p-5 space-y-2 border-b border-slate-200 dark:border-gray-700">
          {trades.map(tr => (
            <div key={tr.id} className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded ${
                tr.action === 'sell'
                  ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                  : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
              }`}>
                {tr.action === 'sell' ? 'SAT' : 'AL'}
              </span>

              {tr.action === 'sell' ? (
                <select
                  value={tr.symbol}
                  onChange={e => updateTrade(tr.id, { symbol: e.target.value })}
                  className="px-2 py-1.5 text-sm font-semibold bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
                >
                  {symbols.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <>
                  <input
                    type="text"
                    value={tr.symbol}
                    onChange={e => updateTrade(tr.id, { symbol: e.target.value })}
                    placeholder="Sembol (mevcut veya yeni)"
                    list={`sim-symbols-${tr.id}`}
                    className="w-40 px-2 py-1.5 text-sm font-semibold bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
                  />
                  <datalist id={`sim-symbols-${tr.id}`}>
                    {symbols.map(s => <option key={s} value={s} />)}
                  </datalist>
                  {!symbols.includes(tr.symbol.toUpperCase()) && (
                    <select
                      value={tr.assetType}
                      onChange={e => updateTrade(tr.id, { assetType: e.target.value as AssetType })}
                      className="px-2 py-1.5 text-xs bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200"
                    >
                      {ASSET_TYPE_OPTIONS.map(t => <option key={t} value={t}>{assetName(t)}</option>)}
                    </select>
                  )}
                </>
              )}

              <div className="flex items-center gap-1 bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-600 rounded-lg px-2 py-1.5">
                <span className="text-xs text-slate-400">₺</span>
                <input
                  type="number"
                  step="1000"
                  min="0"
                  value={tr.amountTry}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    updateTrade(tr.id, { amountTry: Number.isFinite(v) ? v : 0 });
                  }}
                  className="w-28 bg-transparent text-sm font-bold text-gray-900 dark:text-white outline-none"
                />
              </div>

              <button
                onClick={() => removeTrade(tr.id)}
                aria-label="İşlemi kaldır"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Sonuç: önce → sonra */}
      {result && after && (
        <div className="p-5 space-y-4">
          {result.warnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 space-y-1">
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}
                </p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-sm flex-wrap gap-2">
            <p className="text-slate-600 dark:text-gray-300">
              Toplam: <strong>{fmtTRY0(before.total)}</strong>
              <ArrowRight size={13} className="inline mx-1.5" />
              <strong>{fmtTRY0(after.total)}</strong>
            </p>
            <p className={`font-semibold ${result.netCashFlow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              Net nakit: {fmtSignedTRY0(result.netCashFlow)}
              <span className="text-xs font-normal text-slate-500 dark:text-gray-400 ml-1">
                ({result.netCashFlow >= 0 ? 'eline geçer' : 'cebinden çıkar'})
              </span>
            </p>
          </div>

          {/* Tip bazında önce/sonra */}
          <div className="space-y-2">
            {[...new Set([...before.slices.map(s => s.type), ...after.slices.map(s => s.type)])].map(type => {
              const b = before.slices.find(s => s.type === type);
              const a = after.slices.find(s => s.type === type);
              const bPct = b?.pct ?? 0;
              const aPct = a?.pct ?? 0;
              const delta = aPct - bPct;
              const color = assetColor(type, isDark);
              return (
                <div key={type} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-1.5 truncate">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                    {assetName(type)}
                  </span>
                  <div className="flex-1 h-4 bg-slate-100 dark:bg-gray-900/60 rounded overflow-hidden relative">
                    <div className="absolute inset-y-0 left-0 opacity-35 rounded" style={{ width: `${bPct}%`, backgroundColor: color }} />
                    <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${aPct}%`, backgroundColor: color, opacity: 0.85 }} />
                  </div>
                  <span className="w-40 shrink-0 text-right text-xs tabular-nums text-slate-600 dark:text-gray-300">
                    %{bPct.toFixed(1)} → <strong className="text-gray-900 dark:text-white">%{aPct.toFixed(1)}</strong>
                    <span className={`ml-1 font-bold ${Math.abs(delta) < 0.05 ? 'text-slate-400' : delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      ({delta >= 0 ? '+' : ''}{delta.toFixed(1)})
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400 dark:text-gray-500">
            Koyu şerit = simülasyon sonrası, soluk şerit = şu an. Satış geliri nakit olarak dağılımdan
            çıkar (portföye geri eklemek istersen aynı tutarda bir alım satırı ekle).
          </p>
        </div>
      )}
    </div>
  );
}
