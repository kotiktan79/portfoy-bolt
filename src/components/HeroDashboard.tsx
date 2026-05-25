import { useMemo, useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { AreaChart } from '@tremor/react';
import { TrendingUp, TrendingDown, Wallet, Gauge, DollarSign, Sparkles } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { computePortfolioMetrics, computeHoldingMetrics } from '../lib/portfolioMetrics';

interface HeroDashboardProps {
  holdings: Holding[];
  totalCashValue: number;
  dailyChange?: number;
  dailyChangePct?: number;
  historicalData?: { date: string; value: number }[];
  dynamicSafeMaxUSD?: number;
}

function fmtTRY(n: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n);
}
function fmtUSD(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

/** Sayı sayım animasyonu: 0'dan target'a doğru yumuşak geçiş. */
function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const spring = useSpring(0, { stiffness: 50, damping: 20, mass: 1 });
  const display = useTransform(spring, (current) => format(current));
  const [text, setText] = useState(format(0));
  useEffect(() => { spring.set(value); }, [spring, value]);
  useEffect(() => display.on('change', setText), [display]);
  return <>{text}</>;
}

// Stagger container — alt elemanlar sırayla görünür
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 90, damping: 18 } },
};

export default function HeroDashboard({
  holdings,
  totalCashValue,
  dailyChange,
  dailyChangePct,
  historicalData,
  dynamicSafeMaxUSD,
}: HeroDashboardProps) {
  const m = useMemo(() => computePortfolioMetrics(holdings), [holdings]);
  const usdRate = m.fxRates.usd;
  const grandTotal = m.totalValueTRY + totalCashValue;
  const grandTotalUSD = usdRate > 0 ? grandTotal / usdRate : 0;

  const passiveYearlyUSD = useMemo(() => {
    const fx = m.fxRates;
    let yearly = 0;
    for (const h of holdings.filter(x => x.asset_type !== 'cash')) {
      const v = (h.current_price || 0) * (h.quantity || 0);
      const vTRY = (h.currency || 'TRY').toUpperCase() === 'USD' ? v * fx.usd
        : (h.currency || 'TRY').toUpperCase() === 'EUR' ? v * fx.eur : v;
      let y = 0;
      if (h.asset_type === 'eurobond') y = 0.045;
      else if (['JNJ', 'KO', 'PG', 'SCHD', 'NESN'].includes(h.symbol)) y = 0.03;
      else if (h.asset_type === 'fund') y = 0.03;
      yearly += vTRY * y;
    }
    return usdRate > 0 ? yearly / usdRate : 0;
  }, [holdings, m.fxRates, usdRate]);

  const isPos = (dailyChange ?? 0) >= 0;

  const topHoldings = useMemo(() =>
    computeHoldingMetrics(holdings).sort((a, b) => b.weight - a.weight).slice(0, 3),
    [holdings]);

  const chartData = (historicalData || []).slice(-30).map(d => ({
    date: d.date.slice(5),
    'Portföy (₺)': d.value,
  }));

  return (
    <motion.div
      className="space-y-4"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* HERO — Glass effect + animasyonlu sayı */}
      <motion.div
        variants={item}
        className="relative overflow-hidden rounded-3xl border border-slate-200/60 dark:border-gray-800 bg-gradient-to-br from-indigo-50 via-white to-emerald-50 dark:from-indigo-950/40 dark:via-gray-900 dark:to-emerald-950/40 shadow-xl"
      >
        {/* Hareketli blob'lar */}
        <motion.div
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-indigo-300/20 dark:bg-indigo-500/10 blur-3xl pointer-events-none"
          animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-emerald-300/20 dark:bg-emerald-500/10 blur-3xl pointer-events-none"
          animate={{ x: [0, -30, 0], y: [0, 20, 0], scale: [1.1, 1, 1.1] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative p-6 md:p-8">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <motion.div
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Sparkles className="text-indigo-500 dark:text-indigo-400" size={16} />
              </motion.div>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-gray-400">
                Toplam Varlık
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                <motion.span
                  className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                  animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                Canlı
              </span>
            </div>
            {dailyChange !== undefined && dailyChangePct !== undefined && (
              <motion.div
                initial={{ scale: 0, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.4 }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold shadow-md ${
                  isPos ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                }`}
              >
                {isPos ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {isPos ? '+' : ''}{dailyChangePct.toFixed(2)}%
              </motion.div>
            )}
          </div>
          <p className="text-5xl md:text-7xl font-black tracking-tight text-slate-900 dark:text-white tabular-nums leading-none">
            ₺<AnimatedNumber value={grandTotal} format={(n) => fmtTRY(n)} />
          </p>
          <p className="mt-3 text-base md:text-lg text-slate-600 dark:text-gray-400">
            ≈ <span className="font-bold text-slate-800 dark:text-gray-200">
              $<AnimatedNumber value={grandTotalUSD} format={(n) => fmtUSD(n)} />
            </span> USD
            {dailyChange !== undefined && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className={`ml-3 font-semibold ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}
              >
                {isPos ? '+' : ''}₺{fmtTRY(dailyChange)} bugün
              </motion.span>
            )}
          </p>

          {chartData.length > 1 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
            >
              <AreaChart
                className="!h-36 !mt-4"
                data={chartData}
                index="date"
                categories={['Portföy (₺)']}
                colors={[isPos ? 'emerald' : 'rose']}
                showLegend={false}
                showYAxis={false}
                showGridLines={false}
                showXAxis={false}
                curveType="monotone"
                valueFormatter={(n) => '₺' + fmtTRY(n)}
              />
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* KPI Grid — stagger animasyon */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Toplam K/Z', color: 'emerald',
            gradient: 'from-emerald-400 to-emerald-600',
            iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
            iconColor: 'text-emerald-600 dark:text-emerald-400',
            valueColor: 'text-emerald-600 dark:text-emerald-400',
            icon: DollarSign,
            valueRaw: m.totalPnLPct,
            valueFmt: (n: number) => `+${n.toFixed(1)}%`,
            subtitle: `+₺${fmtTRY(m.totalPnLTRY)} · $${fmtUSD(m.totalPnLUSD)}`,
          },
          {
            label: 'Bugün',
            color: isPos ? 'emerald' : 'rose',
            gradient: isPos ? 'from-emerald-400 to-emerald-600' : 'from-rose-400 to-rose-600',
            iconBg: isPos ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-rose-100 dark:bg-rose-900/30',
            iconColor: isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
            valueColor: isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
            icon: isPos ? TrendingUp : TrendingDown,
            valueRaw: dailyChange ?? 0,
            valueFmt: (n: number) => `${n >= 0 ? '+' : ''}₺${fmtTRY(n)}`,
            subtitle: `${isPos ? '+' : ''}${(dailyChangePct ?? 0).toFixed(2)}% piyasa`,
          },
          {
            label: 'Pasif Gelir', color: 'blue',
            gradient: 'from-blue-400 to-blue-600',
            iconBg: 'bg-blue-100 dark:bg-blue-900/30',
            iconColor: 'text-blue-600 dark:text-blue-400',
            valueColor: 'text-blue-600 dark:text-blue-400',
            icon: Wallet,
            valueRaw: passiveYearlyUSD / 12,
            valueFmt: (n: number) => `$${fmtUSD(n)}`,
            valueSuffix: '/ay',
            subtitle: `$${fmtUSD(passiveYearlyUSD)}/yıl tahmini`,
          },
          {
            label: 'Güvenli Max', color: 'indigo',
            gradient: 'from-indigo-400 to-purple-600',
            iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
            iconColor: 'text-indigo-600 dark:text-indigo-400',
            valueColor: 'bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent',
            icon: Gauge,
            valueRaw: dynamicSafeMaxUSD ?? 0,
            valueFmt: (n: number) => `$${fmtUSD(n)}`,
            valueSuffix: '/ay',
            subtitle: 'Dinamik çekim limiti',
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              variants={item}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-xl transition-shadow"
            >
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.gradient}`} />
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                  {card.label}
                </span>
                <motion.div
                  whileHover={{ rotate: 15, scale: 1.1 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${card.iconBg}`}
                >
                  <Icon className={card.iconColor} size={18} />
                </motion.div>
              </div>
              <p className={`text-3xl font-black tabular-nums ${card.valueColor}`}>
                <AnimatedNumber value={card.valueRaw} format={card.valueFmt} />
                {card.valueSuffix && <span className="text-base font-normal text-slate-400">{card.valueSuffix}</span>}
              </p>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 tabular-nums">{card.subtitle}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Top 3 Holdings — stagger ile sırayla görünür */}
      {topHoldings.length > 0 && (
        <motion.div
          variants={item}
          className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-slate-700 dark:text-gray-200">En Büyük 3 Pozisyon</p>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              Portföyün %{topHoldings.reduce((s, h) => s + h.weight, 0).toFixed(0)}'i
            </p>
          </div>
          <div className="space-y-2">
            {topHoldings.map((h, i) => (
              <motion.div
                key={h.holding.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                whileHover={{ x: 4 }}
                className="flex items-center gap-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors px-2"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-blue-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-sm">
                  {h.holding.symbol.slice(0, 3)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white">{h.holding.symbol}</span>
                    <span className="text-sm font-semibold text-slate-700 dark:text-gray-300 tabular-nums">
                      ₺{fmtTRY(h.valueTRY)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-slate-500 dark:text-gray-400">
                      {h.weight.toFixed(1)}% · {h.holding.asset_type}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                      h.pnlTRY >= 0
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                    }`}>
                      {h.pnlTRY >= 0 ? '+' : ''}{h.pnlPct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
