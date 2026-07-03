import { useMemo, useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { TrendingUp, TrendingDown, Wallet, Gauge, Coins, ArrowUpRight } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { computePortfolioMetrics, computeHoldingMetrics, computePassiveYearlyUSD } from '../lib/portfolioMetrics';

interface HeroDashboardProps {
  holdings: Holding[];
  totalCashValue: number;
  dailyChange?: number;
  dailyChangePct?: number;
  historicalData?: { date: string; value: number }[];
  dynamicSafeMaxUSD?: number;
  // Total profit incl. realized (from portfolioMetrics) so the hero KPI matches
  // the rest of the page; falls back to the unrealized-only local computation.
  totalPnLTRY?: number;
  totalPnLPct?: number;
}

function fmtTRY(n: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n);
}
function fmtUSD(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const spring = useSpring(0, { stiffness: 45, damping: 22, mass: 1 });
  const display = useTransform(spring, (c) => format(c));
  const [text, setText] = useState(format(0));
  useEffect(() => { spring.set(value); }, [spring, value]);
  useEffect(() => display.on('change', setText), [display]);
  return <>{text}</>;
}

// Hero sparkline — Tremor'un 0-tabanlı ekseni 30 günlük seriyi dev bir leke
// yapıyordu. Veriye oturan min/max domain'li, hafif inline SVG.
function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const W = 600, H = 96, PAD = 4;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const stepX = (W - PAD * 2) / (data.length - 1);
  const y = (v: number) => PAD + (H - PAD * 2) * (1 - (v - min) / range);
  const points = data.map((v, i) => `${(PAD + i * stepX).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M${points.join(' L')}`;
  const area = `${line} L${(PAD + (data.length - 1) * stepX).toFixed(1)},${H} L${PAD},${H} Z`;
  const stroke = positive ? '#059669' : '#dc2626';
  const gradId = positive ? 'heroSparkPos' : 'heroSparkNeg';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24 md:h-28" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={PAD + (data.length - 1) * stepX} cy={y(data[data.length - 1])} r={3.5} fill={stroke} />
    </svg>
  );
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 75, damping: 18 } },
};

export default function HeroDashboard({
  holdings,
  totalCashValue,
  dailyChange,
  dailyChangePct,
  historicalData,
  dynamicSafeMaxUSD,
  totalPnLTRY,
  totalPnLPct,
}: HeroDashboardProps) {
  const m = useMemo(() => computePortfolioMetrics(holdings), [holdings]);
  const usdRate = m.fxRates.usd;
  const grandTotal = m.totalValueTRY + totalCashValue;
  const grandTotalUSD = usdRate > 0 ? grandTotal / usdRate : 0;

  // Prefer the page-wide profit (incl. realized); fall back to unrealized-only.
  const pnlTRY = totalPnLTRY ?? m.totalPnLTRY;
  const pnlPct = totalPnLPct ?? m.totalPnLPct;

  const passiveYearlyUSD = useMemo(() => computePassiveYearlyUSD(holdings), [holdings]);

  const isPos = (dailyChange ?? 0) >= 0;

  const topHoldings = useMemo(() =>
    computeHoldingMetrics(holdings).sort((a, b) => b.weight - a.weight).slice(0, 3),
    [holdings]);

  const sparkValues = (historicalData || []).slice(-30).map(d => d.value);

  const today = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <motion.div
      className="space-y-5"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* HERO — Editorial gazete tarzı */}
      <motion.div
        variants={item}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink-50 to-amber-50/40 dark:from-ink-900 dark:to-ink-950 border border-gold-200/60 dark:border-gold-900/40 shadow-[0_8px_30px_-12px_rgba(201,169,97,0.25)]"
      >
        {/* Sıcak ışık halkaları */}
        <motion.div
          className="absolute -top-32 -right-20 w-96 h-96 rounded-full bg-gold-300/20 dark:bg-gold-500/8 blur-3xl pointer-events-none"
          animate={{ x: [0, 20, 0], y: [0, -15, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-terra-400/15 dark:bg-terra-500/5 blur-3xl pointer-events-none"
          animate={{ x: [0, -20, 0], y: [0, 15, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Üst şerit: tarih + canlı rozet */}
        <div className="relative flex items-center justify-between px-6 md:px-8 pt-5 border-b border-gold-200/40 dark:border-gold-900/30 pb-3">
          <p className="font-serif text-[11px] md:text-xs uppercase tracking-[0.3em] text-gold-700 dark:text-gold-400">
            ⊹ TANDOR FİNANS ⊹ {today}
          </p>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-emerald-500"
              animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            />
            CANLI
          </div>
        </div>

        <div className="relative px-6 md:px-8 py-6 md:py-8">
          {/* Eyebrow */}
          <p className="font-serif italic text-sm md:text-base text-ink-500 dark:text-gold-200/60 mb-2">
            — Toplam Varlığınız —
          </p>

          {/* DEV TUTAR — modern sans, tight tracking */}
          <p className="font-sans font-black tracking-[-0.04em] text-ink-900 dark:text-white tabular-nums leading-[0.9]
                       text-[3.5rem] md:text-[5.5rem] lg:text-[6.5rem]">
            <span className="text-gold-600 dark:text-gold-400 mr-1 font-bold">₺</span>
            <AnimatedNumber value={grandTotal} format={fmtTRY} />
          </p>

          {/* Alt satır: USD + günlük */}
          <div className="mt-3 md:mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-2">
            <p className="font-sans text-base md:text-lg text-ink-600 dark:text-gold-100/70">
              <span className="font-serif italic mr-1">≈</span>
              <span className="font-bold text-ink-800 dark:text-gold-50 tabular-nums">
                $<AnimatedNumber value={grandTotalUSD} format={fmtUSD} />
              </span>
              <span className="font-serif italic text-sm ml-1 opacity-60">USD</span>
            </p>
            {dailyChange !== undefined && dailyChangePct !== undefined && (
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border-2 ${
                  isPos
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                }`}
              >
                {isPos ? <ArrowUpRight size={14} /> : <TrendingDown size={14} />}
                {isPos ? '+' : ''}₺{fmtTRY(dailyChange)}
                <span className="opacity-70">·</span>
                <span>{isPos ? '+' : ''}{dailyChangePct.toFixed(2)}%</span>
              </motion.div>
            )}
          </div>

          {/* Altın çizgi separator + sparkline */}
          {sparkValues.length > 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-5"
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-serif italic text-xs text-ink-500 dark:text-gold-200/50">Son 30 gün</span>
                <div className="flex-1 h-px bg-gradient-to-r from-gold-400/40 via-gold-400/20 to-transparent" />
                <span className="text-[11px] tabular-nums text-ink-500 dark:text-gold-200/50">
                  ₺{fmtTRY(Math.min(...sparkValues))} – ₺{fmtTRY(Math.max(...sparkValues))}
                </span>
              </div>
              <Sparkline data={sparkValues} positive={sparkValues[sparkValues.length - 1] >= sparkValues[0]} />
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* KPI Kartları — Tarot kart hissi */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Toplam Kâr', icon: Coins, accent: pnlTRY >= 0 ? 'emerald' : 'rose',
            valueRaw: pnlPct,
            valueFmt: (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`,
            subtitle: `${pnlTRY >= 0 ? '+' : '−'}₺${fmtTRY(Math.abs(pnlTRY))}`,
            symbol: '✦',
          },
          {
            label: 'Bugün', icon: isPos ? TrendingUp : TrendingDown,
            accent: isPos ? 'emerald' : 'rose',
            valueRaw: dailyChange ?? 0,
            valueFmt: (n: number) => `${n >= 0 ? '+' : ''}₺${fmtTRY(n)}`,
            subtitle: `${isPos ? '+' : ''}${(dailyChangePct ?? 0).toFixed(2)}% piyasa`,
            symbol: isPos ? '↗' : '↘',
          },
          {
            label: 'Pasif Gelir', icon: Wallet, accent: 'gold',
            valueRaw: passiveYearlyUSD / 12,
            valueFmt: (n: number) => `$${fmtUSD(n)}`,
            valueSuffix: '/ay',
            subtitle: `$${fmtUSD(passiveYearlyUSD)}/yıl tahmini`,
            symbol: '◈',
          },
          {
            label: 'Güvenli Max', icon: Gauge, accent: 'terra',
            valueRaw: dynamicSafeMaxUSD ?? 0,
            valueFmt: (n: number) => `$${fmtUSD(n)}`,
            valueSuffix: '/ay',
            subtitle: 'Dinamik çekim',
            symbol: '✧',
          },
        ].map((card) => {
          const Icon = card.icon;
          const accentClasses: Record<string, { border: string; text: string; iconBg: string; iconText: string; symbol: string }> = {
            emerald: { border: 'border-emerald-300/40 dark:border-emerald-700/40', text: 'text-emerald-700 dark:text-emerald-300', iconBg: 'bg-emerald-50 dark:bg-emerald-950/30', iconText: 'text-emerald-600 dark:text-emerald-400', symbol: 'text-emerald-500/40' },
            rose: { border: 'border-rose-300/40 dark:border-rose-700/40', text: 'text-rose-700 dark:text-rose-300', iconBg: 'bg-rose-50 dark:bg-rose-950/30', iconText: 'text-rose-600 dark:text-rose-400', symbol: 'text-rose-500/40' },
            gold: { border: 'border-gold-300/50 dark:border-gold-700/40', text: 'text-gold-700 dark:text-gold-300', iconBg: 'bg-gold-50 dark:bg-gold-950/30', iconText: 'text-gold-600 dark:text-gold-400', symbol: 'text-gold-500/40' },
            terra: { border: 'border-terra-400/40 dark:border-terra-500/30', text: 'text-terra-600 dark:text-terra-400', iconBg: 'bg-terra-400/10 dark:bg-terra-500/10', iconText: 'text-terra-600 dark:text-terra-400', symbol: 'text-terra-500/40' },
          };
          const a = accentClasses[card.accent];
          return (
            <motion.div
              key={card.label}
              variants={item}
              whileHover={{ y: -3, transition: { duration: 0.2 } }}
              className={`group relative overflow-hidden rounded-xl border ${a.border} bg-white dark:bg-ink-900/80 p-4 shadow-sm hover:shadow-lg transition-shadow`}
            >
              {/* Dekoratif sembol köşede */}
              <span className={`absolute top-1 right-2 font-serif text-3xl ${a.symbol}`}>
                {card.symbol}
              </span>
              <div className="flex items-center gap-2 mb-3">
                <motion.div
                  whileHover={{ rotate: 12, scale: 1.08 }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${a.iconBg}`}
                >
                  <Icon className={a.iconText} size={16} />
                </motion.div>
                <span className="font-serif italic text-xs text-ink-500 dark:text-gold-200/50">
                  {card.label}
                </span>
              </div>
              <p className={`font-sans font-black tabular-nums tracking-[-0.02em] text-2xl md:text-3xl ${a.text}`}>
                <AnimatedNumber value={card.valueRaw} format={card.valueFmt} />
                {card.valueSuffix && (
                  <span className="text-base font-normal text-ink-400 dark:text-gold-200/40 ml-0.5">{card.valueSuffix}</span>
                )}
              </p>
              <p className="text-[11px] text-ink-500 dark:text-gold-200/40 mt-1 tabular-nums">{card.subtitle}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Top 3 — şarap kütüğü stili liste */}
      {topHoldings.length > 0 && (
        <motion.div
          variants={item}
          className="rounded-xl border border-gold-200/60 dark:border-gold-900/30 bg-white dark:bg-ink-900/80 p-5"
        >
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gold-200/40 dark:border-gold-900/30">
            <p className="font-serif italic text-base text-ink-700 dark:text-gold-100/80">
              En Büyük 3 Pozisyon
            </p>
            <span className="font-serif text-xs italic text-gold-700 dark:text-gold-400">
              ~{topHoldings.reduce((s, h) => s + h.weight, 0).toFixed(0)}% portföyün
            </span>
          </div>
          <div className="space-y-2.5">
            {topHoldings.map((h, i) => (
              <motion.div
                key={h.holding.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                whileHover={{ x: 4 }}
                className="flex items-center gap-3 py-1.5 rounded-lg hover:bg-gold-50/50 dark:hover:bg-gold-950/20 transition-colors px-2 -mx-2"
              >
                <span className="font-serif text-xl italic text-gold-600/60 dark:text-gold-400/40 w-6">
                  {i + 1}.
                </span>
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-sm">
                  {h.holding.symbol.slice(0, 4)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-sans font-bold text-ink-900 dark:text-white">{h.holding.symbol}</span>
                    <span className="font-sans font-bold text-ink-800 dark:text-gold-50 tabular-nums">
                      ₺{fmtTRY(h.valueTRY)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-ink-500 dark:text-gold-200/40 italic">
                      {h.weight.toFixed(1)}% · {h.holding.asset_type}
                    </span>
                    <span className={`text-xs font-bold tabular-nums ${
                      h.pnlTRY >= 0
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-rose-600 dark:text-rose-300'
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
