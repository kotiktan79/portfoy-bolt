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
// Hangi enstrümanla? — TEK PLAN (2026-09-20): her dilim V3YL + XEON, hisse/tahvil açıklarına oranlı. IB01 yeni alınmaz.
const HINT: Record<string, string> = {
  stock: 'V3YL (Kuzey Amerika hisse ETF)',
  eurobond: 'XEON (euro kısa vade) — mevcut IB01/eurobond durur',
  fund: 'mevcut TEFAS fonları — yeni TL fon alınmaz',
  commodity: 'fiziki — satma/ekleme yok',
  crypto: 'BTC (elle)',
  currency: 'sıra: EURO → RUB → USD; her dilim V3YL + XEON (açıklara oranlı)',
};
// Alım önerilmeyen (tutulan) tipler: fon TL'dir, tek plan yeni TL varlık almaz
const HOLD_TYPES = new Set(['fund']);

const fmtEUR = (n: number) => `€${Math.round(n).toLocaleString('de-DE')}`;

/**
 * Hedefe Ulaşma / Rebalans Planı — canlı.
 * Her varlık sınıfı için: şu an %, hedef %, ne kadar AL / AZALT, ne kadar kaldı.
 * Holdings değiştikçe (alım yaptıkça) otomatik yeniden hesaplar.
 */
export function RebalancePlan({ holdings, totalCashValue }: { holdings: Holding[]; totalCashValue: number }) {
  const { rows, netWorth, kasaEUR } = useMemo(() => {
    const fx = getFxRatesFromHoldings(holdings);
    const eur = fx.eur > 0 ? fx.eur : (fx.usd > 0 ? fx.usd * 1.15 : 1);
    const byClass: Record<string, number> = {};
    for (const h of holdings) {
      if (h.asset_type === 'cash') continue;
      byClass[h.asset_type] = (byClass[h.asset_type] || 0) + holdingValueTRY(h, fx) / eur;   // EUR, tek ölçü
    }
    // KASA PORTFÖY DIŞI (kilitli kural 2026-09-19): plana katılmaz; haftalık dilimlerle portföye girdikçe sayılır
    const kasaEUR = (totalCashValue || 0) / eur;
    const netWorth = Object.values(byClass).reduce((s, v) => s + v, 0);

    const rows = Object.keys(TARGET_ALLOCATION).map(type => {
      const cur = byClass[type] || 0;
      const targetPct = TARGET_ALLOCATION[type].target;
      const targetVal = (netWorth * targetPct) / 100;
      const gap = targetVal - cur; // + = AL, − = AZALT
      const curPct = netWorth > 0 ? (cur / netWorth) * 100 : 0;
      return { type, curPct, targetPct, cur, gap, physical: PHYSICAL_FIXED_TYPES.has(type), hold: HOLD_TYPES.has(type) };
    });
    return { rows, netWorth, kasaEUR };
  }, [holdings, totalCashValue]);

  const tol = netWorth * 0.01; // %1 tolerans → "hedefte"
  const toBuy = rows.filter(r => r.gap > tol && !r.physical && !r.hold).reduce((s, r) => s + r.gap, 0);
  // Dilim bölünmesi = açıklara oranlı (panel rotSplitShares ile aynı kural): hisse açığı / tahvil açığı
  const stockGap = Math.max(0, rows.find(r => r.type === 'stock')?.gap ?? 0), ebGap = Math.max(0, rows.find(r => r.type === 'eurobond')?.gap ?? 0);
  const splitStock = stockGap + ebGap > 0 ? Math.round(100 * stockGap / (stockGap + ebGap)) : 50;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300">
        <Target size={13} /> Hedefe Ulaşma Planı
      </div>
      <p className="text-[11px] text-slate-500 dark:text-gray-400 mb-3">
        Toplam alınması gereken: <strong className="text-brand-600 dark:text-brand-400">{fmtEUR(toBuy)}</strong> — her dilim açıklara oranlı: <strong>%{splitStock} V3YL / %{100 - splitStock} XEON</strong>
      </p>

      <div className="space-y-2.5">
        {rows.map(r => {
          const buy = r.gap > tol && !r.hold;
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
                  <ArrowUpCircle size={13} /> {fmtEUR(r.gap)} AL <span className="font-normal text-slate-500 dark:text-gray-400">→ {HINT[r.type]}</span>
                </div>
              )}
              {sell && (
                r.physical ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-gray-400">
                    <Lock size={13} /> Fazla ama satma (fiziki) — gerisini büyüt, seyrelt
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                    <ArrowDownCircle size={13} /> {fmtEUR(-r.gap)} AZALT <span className="font-normal text-slate-500 dark:text-gray-400">→ {HINT[r.type]}</span>
                  </div>
                )
              )}
              {onTarget && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={13} /> {r.hold && r.gap > tol ? `Tut — ${HINT[r.type]}` : 'Hedefte ✓'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-3 leading-relaxed">
        Portföy {fmtEUR(netWorth)} (kasa hariç). Kasa {fmtEUR(kasaEUR)} portföy dışıdır; haftalık dilimlerle girdikçe burada sayılır. Aldıkça plan kendini günceller. Altın fiziki, satış önerilmez.
      </p>
    </div>
  );
}
