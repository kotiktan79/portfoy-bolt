import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Wallet, TrendingUp, Calendar } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { formatCurrency } from '../services/priceService';
import { getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';

interface Props {
  holdings: Holding[];
  totalCashValue: number;
}

interface BasketItem {
  symbol: string;
  name: string;
  weight: number;
  yieldPct: number;
  currency: 'USD' | 'EUR';
  cat: 'ETF' | 'REIT' | 'Hisse';
  freq: 'Aylık' | 'Çeyreklik' | 'Yıllık';
  price: number; // approximate, USD-equivalent
}

// Curated dividend basket — Revolut'ta hepsi mevcut
const BASKET: BasketItem[] = [
  { symbol: 'SCHD', name: 'Schwab US Dividend ETF',     weight: 0.30, yieldPct: 3.5, currency: 'USD', cat: 'ETF',   freq: 'Çeyreklik', price: 28 },
  { symbol: 'VYM',  name: 'Vanguard High Dividend ETF', weight: 0.15, yieldPct: 3.0, currency: 'USD', cat: 'ETF',   freq: 'Çeyreklik', price: 130 },
  { symbol: 'O',    name: 'Realty Income (aylık öder)', weight: 0.15, yieldPct: 5.5, currency: 'USD', cat: 'REIT',  freq: 'Aylık',     price: 58 },
  { symbol: 'JNJ',  name: 'Johnson & Johnson',          weight: 0.10, yieldPct: 3.0, currency: 'USD', cat: 'Hisse', freq: 'Çeyreklik', price: 162 },
  { symbol: 'KO',   name: 'Coca-Cola',                  weight: 0.10, yieldPct: 3.0, currency: 'USD', cat: 'Hisse', freq: 'Çeyreklik', price: 68 },
  { symbol: 'PEP',  name: 'PepsiCo',                    weight: 0.07, yieldPct: 3.2, currency: 'USD', cat: 'Hisse', freq: 'Çeyreklik', price: 165 },
  { symbol: 'ALV',  name: 'Allianz SE (EUR)',           weight: 0.07, yieldPct: 5.5, currency: 'EUR', cat: 'Hisse', freq: 'Yıllık',    price: 320 },
  { symbol: 'TTE',  name: 'TotalEnergies (EUR)',        weight: 0.06, yieldPct: 5.0, currency: 'EUR', cat: 'Hisse', freq: 'Çeyreklik', price: 65 },
];

const CAT_COLORS: Record<BasketItem['cat'], string> = {
  ETF: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
  REIT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Hisse: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export default function DividendInvestmentPlanner({ holdings, totalCashValue }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState<number>(30000);

  const usdRate = holdings.find(h => h.symbol === 'USD' && h.asset_type === 'currency')?.current_price ?? 45;

  const liquidUsd = useMemo(() => {
    const fxRates = getFxRatesFromHoldings(holdings);
    const cashTRY = holdings
      .filter(h => h.asset_type === 'currency')
      .reduce((s, h) => s + holdingValueTRY(h, fxRates), 0);
    return (cashTRY + totalCashValue) / usdRate;
  }, [holdings, totalCashValue, usdRate]);

  const plan = useMemo(() => {
    const rows = BASKET.map(b => {
      const allocUsd = amount * b.weight;
      const yearlyDivUsd = allocUsd * b.yieldPct / 100;
      const shares = b.price > 0 ? allocUsd / b.price : 0;
      return {
        ...b,
        allocUsd,
        yearlyDivUsd,
        monthlyDivUsd: yearlyDivUsd / 12,
        shares,
      };
    });
    const totalYearly = rows.reduce((s, r) => s + r.yearlyDivUsd, 0);
    const blendedYield = amount > 0 ? (totalYearly / amount) * 100 : 0;
    return { rows, totalYearly, blendedYield, totalMonthly: totalYearly / 12 };
  }, [amount]);

  // 6 hafta DCA
  const dcaWeeks = 6;
  const weeklyAmount = amount / dcaWeeks;

  const overAllocation = amount > liquidUsd;
  const remainingCashAfter = liquidUsd - amount;

  if (holdings.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
      <div className="p-4 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-gray-800/30" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-amber-500 to-emerald-600 rounded-xl shadow-md flex-shrink-0">
            <TrendingUp className="text-white" size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Temettü Yatırım Planı</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Revolut · USD/EUR · ~{plan.blendedYield.toFixed(1)}% yıllık temettü
            </p>
          </div>
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Amount input */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Yatırım ($):</span>
              <input
                type="number"
                min={1000}
                max={150000}
                step={1000}
                value={amount}
                onChange={e => setAmount(Math.max(0, Number(e.target.value) || 0))}
                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <div className="flex gap-1">
                {[15000, 30000, 50000].map(v => (
                  <button
                    key={v}
                    onClick={() => setAmount(v)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold ${amount === v ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                  >
                    ${v / 1000}K
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1"><Wallet size={10} /> Likit nakit: ${formatCurrency(liquidUsd, 0)}</span>
              {overAllocation ? (
                <span className="text-red-500 font-semibold">Nakit yetmez (${formatCurrency(amount - liquidUsd, 0)} eksik)</span>
              ) : (
                <span>Sonra kalan: ${formatCurrency(remainingCashAfter, 0)}</span>
              )}
            </div>
          </div>

          {/* Outcome cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-center">
              <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase">Yıllık Temettü</div>
              <div className="text-sm font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">${plan.totalYearly.toFixed(0)}</div>
            </div>
            <div className="p-2 rounded-lg bg-brand-50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-900 text-center">
              <div className="text-[10px] font-semibold text-brand-700 dark:text-brand-400 uppercase">Aylık Pasif</div>
              <div className="text-sm font-bold text-brand-800 dark:text-brand-300 mt-0.5">${plan.totalMonthly.toFixed(0)}</div>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-center">
              <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase">Blended Yield</div>
              <div className="text-sm font-bold text-amber-800 dark:text-amber-300 mt-0.5">%{plan.blendedYield.toFixed(2)}</div>
            </div>
          </div>

          {/* Allocation table */}
          <div>
            <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">
              Alım Listesi (Revolut'ta hepsi var)
            </h4>
            <div className="space-y-1">
              {plan.rows.map(r => (
                <div key={r.symbol} className="flex items-center gap-2 text-xs px-2 py-2 rounded-md bg-slate-50 dark:bg-gray-800/60">
                  <span className="font-bold text-gray-900 dark:text-white w-12">{r.symbol}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${CAT_COLORS[r.cat]}`}>{r.cat}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold w-12">%{r.yieldPct.toFixed(1)}</span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 w-12">{r.freq}</span>
                  <div className="ml-auto text-right">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">${r.allocUsd.toFixed(0)}</div>
                    <div className="text-[10px] text-gray-500">~{r.shares.toFixed(r.shares > 50 ? 0 : 1)} pay · {r.currency}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 italic mt-1">
              Pay sayıları yaklaşık (referans fiyatla). Revolut'ta fractional shares destekler — tam dolar tutarı girersin.
            </p>
          </div>

          {/* DCA plan */}
          <div className="p-3 rounded-xl border border-brand-200 dark:border-brand-900 bg-brand-50 dark:bg-brand-950/20">
            <div className="flex items-center gap-2 mb-1.5">
              <Calendar size={12} className="text-brand-600" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-700 dark:text-brand-400">
                DCA Önerisi — {dcaWeeks} Hafta
              </span>
            </div>
            <div className="text-xs text-gray-700 dark:text-gray-300">
              <div>Her hafta yaklaşık <span className="font-bold text-brand-700 dark:text-brand-300">${weeklyAmount.toFixed(0)}</span> alım yap. Listedeki oranları koru.</div>
              <div className="text-[10px] text-gray-500 mt-1">
                Sebep: piyasa zirvedeyse zarar riskini azaltır, dipte ise daha çok pay alırsın.
              </div>
            </div>
          </div>

          {/* Maaş etkisi */}
          <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-gradient-to-br from-emerald-50 to-brand-50 dark:from-emerald-950/20 dark:to-brand-950/20">
            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-1">
              Maaş Planına Etkisi
            </div>
            <div className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
              <div>Önce pasif: <span className="font-mono">~$80/ay</span></div>
              <div>Sonra pasif: <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">~${(80 + plan.totalMonthly).toFixed(0)}/ay</span></div>
              <div className="text-[10px] text-gray-500 mt-1">
                $1000 maaşının {(((80 + plan.totalMonthly) / 1000) * 100).toFixed(0)}%'ı pasif olur — buffer'a inmen azalır.
              </div>
            </div>
          </div>

          <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
            Yieldlar 2026 Q1 ortalama — gerçek ödeme tarihte değişebilir. Romanya temettü vergisi ~%8-10 hesaba kat.
          </p>
        </div>
      )}
    </div>
  );
}
