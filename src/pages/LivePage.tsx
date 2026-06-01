/**
 * /live — Canlı Durum Ekranı (kiosk modu)
 *
 * İkinci ekranda tam ekran açıp gün boyu izlemek için tasarlandı:
 *  • Koyu arkaplan (OLED-friendly, gerçek siyah)
 *  • Devasa rakamlar (uzaktan okunur)
 *  • Buton/menü yok — pure status board
 *  • Her 30 saniyede otomatik veri yenileme
 *  • Saat + tarih + son güncelleme zamanı görünür
 *  • Top 3 kazanan / Top 3 kaybeden (anlık)
 *  • Sparkline portföy eğrisi
 */
import { useEffect, useState, useMemo, useRef } from 'react';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import { AreaChart } from '@tremor/react';
import { TrendingUp, TrendingDown, RefreshCw, Wifi, Wallet, Gauge, ArrowUpRight, ArrowDownRight, DollarSign } from 'lucide-react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { computePortfolioMetrics, computeHoldingMetrics, computePassiveYearlyUSD } from '../lib/portfolioMetrics';
import { getDynamicWithdrawal } from '../services/analyticsService';
import { DynamicWithdrawal } from '../lib/portfolioMetrics';

// Egress quota: 30s → 60s. Kiosk modda 24 saat açık kalırsa 30s'lik çevrim
// price_history tablosunu sürekli çekip 5+ GB/ay egress yapıyor.
const REFRESH_SEC = 60;

function fmtTRY(n: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n);
}
function fmtUSD(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}
function fmtTime(d: Date): string {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const spring = useSpring(0, { stiffness: 60, damping: 25 });
  const display = useTransform(spring, (c) => format(c));
  const [text, setText] = useState(format(0));
  useEffect(() => { spring.set(value); }, [spring, value]);
  useEffect(() => display.on('change', setText), [display]);
  return <>{text}</>;
}

export default function LivePage() {
  const { holdings, livePnlData, historicalData, totalCashValue, handleRefresh, refreshing } = usePortfolio();
  const [now, setNow] = useState(new Date());
  const [countdown, setCountdown] = useState(REFRESH_SEC);
  const [dynamic, setDynamic] = useState<DynamicWithdrawal | null>(null);
  const lastRefreshRef = useRef<Date>(new Date());

  // Saat tikleyici
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Geri sayım + otomatik refresh
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          handleRefresh();
          lastRefreshRef.current = new Date();
          getDynamicWithdrawal().then(setDynamic).catch(() => {});
          return REFRESH_SEC;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [handleRefresh]);

  // İlk yükleme dinamik veriler
  useEffect(() => { getDynamicWithdrawal().then(setDynamic).catch(() => {}); }, []);

  const m = useMemo(() => computePortfolioMetrics(holdings), [holdings]);
  const grandTotal = m.totalValueTRY + totalCashValue;
  const grandTotalUSD = m.fxRates.usd > 0 ? grandTotal / m.fxRates.usd : 0;

  const dailyChange = livePnlData?.daily?.change ?? 0;
  const dailyPct = livePnlData?.daily?.percentage ?? 0;
  const isPos = dailyChange >= 0;

  const passiveYearlyUSD = useMemo(() => computePassiveYearlyUSD(holdings), [holdings]);

  const allMetrics = useMemo(() => computeHoldingMetrics(holdings), [holdings]);
  const topGainers = useMemo(() => [...allMetrics].filter(h => h.pnlPct > 0).sort((a, b) => b.pnlPct - a.pnlPct).slice(0, 5), [allMetrics]);
  const topLosers = useMemo(() => [...allMetrics].filter(h => h.pnlPct < 0).sort((a, b) => a.pnlPct - b.pnlPct).slice(0, 5), [allMetrics]);

  const chartData = (historicalData || []).slice(-30).map((d: any) => ({
    date: (d.snapshot_date || d.date || '').slice(5),
    'Portföy (₺)': Number(d.total_value),
  }));

  return (
    <div className="fixed inset-0 bg-black text-white overflow-auto font-sans">
      {/* Sıcak ışık halkaları (yumuşak hareket) */}
      <motion.div
        className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-gold-500/10 blur-3xl pointer-events-none"
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full bg-emerald-500/10 blur-3xl pointer-events-none"
        animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-3xl pointer-events-none"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative w-full max-w-[1900px] mx-auto px-3 sm:px-5 md:px-8 lg:px-10 xl:px-14 py-3 sm:py-5 md:py-7 lg:py-8">
        {/* Üst şerit: tarih · saat · refresh (mobilde sıkıştırılır) */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 md:mb-6">
          <p className="font-serif text-[10px] sm:text-xs md:text-sm uppercase tracking-[0.25em] md:tracking-[0.3em] text-gold-400/80">
            ⊹ TANDOR FİNANS ⊹ <span className="text-gold-200/60 hidden sm:inline">{fmtDate(now)}</span>
          </p>
          <div className="flex items-center gap-3 sm:gap-4 md:gap-5">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <motion.span
                className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500"
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">CANLI</span>
            </div>
            <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black tabular-nums tracking-tight text-gold-300">
              {fmtTime(now)}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-gold-200/40">
              <motion.div animate={refreshing ? { rotate: 360 } : {}} transition={refreshing ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}>
                <RefreshCw size={11} />
              </motion.div>
              <span>{countdown}s</span>
            </div>
          </div>
        </div>

        {/* HERO — fluid scaling */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-gold-900/40 bg-gradient-to-br from-ink-950 to-ink-900 p-4 sm:p-6 md:p-8 lg:p-10 xl:p-12 mb-3 sm:mb-4 md:mb-5 shadow-2xl"
        >
          <p className="font-serif italic text-xs sm:text-sm md:text-base text-gold-300/60 mb-1 sm:mb-2">— Toplam Varlık —</p>
          <div className="flex items-end justify-between flex-wrap gap-3 md:gap-4">
            <div className="min-w-0 flex-1">
              {/* Akıcı font ölçeği: telefon → TV */}
              <p
                className="font-sans font-black tabular-nums leading-[0.9] tracking-[-0.04em] text-white whitespace-nowrap"
                style={{ fontSize: 'clamp(2.5rem, 11vw, 11rem)' }}
              >
                <span className="text-gold-400 mr-1 sm:mr-2 font-bold">₺</span>
                <AnimatedNumber value={grandTotal} format={fmtTRY} />
              </p>
              <p
                className="mt-1.5 sm:mt-2 md:mt-3 text-gold-100/60"
                style={{ fontSize: 'clamp(1rem, 2.2vw, 1.875rem)' }}
              >
                <span className="font-serif italic">≈</span>{' '}
                <span className="font-bold text-gold-50 tabular-nums">
                  $<AnimatedNumber value={grandTotalUSD} format={fmtUSD} />
                </span>{' '}
                <span className="font-serif italic opacity-50 text-[0.7em]">USD</span>
              </p>
            </div>

            {/* Daily badge — fluid */}
            <motion.div
              key={isPos ? 'pos' : 'neg'}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`inline-flex flex-col items-end gap-0.5 sm:gap-1 px-3 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 rounded-xl md:rounded-2xl border-2 flex-shrink-0 ${
                isPos ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-rose-500/50 bg-rose-500/10'
              }`}
            >
              <div
                className={`flex items-center gap-1 sm:gap-2 font-black ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}
                style={{ fontSize: 'clamp(1.25rem, 3vw, 2.5rem)' }}
              >
                {isPos ? <ArrowUpRight className="w-[1em] h-[1em]" /> : <ArrowDownRight className="w-[1em] h-[1em]" />}
                <span className="tabular-nums tracking-[-0.02em]">{isPos ? '+' : ''}{dailyPct.toFixed(2)}%</span>
              </div>
              <span
                className={`tabular-nums ${isPos ? 'text-emerald-300' : 'text-rose-300'}`}
                style={{ fontSize: 'clamp(0.7rem, 1vw, 1rem)' }}
              >
                {isPos ? '+' : ''}₺{fmtTRY(dailyChange)} bugün
              </span>
            </motion.div>
          </div>

          {/* Mini chart — boyut akıcı */}
          {chartData.length > 1 && (
            <div className="mt-3 sm:mt-4 md:mt-6" style={{ height: 'clamp(80px, 12vh, 180px)' }}>
              <AreaChart
                className="!h-full"
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
            </div>
          )}
        </motion.div>

        {/* KPI bandı 4'lü — mobilde 2x2, tablet+ 4'lü */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-5">
          {[
            { label: 'Toplam Kâr', icon: DollarSign, color: 'emerald',
              value: m.totalPnLPct, fmt: (n: number) => `+${n.toFixed(1)}%`, sub: `+₺${fmtTRY(m.totalPnLTRY)}` },
            { label: 'Bugün', icon: isPos ? TrendingUp : TrendingDown, color: isPos ? 'emerald' : 'rose',
              value: dailyChange, fmt: (n: number) => `${n >= 0 ? '+' : ''}₺${fmtTRY(n)}`, sub: `${(dailyPct).toFixed(2)}%` },
            { label: 'Pasif Gelir', icon: Wallet, color: 'blue',
              value: passiveYearlyUSD / 12, fmt: (n: number) => `$${fmtUSD(n)}`, sub: '/ay tahmini' },
            { label: 'Güvenli Max', icon: Gauge, color: 'gold',
              value: dynamic?.safeMonthlyUSD ?? 0, fmt: (n: number) => `$${fmtUSD(n)}`, sub: '/ay dinamik' },
          ].map((card) => {
            const Icon = card.icon;
            const colors: Record<string, { text: string; border: string; bg: string; ic: string }> = {
              emerald: { text: 'text-emerald-400', border: 'border-emerald-700/40', bg: 'bg-emerald-950/30', ic: 'text-emerald-400' },
              rose: { text: 'text-rose-400', border: 'border-rose-700/40', bg: 'bg-rose-950/30', ic: 'text-rose-400' },
              blue: { text: 'text-blue-400', border: 'border-blue-700/40', bg: 'bg-blue-950/30', ic: 'text-blue-400' },
              gold: { text: 'text-gold-400', border: 'border-gold-700/40', bg: 'bg-gold-950/30', ic: 'text-gold-400' },
            };
            const c = colors[card.color];
            return (
              <div key={card.label} className={`rounded-xl md:rounded-2xl border ${c.border} bg-ink-950/60 p-3 sm:p-4 md:p-5`}>
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
                  <div className={`w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl flex items-center justify-center ${c.bg}`}>
                    <Icon className={c.ic} size={15} />
                  </div>
                  <span className="font-serif italic text-[11px] sm:text-xs md:text-sm text-gold-200/60 truncate">{card.label}</span>
                </div>
                <p
                  className={`font-sans font-black tabular-nums tracking-[-0.02em] ${c.text}`}
                  style={{ fontSize: 'clamp(1.25rem, 3.5vw, 2.5rem)' }}
                >
                  <AnimatedNumber value={card.value} format={card.fmt} />
                </p>
                <p className="text-[10px] sm:text-xs text-gold-200/40 mt-0.5 sm:mt-1 tabular-nums truncate">{card.sub}</p>
              </div>
            );
          })}
        </div>

        {/* Top movers — kazananlar / kaybedenler */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {/* Kazananlar */}
          <div className="rounded-2xl border border-emerald-900/40 bg-ink-950/60 p-5">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-emerald-900/30">
              <p className="font-serif italic text-base text-emerald-300/80">En İyi Pozisyonlar</p>
              <span className="text-xs text-emerald-500/50 uppercase tracking-wider">Top 5</span>
            </div>
            <div className="space-y-2">
              <AnimatePresence>
                {topGainers.map((h, i) => (
                  <motion.div
                    key={h.holding.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 py-1.5"
                  >
                    <span className="font-serif italic text-sm text-emerald-500/40 w-5">{i + 1}.</span>
                    <span className="font-bold text-white w-20">{h.holding.symbol}</span>
                    <span className="text-xs text-gold-200/40 flex-1 truncate">{h.holding.asset_type}</span>
                    <span className="text-sm font-semibold text-gold-100/70 tabular-nums">₺{fmtTRY(h.valueTRY)}</span>
                    <span className="font-sans font-black text-emerald-400 tabular-nums w-20 text-right">+{h.pnlPct.toFixed(1)}%</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Kaybedenler */}
          <div className="rounded-2xl border border-rose-900/40 bg-ink-950/60 p-5">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-rose-900/30">
              <p className="font-serif italic text-base text-rose-300/80">En Kötü Pozisyonlar</p>
              <span className="text-xs text-rose-500/50 uppercase tracking-wider">Top 5</span>
            </div>
            <div className="space-y-2">
              {topLosers.length === 0 ? (
                <p className="text-center text-emerald-400/60 italic py-6 font-serif">
                  ✦ Tüm pozisyonlar yeşilde ✦
                </p>
              ) : (
                <AnimatePresence>
                  {topLosers.map((h, i) => (
                    <motion.div
                      key={h.holding.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3 py-1.5"
                    >
                      <span className="font-serif italic text-sm text-rose-500/40 w-5">{i + 1}.</span>
                      <span className="font-bold text-white w-20">{h.holding.symbol}</span>
                      <span className="text-xs text-gold-200/40 flex-1 truncate">{h.holding.asset_type}</span>
                      <span className="text-sm font-semibold text-gold-100/70 tabular-nums">₺{fmtTRY(h.valueTRY)}</span>
                      <span className="font-sans font-black text-rose-400 tabular-nums w-20 text-right">{h.pnlPct.toFixed(1)}%</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>

        {/* Alt durum çubuğu */}
        <div className="mt-6 flex items-center justify-between text-xs text-gold-200/30">
          <div className="flex items-center gap-2">
            <Wifi size={12} />
            <span>Sunucu bağlantısı aktif</span>
          </div>
          <div className="font-serif italic">
            Otomatik yenileme: her {REFRESH_SEC} saniye · son güncelleme {fmtTime(lastRefreshRef.current)}
          </div>
        </div>
      </div>
    </div>
  );
}
