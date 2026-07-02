import { useMemo } from 'react';
import { Target, ArrowUpCircle, ArrowDownCircle, CheckCircle2, Lock } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';
import { TARGET_ALLOCATION, PHYSICAL_FIXED_TYPES } from '../config/portfolioPolicy';

// Varlık tipi → Türkçe etiket
const TR: Record<string, string> = {
  stock: 'Hisse', eurobond: 'Eurobond', fund: 'Fon',
  commodity: 'Altın', crypto: 'Kripto', currency: 'Döviz/Nakit',
};
// Hangi enstrümanla?
const HINT: Record<string, string> = {
  stock: 'V3YL (global hisse ETF)',
  eurobond: 'IB01 (USD hazine)',
  fund: 'TEFAS fonu',
  commodity: 'fiziki — satma/ekleme yok',
  crypto: 'BTC (elle)',
  currency: 'likit tampon',
};

function fmtTRY(n: number) {
  return `${Math.round(n).toLocaleString('tr-TR')} ₺`;
}

/**
 * Hedefe Ulaşma / Rebalans Planı — canlı.
 * Her varlık sınıfı için: şu an %, hedef %, ne kadar AL / AZALT, ne kadar kaldı.
 * Holdings değiştikçe (alım yaptıkça) otomatik yeniden hesaplar.
 */
export function RebalancePlan({ holdings, totalCashValue }: { holdings: Holding[]; totalCashValue: number }) {
  const { rows, netWorth, usd } = useMemo(() => {
    const fx = getFxRatesFromHoldings(holdings);
    const usd = fx.usd > 0 ? fx.usd : 1;
    const byClass: Record<string, number> = {};
    for (const h of holdings) {
      if (h.asset_type === 'cash') continue;
      byClass[h.asset_type] = (byClass[h.asset_type] || 0) + holdingValueTRY(h, fx);
    }
    // Nakit bakiyeler döviz/nakit kovasına
    byClass['currency'] = (byClass['currency'] || 0) + (totalCashValue || 0);
    const netWorth = Object.values(byClass).reduce((s, v) => s + v, 0);

    const rows = Object.keys(TARGET_ALLOCATION).map(type => {
      const cur = byClass[type] || 0;
      const targetPct = TARGET_ALLOCATION[type].target;
      const targetVal = (netWorth * targetPct) / 100;
      const gap = targetVal - cur; // + = AL, − = AZALT
      const curPct = netWorth > 0 ? (cur / netWorth) * 100 : 0;
      return { type, curPct, targetPct, cur, gap, physical: PHYSICAL_FIXED_TYPES.has(type) };
    });
    return { rows, netWorth, usd };
  }, [holdings, totalCashValue]);

  const tol = netWorth * 0.01; // %1 tolerans → "hedefte"
  const toBuy = rows.filter(r => r.gap > tol && !r.physical).reduce((s, r) => s + r.gap, 0);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300">
        <Target size={13} /> Hedefe Ulaşma Planı
      </div>
      <p className="text-[11px] text-slate-500 dark:text-gray-400 mb-3">
        Toplam alınması gereken: <strong className="text-brand-600 dark:text-brand-400">{fmtTRY(toBuy)}</strong> (≈ ${Math.round(toBuy / usd).toLocaleString('en-US')})
      </p>

      <div className="space-y-2.5">
        {rows.map(r => {
          const buy = r.gap > tol;
          const sell = r.gap < -tol;
          const onTarget = !buy && !sell;
          return (
            <div key={r.type} className="rounded-lg bg-white/60 dark:bg-gray-900/30 border border-slate-200 dark:border-gray-700 p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{TR[r.type] || r.type}</span>
                <span className="text-[11px] text-slate-500 dark:text-gray-400 tabular-nums">
                  %{r.curPct.toFixed(0)} → %{r.targetPct} hedef
                </span>
              </div>
              {/* ilerleme bar'ı */}
              <div className="relative h-2 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden mb-1.5">
                <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-brand-400 to-brand-600"
                  style={{ width: `${Math.min(100, (r.curPct / r.targetPct) * 100)}%` }} />
              </div>
              {/* aksiyon */}
              {buy && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                  <ArrowUpCircle size={13} /> {fmtTRY(r.gap)} AL <span className="font-normal text-slate-500 dark:text-gray-400">→ {HINT[r.type]}</span>
                </div>
              )}
              {sell && (
                r.physical ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-gray-400">
                    <Lock size={13} /> Fazla ama satma (fiziki) — gerisini büyüt, seyrelt
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                    <ArrowDownCircle size={13} /> {fmtTRY(-r.gap)} AZALT
                  </div>
                )
              )}
              {onTarget && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={13} /> Hedefte ✓
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-3 leading-relaxed">
        Net değer {fmtTRY(netWorth)}. Aldıkça bu plan otomatik güncellenir — "ne kadar kaldı" küçülür. Altın fiziki olduğu için satış önerilmez.
      </p>
    </div>
  );
}
