import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, Banknote, Coins, Scissors, Wallet, CheckCircle2 } from 'lucide-react';
import { Holding, supabase } from '../lib/supabase';
import { formatCurrency } from '../services/priceService';

interface Props {
  holdings: Holding[];
  totalCashValue: number;
}

interface IncomeRow {
  id: string;
  income_date: string;
  income_type: string;
  source_symbol?: string;
  amount_try: number;
  is_projected: boolean;
}

interface TrimAction {
  symbol: string;
  positionTry: number;
  pnlPct: number;
  shares: number;
  pricePerShare: number;
  trimShares: number;
  trimTry: number;
  trimUsd: number;
  reason: string;
}

const DEFAULT_TARGET_USD = 1000;

export default function MonthlyWithdrawalPlan({ holdings, totalCashValue }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [target, setTarget] = useState<number>(DEFAULT_TARGET_USD);
  const [income, setIncome] = useState<IncomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [growth, setGrowth] = useState<{
    startValue: number;
    currentValue: number;
    daysSpan: number;
    annualPct: number;
    // Son 30 günün USD bazlı net kazancı (TL enflasyonu hariç)
    last30DaysGainUsd: number | null;
    last30DaysPct: number | null;
  } | null>(null);

  const monthStart = new Date().toISOString().substring(0, 7) + '-01';
  const monthEnd = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    return d.toISOString().substring(0, 10);
  })();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('income_records')
        .select('id, income_date, income_type, source_symbol, amount_try, is_projected')
        .gte('income_date', monthStart)
        .lte('income_date', monthEnd)
        .order('income_date', { ascending: true });
      if (!cancelled) {
        setIncome((data || []) as IncomeRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [monthStart, monthEnd]);

  // Dinamik çekim kuralı: USD bazlı reel büyüme (TL enflasyonu otomatik dışarda)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: snaps }, { data: usdHist }] = await Promise.all([
        supabase
          .from('portfolio_snapshots')
          .select('snapshot_date, total_value, total_investment, total_pnl')
          .order('snapshot_date', { ascending: true }),
        supabase
          .from('price_history')
          .select('recorded_at, price')
          .eq('symbol', 'USD')
          .order('recorded_at', { ascending: true }),
      ]);
      if (cancelled || !snaps || snaps.length < 2) return;

      // Date dedupe (aynı tarih çift kayıt korumalı)
      const dedup = new Map<string, typeof snaps[0]>();
      for (const r of snaps) dedup.set(r.snapshot_date, r);
      const rows = Array.from(dedup.values());

      // Snapshot tarihine en yakın USD kurunu bulan helper
      const usdRows = (usdHist || [])
        .map(r => ({ ts: new Date(r.recorded_at).getTime(), price: Number(r.price) }))
        .filter(r => isFinite(r.price) && r.price > 0)
        .sort((a, b) => a.ts - b.ts);

      const usdAt = (dateStr: string): number | null => {
        if (!usdRows.length) return null;
        const target = new Date(dateStr + 'T12:00:00').getTime();
        let best = usdRows[0];
        let bestDiff = Math.abs(best.ts - target);
        for (const r of usdRows) {
          const d = Math.abs(r.ts - target);
          if (d < bestDiff) { bestDiff = d; best = r; }
        }
        // 7 günden uzak eşleşme reddedilir
        return bestDiff <= 7 * 86400000 ? best.price : null;
      };

      const last = rows[rows.length - 1];
      // En eski kur kaydımız hangi tarihten? Onun öncesine snapshot olsa bile kullanamayız.
      const oldestUsdDate = usdRows.length ? new Date(usdRows[0].ts).toISOString().substring(0, 10) : null;
      const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const earliestPossible = [oneYearAgo.toISOString().substring(0, 10), oldestUsdDate].filter(Boolean).sort().reverse()[0]!;
      const start = rows.find(r => r.snapshot_date >= earliestPossible) || rows[0];

      const startRateUsd = usdAt(start.snapshot_date);
      const lastRateUsd = usdAt(last.snapshot_date);
      const startValueTry = Number(start.total_value) || 0;
      const startInvestmentTry = Number(start.total_investment) || 0;
      const currentValueTry = Number(last.total_value) || 0;
      const currentInvestmentTry = Number(last.total_investment) || 0;

      if (!startRateUsd || !lastRateUsd || startValueTry <= 0) return;

      // USD bazına çevir
      const startValueUsd = startValueTry / startRateUsd;
      const currentValueUsd = currentValueTry / lastRateUsd;
      // Yatırılan yeni para — başlangıç ve bitiş tarihinin kurlarının ortalamasıyla yaklaşık USD karşılığı
      const avgRate = (startRateUsd + lastRateUsd) / 2;
      const investmentChangeUsd = (currentInvestmentTry - startInvestmentTry) / avgRate;
      const realPnlUsd = (currentValueUsd - startValueUsd) - investmentChangeUsd;
      const periodPct = (realPnlUsd / startValueUsd) * 100;

      const days = Math.max(1, (new Date(last.snapshot_date).getTime() - new Date(start.snapshot_date).getTime()) / 86400000);
      const annualPct = (periodPct * 365) / days;

      // Son 30 gün USD bazlı net kazanç (yıllığa çevrilmemiş, gerçek 30 günlük)
      let last30DaysGainUsd: number | null = null;
      let last30DaysPct: number | null = null;
      const thirtyDaysAgoTs = new Date(last.snapshot_date).getTime() - 30 * 86400000;
      const start30 = rows.find(r => new Date(r.snapshot_date).getTime() >= thirtyDaysAgoTs);
      if (start30 && start30.snapshot_date !== last.snapshot_date) {
        const r1 = usdAt(start30.snapshot_date);
        const r2 = usdAt(last.snapshot_date);
        if (r1 && r2) {
          const v1Usd = (Number(start30.total_value) || 0) / r1;
          const v2Usd = (Number(last.total_value) || 0) / r2;
          const inv1 = (Number(start30.total_investment) || 0);
          const inv2 = (Number(last.total_investment) || 0);
          const avgR = (r1 + r2) / 2;
          const investDeltaUsd = (inv2 - inv1) / avgR;
          last30DaysGainUsd = (v2Usd - v1Usd) - investDeltaUsd;
          last30DaysPct = v1Usd > 0 ? (last30DaysGainUsd / v1Usd) * 100 : 0;
        }
      }

      if (!cancelled) {
        setGrowth({
          startValue: startValueUsd,
          currentValue: currentValueUsd,
          daysSpan: Math.round(days),
          annualPct,
          last30DaysGainUsd,
          last30DaysPct,
        });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const usdRate = holdings.find(h => h.symbol === 'USD' && h.asset_type === 'currency')?.current_price ?? 45;
  const eurRate = holdings.find(h => h.symbol === 'EURO' && h.asset_type === 'currency')?.current_price ?? 51;
  const tryValue = (h: Holding) => {
    const v = (h.current_price || 0) * (h.quantity || 0);
    if (h.currency === 'USD') return v * usdRate;
    if (h.currency === 'EUR') return v * eurRate;
    return v;
  };

  const plan = useMemo(() => {
    const targetMonthlyTry = target * usdRate;

    // 1. Pasif gelir — bu ayki toplam (gerçekleşen + projekte)
    const realizedTry = income.filter(r => !r.is_projected).reduce((s, r) => s + (r.amount_try || 0), 0);
    const projectedTry = income.filter(r => r.is_projected).reduce((s, r) => s + (r.amount_try || 0), 0);
    const passiveTry = realizedTry + projectedTry;
    const passiveItems = income.map(r => ({
      label: `${r.income_type}${r.source_symbol ? ` ${r.source_symbol}` : ''}`,
      tryAmount: r.amount_try || 0,
      realized: !r.is_projected,
      date: r.income_date,
    }));

    // 2. Trim ihtiyacı — pasiften sonra kalan
    const remainingAfterPassive = Math.max(0, targetMonthlyTry - passiveTry);

    // Trim adayları: kazançlı kâğıt varlık (hisse + fon). Physical altın hariç.
    const trimCandidates = holdings
      .filter(h => (h.asset_type === 'stock' || h.asset_type === 'fund') && h.purchase_price > 0)
      .map(h => {
        const v = tryValue(h);
        const pnlPct = ((h.current_price - h.purchase_price) / h.purchase_price) * 100;
        return { holding: h, value: v, pnlPct };
      })
      .filter(x => x.pnlPct >= 30 && x.value >= 5000)
      .sort((a, b) => b.pnlPct - a.pnlPct);

    // Bu ay için trim: en yüksek 3-4 winner'dan, sırayla yeter kadar
    const trimActions: TrimAction[] = [];
    let trimAccum = 0;
    for (const c of trimCandidates) {
      if (trimAccum >= remainingAfterPassive) break;
      const need = remainingAfterPassive - trimAccum;
      const maxShareThisMonth = Math.min(c.value * 0.025, need); // pozisyonun max %2.5'u/ay
      if (maxShareThisMonth < 1000) continue;
      const pricePerShare = c.holding.current_price || 0;
      const trimShares = pricePerShare > 0 ? Math.ceil(maxShareThisMonth / pricePerShare) : 0;
      if (trimShares <= 0) continue;
      const trimTry = trimShares * pricePerShare;
      trimAccum += trimTry;
      const reason =
        c.pnlPct >= 100 ? `+%${c.pnlPct.toFixed(0)} kazançta, kâr realize zamanı` :
        c.pnlPct >= 60 ? `+%${c.pnlPct.toFixed(0)} kazançta, parçalı satış` :
        `+%${c.pnlPct.toFixed(0)} kazançta, küçük dilim`;
      trimActions.push({
        symbol: c.holding.symbol,
        positionTry: c.value,
        pnlPct: c.pnlPct,
        shares: c.holding.quantity || 0,
        pricePerShare,
        trimShares,
        trimTry,
        trimUsd: trimTry / usdRate,
        reason,
      });
    }
    const trimTotalTry = trimActions.reduce((s, a) => s + a.trimTry, 0);

    // 3. Buffer
    const bufferTry = Math.max(0, targetMonthlyTry - passiveTry - trimTotalTry);
    const cashUsdHoldings = holdings.filter(h => h.asset_type === 'currency').reduce((s, h) => s + tryValue(h), 0);
    const totalLiquidTry = cashUsdHoldings + totalCashValue;
    const bufferMonthsLeft = bufferTry > 0 ? totalLiquidTry / bufferTry : Infinity;

    return {
      targetMonthlyTry,
      targetMonthlyUsd: target,
      passiveTry,
      realizedTry,
      projectedTry,
      passiveItems,
      trimActions,
      trimTotalTry,
      bufferTry,
      bufferMonthsLeft,
    };
  }, [holdings, totalCashValue, income, target, usdRate]);

  if (holdings.length === 0) return null;

  const monthLabel = new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
      <div className="p-4 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-gray-800/30" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-brand-600 to-emerald-500 rounded-xl shadow-md flex-shrink-0">
            <Banknote className="text-white" size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Bu Ay Çek — {monthLabel}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ${plan.targetMonthlyUsd}/ay = {formatCurrency(plan.targetMonthlyTry, 0)} ₺
            </p>
          </div>
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Target input */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Bu ay hedef ($):</span>
            <input
              type="number"
              min={0}
              max={20000}
              step={50}
              value={target}
              onChange={e => setTarget(Math.max(0, Number(e.target.value) || 0))}
              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>

          {loading ? (
            <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-4">Yükleniyor...</div>
          ) : (
            <>
              {/* 1. Pasif gelir bu ay */}
              <section>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1">
                    <Coins size={10} /> 1. Pasif Gelir
                  </h4>
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(plan.passiveTry, 0)} ₺
                  </span>
                </div>
                {plan.passiveItems.length === 0 ? (
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 italic px-2 py-2 rounded-md bg-slate-50 dark:bg-gray-800/60">
                    Bu ay için kayıtlı pasif gelir yok. Eurobond kuponu/temettü/staking aldıysan IncomeRecordModal'dan logla.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {plan.passiveItems.map((it, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md bg-slate-50 dark:bg-gray-800/60">
                        {it.realized ? (
                          <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
                        ) : (
                          <span className="w-3 h-3 rounded-full border border-amber-400 flex-shrink-0" />
                        )}
                        <span className="font-medium text-gray-700 dark:text-gray-300">{it.label}</span>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                          {new Date(it.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                        </span>
                        <span className="ml-auto font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(it.tryAmount, 0)} ₺</span>
                      </div>
                    ))}
                    <div className="text-[10px] text-gray-500 mt-1 pl-1">
                      ✓ gerçekleşen · ○ beklenen · {plan.realizedTry > 0 ? `Bu ay alınan: ${formatCurrency(plan.realizedTry, 0)} ₺` : 'Henüz gerçekleşmedi'}
                    </div>
                  </div>
                )}
              </section>

              {/* 2. Trim aksiyonları */}
              <section>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1">
                    <Scissors size={10} /> 2. Bu Ay Trim Et
                  </h4>
                  <span className="text-xs font-bold text-brand-700 dark:text-brand-300">
                    {formatCurrency(plan.trimTotalTry, 0)} ₺
                  </span>
                </div>
                {plan.trimActions.length === 0 ? (
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 italic px-2 py-2 rounded-md bg-slate-50 dark:bg-gray-800/60">
                    Trim ihtiyacı yok — pasif gelir hedefi karşılıyor. 🎉
                  </div>
                ) : (
                  <div className="space-y-1">
                    {plan.trimActions.map(a => (
                      <div key={a.symbol} className="px-2.5 py-2 rounded-md bg-brand-50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-900">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-gray-900 dark:text-white">{a.symbol}</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">+%{a.pnlPct.toFixed(0)}</span>
                          <span className="ml-auto font-bold text-brand-700 dark:text-brand-300">
                            {a.trimShares} pay sat · {formatCurrency(a.trimTry, 0)} ₺
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                          {a.reason} · ~${a.trimUsd.toFixed(0)} · adet fiyatı {formatCurrency(a.pricePerShare, 2)} ₺
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 3. Buffer */}
              <section>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1">
                    <Wallet size={10} /> 3. Buffer (Likit Nakitten)
                  </h4>
                  <span className={`text-xs font-bold ${plan.bufferTry > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                    {formatCurrency(plan.bufferTry, 0)} ₺
                  </span>
                </div>
                {plan.bufferTry > 0 ? (
                  <div className="px-2.5 py-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300">
                    Pasif + trim sonrası kalan <span className="font-bold">{formatCurrency(plan.bufferTry, 0)} ₺</span> ($
                    {(plan.bufferTry / usdRate).toFixed(0)}) USD nakitten çek.
                    {isFinite(plan.bufferMonthsLeft) && ` Mevcut nakit ${plan.bufferMonthsLeft.toFixed(0)} ay yastık verir.`}
                  </div>
                ) : (
                  <div className="px-2.5 py-2 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-[11px] text-emerald-800 dark:text-emerald-300">
                    Buffer'a inmen gerekmiyor — pasif + trim hedefi tutuyor. Sermaye eritmedi. ✓
                  </div>
                )}
              </section>

              {/* Dinamik çekim önerisi — USD bazlı reel büyüme (TL enflasyonu hariç) */}
              {growth && (() => {
                const SAFETY = 0.85;
                // Yıllık sürdürülebilir aylık max (uzun vadeli ortalama)
                const sustainableMonthlyUsd = Math.max(0, (growth.currentValue * (growth.annualPct / 100) * SAFETY) / 12);
                // Bu ay için spesifik max — son 30 günün gerçek kazancının %85'i
                const thisMonthMaxUsd = growth.last30DaysGainUsd != null
                  ? Math.max(0, growth.last30DaysGainUsd * SAFETY)
                  : null;

                const monthlyNegative = growth.last30DaysGainUsd != null && growth.last30DaysGainUsd < 0;
                const annualNegative = growth.annualPct < 0;

                // Önerilen max = ikisinden DAHA KÜÇÜK olanı (güvenli taraf)
                const recommendedMax = thisMonthMaxUsd != null
                  ? Math.min(thisMonthMaxUsd, sustainableMonthlyUsd)
                  : sustainableMonthlyUsd;

                return (
                  <div className={`p-3 rounded-xl border ${monthlyNegative || annualNegative ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900' : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900'}`}>
                    <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${monthlyNegative || annualNegative ? 'text-red-700 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'}`}>
                      Dinamik Çekim Kuralı (USD bazlı)
                    </div>

                    {/* BU AY MAX — büyük ve net */}
                    <div className="mb-2 p-2 rounded-lg bg-white dark:bg-gray-900/50 border border-blue-300 dark:border-blue-800">
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">Bu Ay İçin Max</div>
                      {monthlyNegative ? (
                        <>
                          <div className="text-base font-bold text-red-600 dark:text-red-400">$0/ay</div>
                          <div className="text-[11px] text-red-700 dark:text-red-400 font-semibold">
                            Son 30 gün USD bazlı {growth.last30DaysGainUsd!.toFixed(0)} kayıp — bu ay anaparaya dokunma.
                          </div>
                        </>
                      ) : thisMonthMaxUsd != null ? (
                        <>
                          <div className="text-xl font-bold text-blue-700 dark:text-blue-400">
                            ${thisMonthMaxUsd.toFixed(0)}
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">
                            Son 30 günde +${growth.last30DaysGainUsd!.toFixed(0)} kazandın × %85 güvenlik
                          </div>
                          {thisMonthMaxUsd >= 50 && Math.abs(target - thisMonthMaxUsd) > 50 && (
                            <button
                              onClick={() => setTarget(Math.round(thisMonthMaxUsd))}
                              className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:underline mt-1"
                            >
                              → Hedefi ${Math.round(thisMonthMaxUsd)}'a ayarla
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="text-[11px] text-gray-500">30 günlük veri yok — yıllık ortalama kullan</div>
                      )}
                    </div>

                    {/* Yıllık ortalama referans */}
                    <div className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">Yıllık ortalama (referans):</span>
                        <span className={`text-[11px] font-bold ${growth.annualPct >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                          {growth.annualPct >= 0 ? '+' : ''}{growth.annualPct.toFixed(1)}% / yıl
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">Sürdürülebilir aylık (uzun vadeli):</span>
                        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                          ${sustainableMonthlyUsd.toFixed(0)}
                        </span>
                      </div>
                      {thisMonthMaxUsd != null && (
                        <div className="flex items-center justify-between pt-1 mt-1 border-t border-blue-200 dark:border-blue-900/50">
                          <span className="text-[11px] text-blue-700 dark:text-blue-400 font-semibold">Önerilen (ikisinden küçük olan):</span>
                          <span className="text-sm font-bold text-blue-700 dark:text-blue-400">
                            ${recommendedMax.toFixed(0)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="text-[10px] text-gray-500 dark:text-gray-400 italic mt-2 leading-relaxed">
                      Hesap USD bazlı: portföyü o günkü USD/TRY kuruyla USD'ye çeviriyoruz, TL enflasyonu otomatik düşüyor.
                      Bu ay max = son 30 günün gerçek kazancının %85'i. Yıllık ortalama da referans olarak gösteriliyor —
                      ikisinden daha küçük olan en güvenli seçim.
                    </div>
                  </div>
                );
              })()}

              {/* Summary */}
              <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-brand-50 dark:from-emerald-950/20 dark:to-brand-950/20 border border-emerald-200 dark:border-emerald-900">
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-1">
                  Özet
                </div>
                <div className="text-xs space-y-0.5 text-gray-700 dark:text-gray-300">
                  <div>Pasif: <span className="font-mono font-semibold">{formatCurrency(plan.passiveTry, 0)} ₺</span> ({((plan.passiveTry / Math.max(1, plan.targetMonthlyTry)) * 100).toFixed(0)}%)</div>
                  <div>Trim: <span className="font-mono font-semibold">{formatCurrency(plan.trimTotalTry, 0)} ₺</span> ({((plan.trimTotalTry / Math.max(1, plan.targetMonthlyTry)) * 100).toFixed(0)}%)</div>
                  <div>Buffer: <span className="font-mono font-semibold">{formatCurrency(plan.bufferTry, 0)} ₺</span> ({((plan.bufferTry / Math.max(1, plan.targetMonthlyTry)) * 100).toFixed(0)}%)</div>
                  <div className="pt-1 border-t border-emerald-200 dark:border-emerald-900 mt-1 font-bold text-gray-900 dark:text-white">
                    Toplam: ${plan.targetMonthlyUsd} ({formatCurrency(plan.targetMonthlyTry, 0)} ₺)
                  </div>
                </div>
              </div>
            </>
          )}

          <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
            Trim önerisi: pozisyon başına aylık max %2.5 (yıllık ~%30 üst sınır), sadece +%30 üstü kazançtaki pozisyonlardan.
          </p>
        </div>
      )}
    </div>
  );
}
