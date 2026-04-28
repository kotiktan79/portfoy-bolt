import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, PiggyBank, Coins, Sparkles, Wallet, Hourglass } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { formatCurrency } from '../services/priceService';

interface Props {
  holdings: Holding[];
  totalCashValue: number;
}

interface TrimRow {
  symbol: string;
  positionTry: number;
  pnlPct: number;
  trimPct: number;
  yearlyTry: number;
  monthlyTry: number;
}

interface Scenario {
  label: string;
  growthPct: number;
  yearsLast: number | null; // null = infinite (sermaye eritmez)
  finalValueAt30y: number;
}

interface Plan {
  targetMonthlyTry: number;
  targetMonthlyUsd: number;
  totalValueTry: number;
  withdrawalRatePctYearly: number;
  sustainability: 'green' | 'amber' | 'red';
  passiveMonthly: number;
  trimMonthly: number;
  bufferMonthly: number;
  cashCoverMonths: number;
  trimRows: TrimRow[];
  passiveBreakdown: { label: string; monthly: number }[];
  scenarios: Scenario[];
  notes: string[];
  recommendedMaxUsd: number;       // pasif + max trim, buffer'a düşmeden
  recommendedSafeUsd: number;      // %4/yıl klasik kural
  usdRate: number;
}

const STAKING_APR: Record<string, number> = {
  SOL: 0.065,
  ETH: 0.04,
  BNB: 0.025,
  ADA: 0.04,
  DOT: 0.10,
};

const DIVIDEND_YIELD: Record<string, number> = {
  TUPRS: 0.06,
  GARAN: 0.05,
  BIMAS: 0.025,
  TCELL: 0.04,
  CCOLA: 0.025,
  TTKOM: 0.06,
  AKSEN: 0.02,
  SAHOL: 0.03,
  TOASO: 0.04,
  SISE: 0.02,
  THYAO: 0.0,
  ASELS: 0.005,
  ENKAI: 0.025,
  EREGL: 0.03,
  EKGYO: 0.0,
  JNJ: 0.03,
};

const EUROBOND_COUPON_APR = 0.05;

function computePlan(holdings: Holding[], totalCashValue: number, targetUsd: number): Plan {
  const usd = holdings.find(h => h.symbol === 'USD' && h.asset_type === 'currency')?.current_price ?? 45;
  const eur = holdings.find(h => h.symbol === 'EURO' && h.asset_type === 'currency')?.current_price ?? 51;

  const tryValue = (h: Holding) => {
    const v = (h.current_price || 0) * (h.quantity || 0);
    if (h.currency === 'USD') return v * usd;
    if (h.currency === 'EUR') return v * eur;
    return v;
  };

  const totalValueTry = holdings.reduce((s, h) => s + tryValue(h), 0) + totalCashValue;
  const targetMonthlyTry = targetUsd * usd;
  const targetYearlyTry = targetMonthlyTry * 12;
  const withdrawalRatePctYearly = totalValueTry > 0 ? (targetYearlyTry / totalValueTry) * 100 : 0;

  const passiveBreakdown: { label: string; monthly: number }[] = [];
  let passiveYearly = 0;

  let stakingYearly = 0;
  for (const h of holdings) {
    if (h.asset_type !== 'crypto') continue;
    const apr = STAKING_APR[h.symbol];
    if (!apr) continue;
    stakingYearly += tryValue(h) * apr;
  }
  if (stakingYearly > 0) {
    passiveBreakdown.push({ label: 'Staking', monthly: stakingYearly / 12 });
    passiveYearly += stakingYearly;
  }

  let dividendYearly = 0;
  for (const h of holdings) {
    if (h.asset_type !== 'stock') continue;
    const y = DIVIDEND_YIELD[h.symbol];
    if (!y) continue;
    dividendYearly += tryValue(h) * y;
  }
  if (dividendYearly > 0) {
    passiveBreakdown.push({ label: 'Temettü', monthly: dividendYearly / 12 });
    passiveYearly += dividendYearly;
  }

  const eurobondTry = holdings.filter(h => h.asset_type === 'eurobond').reduce((s, h) => s + tryValue(h), 0);
  if (eurobondTry > 0) {
    const couponYearly = eurobondTry * EUROBOND_COUPON_APR;
    passiveBreakdown.push({ label: 'Eurobond kupon', monthly: couponYearly / 12 });
    passiveYearly += couponYearly;
  }

  const passiveMonthly = passiveYearly / 12;

  // Trim adayları: sadece likit kâğıt varlıklar — physical altın (commodity) hariç
  const trimCandidates = holdings
    .filter(h => h.asset_type === 'stock' && h.purchase_price > 0)
    .map(h => {
      const v = tryValue(h);
      const pnlPct = ((h.current_price - h.purchase_price) / h.purchase_price) * 100;
      return { holding: h, value: v, pnlPct };
    })
    .filter(x => x.pnlPct >= 30 && x.value >= 5000)
    .sort((a, b) => b.pnlPct - a.pnlPct);

  const remainingNeedYearly = Math.max(0, targetYearlyTry - passiveYearly);

  const baseTrimByPnl = (pnl: number) => {
    if (pnl >= 100) return 0.05;
    if (pnl >= 60) return 0.04;
    if (pnl >= 40) return 0.03;
    return 0.02;
  };

  const initialCapacity = trimCandidates.reduce((s, x) => s + x.value * baseTrimByPnl(x.pnlPct), 0);
  const scale = initialCapacity > 0 ? Math.min(1, remainingNeedYearly / initialCapacity) : 0;

  const trimRows: TrimRow[] = trimCandidates.map(x => {
    const trimPct = baseTrimByPnl(x.pnlPct) * scale;
    const yearlyTry = x.value * trimPct;
    return {
      symbol: x.holding.symbol,
      positionTry: x.value,
      pnlPct: x.pnlPct,
      trimPct: trimPct * 100,
      yearlyTry,
      monthlyTry: yearlyTry / 12,
    };
  }).filter(r => r.yearlyTry >= 100);

  const trimMonthly = trimRows.reduce((s, r) => s + r.monthlyTry, 0);

  const bufferMonthly = Math.max(0, targetMonthlyTry - passiveMonthly - trimMonthly);
  const cashUsdHoldings = holdings.filter(h => h.asset_type === 'currency').reduce((s, h) => s + tryValue(h), 0);
  const totalLiquidTry = cashUsdHoldings + totalCashValue;
  const cashCoverMonths = bufferMonthly > 0 ? totalLiquidTry / bufferMonthly : Infinity;

  let sustainability: 'green' | 'amber' | 'red' = 'green';
  const notes: string[] = [];

  if (withdrawalRatePctYearly > 8) {
    sustainability = 'red';
    notes.push('Çekim oranı %8/yıl üstü — uzun vadede sermaye eritir.');
  } else if (withdrawalRatePctYearly > 6) {
    sustainability = 'amber';
    notes.push('Çekim oranı %6-8/yıl — piyasa kötüyse zorlanır, izle.');
  } else {
    notes.push('Çekim oranı sürdürülebilir bantta (≤%6/yıl).');
  }

  if (bufferMonthly > 0 && cashCoverMonths < 12) {
    sustainability = sustainability === 'red' ? 'red' : 'amber';
    notes.push(`Likit nakit ${cashCoverMonths.toFixed(0)} ay yetiyor — kısa süreli yastık.`);
  } else if (bufferMonthly > 0) {
    notes.push(`Likit nakit ${cashCoverMonths.toFixed(0)} ay yastık veriyor.`);
  }

  if (passiveYearly > 0 && trimMonthly + passiveMonthly < targetMonthlyTry * 0.5) {
    notes.push('Pasif gelir + trim hedefin yarısını karşılamıyor; daha çok temettü/staking şart.');
  }

  // Mevcut portföyle sürdürülebilir maksimum çekim:
  // Pasif gelir + maksimum makul trim (kaynaklara dokunmadan)
  const maxTrimYearly = trimCandidates.reduce((s, x) => s + x.value * baseTrimByPnl(x.pnlPct), 0);
  const recommendedMaxYearlyTry = passiveYearly + maxTrimYearly;
  const recommendedMaxUsd = Math.max(0, Math.round((recommendedMaxYearlyTry / 12 / usd) / 50) * 50);
  // Klasik %4 kuralı (Trinity study) — çok muhafazakâr, USD-eşdeğer
  const recommendedSafeUsd = Math.max(0, Math.round((totalValueTry * 0.04 / 12 / usd) / 50) * 50);

  const yearlyWithdrawTry = targetMonthlyTry * 12;
  const projectScenario = (label: string, growthPct: number): Scenario => {
    const r = growthPct / 100;
    const P = totalValueTry;
    const W = yearlyWithdrawTry;
    let yearsLast: number | null;
    if (P * r >= W) {
      yearsLast = null;
    } else if (r === 0) {
      yearsLast = P / W;
    } else {
      const ratio = W / (W - P * r);
      yearsLast = ratio > 1 ? Math.log(ratio) / Math.log(1 + r) : 0;
    }
    let val = P;
    for (let i = 0; i < 30 && val > 0; i++) {
      val = val * (1 + r) - W;
    }
    return { label, growthPct, yearsLast, finalValueAt30y: Math.max(0, val) };
  };

  const scenarios: Scenario[] = [
    projectScenario('Kötü', 3),
    projectScenario('Realist', 8),
    projectScenario('İyimser', 12),
  ];

  return {
    targetMonthlyTry,
    targetMonthlyUsd: targetUsd,
    totalValueTry,
    withdrawalRatePctYearly,
    sustainability,
    passiveMonthly,
    trimMonthly,
    bufferMonthly,
    cashCoverMonths,
    trimRows,
    passiveBreakdown,
    scenarios,
    notes,
    recommendedMaxUsd,
    recommendedSafeUsd,
    usdRate: usd,
  };
}

export default function SalarySimulator({ holdings, totalCashValue }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [target, setTarget] = useState<number>(1000);

  const plan = useMemo(() => computePlan(holdings, totalCashValue, target), [holdings, totalCashValue, target]);

  if (holdings.length === 0) return null;

  const sustColor =
    plan.sustainability === 'green' ? 'text-emerald-600 dark:text-emerald-400' :
    plan.sustainability === 'amber' ? 'text-amber-600 dark:text-amber-400' :
    'text-red-600 dark:text-red-400';

  const sustBg =
    plan.sustainability === 'green' ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900' :
    plan.sustainability === 'amber' ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900' :
    'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900';

  const pct = plan.targetMonthlyTry > 0 ? {
    passive: (plan.passiveMonthly / plan.targetMonthlyTry) * 100,
    trim: (plan.trimMonthly / plan.targetMonthlyTry) * 100,
    buffer: (plan.bufferMonthly / plan.targetMonthlyTry) * 100,
  } : { passive: 0, trim: 0, buffer: 0 };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
      <div className="p-4 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-gray-800/30" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-emerald-500 to-brand-600 rounded-xl shadow-md flex-shrink-0">
            <PiggyBank className="text-white" size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Maaş Simülatörü</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ${plan.targetMonthlyUsd}/ay = {formatCurrency(plan.targetMonthlyTry, 0)} ₺ · %{plan.withdrawalRatePctYearly.toFixed(1)}/yıl
            </p>
          </div>
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-gradient-to-br from-emerald-50 to-brand-50 dark:from-emerald-950/20 dark:to-brand-950/20">
            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-1">
              Mevcut Portföyden Çekebileceğin
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setTarget(plan.recommendedSafeUsd)}
                className="text-left hover:opacity-80 transition-opacity"
              >
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Güvenli (%4 kuralı)</div>
                <div className="text-lg font-black text-emerald-700 dark:text-emerald-300">${plan.recommendedSafeUsd}<span className="text-[10px] font-medium text-gray-400">/ay</span></div>
                <div className="text-[10px] text-gray-500">{formatCurrency(plan.recommendedSafeUsd * plan.usdRate, 0)} ₺</div>
              </button>
              <button
                onClick={() => setTarget(plan.recommendedMaxUsd)}
                className="text-left hover:opacity-80 transition-opacity"
              >
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Maksimum (pasif+trim)</div>
                <div className="text-lg font-black text-brand-700 dark:text-brand-300">${plan.recommendedMaxUsd}<span className="text-[10px] font-medium text-gray-400">/ay</span></div>
                <div className="text-[10px] text-gray-500">buffer'a inmeden</div>
              </button>
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 italic">
              Tıklayınca hedef olarak ayarlanır.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Hedef ($/ay):</span>
            <input
              type="number"
              min={50}
              max={20000}
              step={100}
              value={target}
              onChange={e => setTarget(Math.max(0, Number(e.target.value) || 0))}
              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            />
            <div className="flex gap-1">
              {[500, 1000, 2000].map(v => (
                <button
                  key={v}
                  onClick={() => setTarget(v)}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold ${target === v ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                >
                  ${v}
                </button>
              ))}
            </div>
          </div>

          <div className={`p-3 rounded-xl border ${sustBg}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[11px] font-bold uppercase tracking-widest ${sustColor}`}>
                {plan.sustainability === 'green' ? 'Sürdürülebilir' : plan.sustainability === 'amber' ? 'Sınırda' : 'Riskli'}
              </span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                Portföy {formatCurrency(plan.totalValueTry, 0)} ₺
              </span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-slate-200 dark:bg-gray-800">
              {pct.passive > 0 && <div className="bg-emerald-500" style={{ width: `${Math.min(100, pct.passive)}%` }} />}
              {pct.trim > 0 && <div className="bg-brand-500" style={{ width: `${Math.min(100, pct.trim)}%` }} />}
              {pct.buffer > 0 && <div className="bg-amber-500" style={{ width: `${Math.min(100, pct.buffer)}%` }} />}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase">
                <Coins size={10} /> Pasif
              </div>
              <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">{formatCurrency(plan.passiveMonthly, 0)} ₺</div>
            </div>
            <div className="p-2 rounded-lg bg-brand-50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-900 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-brand-700 dark:text-brand-400 uppercase">
                <Sparkles size={10} /> Trim
              </div>
              <div className="text-xs font-bold text-brand-800 dark:text-brand-300 mt-0.5">{formatCurrency(plan.trimMonthly, 0)} ₺</div>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase">
                <Wallet size={10} /> Buffer
              </div>
              <div className="text-xs font-bold text-amber-800 dark:text-amber-300 mt-0.5">{formatCurrency(plan.bufferMonthly, 0)} ₺</div>
            </div>
          </div>

          {plan.passiveBreakdown.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Pasif Gelir Kaynakları</h4>
              <div className="space-y-1">
                {plan.passiveBreakdown.map(p => (
                  <div key={p.label} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-slate-50 dark:bg-gray-800/60">
                    <span className="text-gray-700 dark:text-gray-300">{p.label}</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(p.monthly, 0)} ₺/ay</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {plan.trimRows.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Kâr Trim Önerisi (yıllık)</h4>
              <div className="space-y-1">
                {plan.trimRows.slice(0, 8).map(r => (
                  <div key={r.symbol} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md bg-slate-50 dark:bg-gray-800/60">
                    <span className="font-bold text-gray-900 dark:text-white w-14">{r.symbol}</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold w-12">+%{r.pnlPct.toFixed(0)}</span>
                    <span className="text-gray-500 dark:text-gray-400 w-14">%{r.trimPct.toFixed(1)}</span>
                    <span className="ml-auto font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(r.yearlyTry, 0)} ₺</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {plan.bufferMonthly > 0 && (
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300">
              Buffer: aylık {formatCurrency(plan.bufferMonthly, 0)} ₺ likit nakitten karşılanır.
              {isFinite(plan.cashCoverMonths) && ` Mevcut nakit ${plan.cashCoverMonths.toFixed(0)} ay yeter.`}
            </div>
          )}

          <div>
            <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1">
              <Hourglass size={10} /> Kaç Yıl Yeter (USD-eşdeğer büyüme)
            </h4>
            <div className="grid grid-cols-3 gap-1.5">
              {plan.scenarios.map(s => {
                const infinite = s.yearsLast === null;
                const yrs = s.yearsLast ?? 0;
                const tone: 'emerald' | 'amber' | 'red' = infinite || yrs >= 25 ? 'emerald' : yrs >= 15 ? 'amber' : 'red';
                const styles = {
                  emerald: {
                    box: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900',
                    label: 'text-emerald-600 dark:text-emerald-400',
                    big: 'text-emerald-700 dark:text-emerald-300',
                    sub: 'text-emerald-500',
                  },
                  amber: {
                    box: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900',
                    label: 'text-amber-600 dark:text-amber-400',
                    big: 'text-amber-700 dark:text-amber-300',
                    sub: 'text-amber-500',
                  },
                  red: {
                    box: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900',
                    label: 'text-red-600 dark:text-red-400',
                    big: 'text-red-700 dark:text-red-300',
                    sub: 'text-red-500',
                  },
                }[tone];
                return (
                  <div key={s.label} className={`p-2 rounded-lg border text-center ${styles.box}`}>
                    <div className={`text-[10px] font-semibold ${styles.label}`}>{s.label} (%{s.growthPct}/yıl)</div>
                    <div className={`text-sm font-bold mt-0.5 ${styles.big}`}>
                      {infinite ? '∞' : yrs >= 50 ? '50+' : `${yrs.toFixed(0)} yıl`}
                    </div>
                    <div className={`text-[9px] mt-0.5 ${styles.sub}`}>
                      {infinite ? 'sermaye büyür' : `30y sonra ${formatCurrency(s.finalValueAt30y, 0)} ₺`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <ul className="text-[10px] text-gray-500 dark:text-gray-400 space-y-0.5 list-disc list-inside">
            {plan.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>

          <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
            Temettü/staking oranları tahmindir. Trim önerisi sadece +%30 ve üzeri kazançtaki pozisyonlardan, kâra göre ölçeklenir.
          </p>
        </div>
      )}
    </div>
  );
}
