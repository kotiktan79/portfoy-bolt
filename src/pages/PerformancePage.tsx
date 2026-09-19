import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Calendar, BarChart3 } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  Line,
  Legend,
  ComposedChart,
} from 'recharts';
// PERFORMANS — TEK CETVEL: EURO (2026-09-19 gece). Grafik = euro servet; kâr = euro servet artışı − dış akış
// (eurPnlService, GIPS/IAS 21). TL sadece '≈ ₺ (kur dahil)' ikincil bilgi. 'En yüksek/En düşük' kaldırıldı
// (deposit merdiveni yüzünden kâr sanılıyordu). TotalAttribution/DailyGainPanel TL şişik → euro sürümü gelene kadar sayfada değil.
import { getEurDaily, getEurPnlHealth, RELIABLE_FROM, type EurDaily } from '../services/eurPnlService';
import { usePortfolio } from '../contexts/PortfolioContext';
import { DailyMonthlyPnL } from '../components/DailyMonthlyPnL';
import { MonthlyAttribution } from '../components/MonthlyAttribution';
import { RiskMetricsPanel } from '../components/RiskMetricsPanel';
import { InceptionPnl } from '../components/InceptionPnl';
import {
  getBenchmarkHistory,
  BENCHMARK_OPTIONS,
  BenchmarkKey,
  BenchmarkPoint,
} from '../services/benchmarkService';
import { useDarkMode } from '../hooks/useDarkMode';
import { chartChrome, fmtEUR0, fmtSignedEUR0, fmtAxisEUR, paddedDomain } from '../lib/chartTheme';

type Period = 7 | 30 | 90 | 9999;

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: '7 gün', value: 7 },
  { label: '30 gün', value: 30 },
  { label: '90 gün', value: 90 },
  { label: 'Tümü', value: 9999 },
];

const MONTH_NAMES_TR = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

function formatDateTR(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTH_NAMES_TR[d.getMonth()]}`;
}

function formatTooltipDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTH_NAMES_TR[d.getMonth()]} ${d.getFullYear()}`;
}

export default function PerformancePage() {
  const { holdings } = usePortfolio();
  const { isDark } = useDarkMode();
  const chrome = chartChrome(isDark);
  const [period, setPeriod] = useState<Period>(30);
  const [allDaily, setAllDaily] = useState<EurDaily[]>([]);
  const [health, setHealth] = useState<{ ok: boolean; lastEurRateDay: string; lastSnapDay: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [benchmarkKey, setBenchmarkKey] = useState<BenchmarkKey | null>(null);
  const [benchmarkSeries, setBenchmarkSeries] = useState<BenchmarkPoint[]>([]);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getEurDaily(), getEurPnlHealth()]).then(([d, h]) => {
      if (!cancelled) { setAllDaily(d); setHealth(h); }
    }).catch((e) => {
      // motor hatası (kur/satır) — sessiz yarım veri yerine boş seri + sağlık uyarısı
      if (!cancelled) { setAllDaily([]); setHealth({ ok: false, lastEurRateDay: '', lastSnapDay: String(e?.message || 'hata') }); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Dönem = takvim günü filtresi (eski kod son N satır alıyordu). 'Tümü' = RELIABLE_FROM'dan itibaren.
  const snapshots = useMemo(() => {
    if (!allDaily.length) return [] as EurDaily[];
    if (period === 9999) return allDaily;
    // Saat diliminden bağımsız: tarih aritmetiğini UTC'de yap (toISOString UTC'ye çevirdiği için
    // yerel Date kullanılınca Bükreş'te cutoff 1 gün kayıyordu — hakem bulgusu 2026-09-19).
    const [y, m, d0] = allDaily[allDaily.length - 1].date.split('-').map(Number);
    const cutoff = new Date(Date.UTC(y, m - 1, d0 - period));
    const iso = cutoff.toISOString().slice(0, 10);
    return allDaily.filter(d => d.date >= iso);
  }, [allDaily, period]);

  useEffect(() => {
    if (!benchmarkKey) {
      setBenchmarkSeries([]);
      return;
    }
    let cancelled = false;
    setBenchmarkLoading(true);
    const days = period === 9999 ? 1825 : period;
    getBenchmarkHistory(benchmarkKey, days).then((data) => {
      if (!cancelled) {
        setBenchmarkSeries(data?.series || []);
        setBenchmarkLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [benchmarkKey, period]);

  const chartData = useMemo(() => {
    if (snapshots.length === 0) return [];

    // Benchmark native fiyatı → EURO: XU100 TL ÷ EUR/TRY; SPX & GOLD USD × USD/TRY ÷ EUR/TRY (o günün kurları)
    const benchmarkMap: Record<string, number> = {};
    for (const p of benchmarkSeries) benchmarkMap[p.date] = p.value;
    const toEur = (d: EurDaily, v: number) => benchmarkKey === 'XU100' ? v / d.eurRate : (v * d.usdRate) / d.eurRate;
    let benchmarkBase = 0;
    if (benchmarkKey && benchmarkSeries.length > 0) {
      const first = snapshots.find(d => benchmarkMap[d.date] != null);
      if (first) benchmarkBase = toEur(first, benchmarkMap[first.date]);
    }
    // Portföy endeksi = akış-düzeltmeli TWR zinciri (GIPS): idx_t = idx_{t−1} × (1 + gain_t / wealth_{t−1})
    let idx = 100;
    return snapshots.map((s, i) => {
      if (i > 0 && snapshots[i - 1].wealthEUR > 0) idx *= 1 + s.gainEUR / snapshots[i - 1].wealthEUR;
      const benchValue = benchmarkMap[s.date];
      return {
        date: s.date,
        dateLabel: formatDateTR(s.date),
        value: s.wealthEUR,
        valueTRY: s.totalValueTRY,
        eurRate: s.eurRate,
        portfolioIdx: idx,
        benchmarkIdx: benchmarkKey && benchValue && benchmarkBase > 0 ? (toEur(s, benchValue) / benchmarkBase) * 100 : null,
      };
    });
  }, [snapshots, benchmarkSeries, benchmarkKey]);

  const stats = useMemo(() => {
    if (snapshots.length === 0)
      return { startValue: 0, endValue: 0, gainEUR: 0, twrPct: 0, rateStart: 0, rateEnd: 0 };
    const startValue = snapshots[0].wealthEUR;
    const endValue = snapshots[snapshots.length - 1].wealthEUR;
    // Dönem kârı = günlük euro kazançların toplamı (ilk gün başlangıç; koyduğun/çektiğin para hariç)
    const gainEUR = snapshots.slice(1).reduce((s, d) => s + d.gainEUR, 0);
    const twrPct = chartData.length ? chartData[chartData.length - 1].portfolioIdx - 100 : 0;
    return { startValue, endValue, gainEUR, twrPct, rateStart: snapshots[0].eurRate, rateEnd: snapshots[snapshots.length - 1].eurRate };
  }, [snapshots, chartData]);

  const isPositive = stats.gainEUR >= 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50/40 via-white to-accent-50/30 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <PageHeader
          icon={TrendingUp}
          title="Performans"
          subtitle="Euro servet trendi ve benchmark karşılaştırması (€) — kâr, koyduğun/çektiğin para hariç"
        />

        {/* Period selector */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-500 dark:text-gray-400" />
            <div className="flex gap-1 bg-white dark:bg-gray-800 rounded-lg p-1 shadow-sm">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    period === opt.value
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-gray-500 dark:text-gray-400" />
            <div className="flex gap-1 bg-white dark:bg-gray-800 rounded-lg p-1 shadow-sm">
              <button
                onClick={() => setBenchmarkKey(null)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  benchmarkKey === null
                    ? 'bg-gray-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                Karşılaştırma yok
              </button>
              {BENCHMARK_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setBenchmarkKey(opt.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    benchmarkKey === opt.key
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {benchmarkLoading && (
              <span className="text-[10px] text-gray-400">yükleniyor…</span>
            )}
          </div>
        </div>

        {health && !health.ok && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
            Kur serisi {health.lastEurRateDay}'de bitiyor, kayıtlar {health.lastSnapDay}'e kadar — bu sayfadaki rakamlar güvenilmez.
          </div>
        )}
        {/* Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6">
          {loading ? (
            <div className="h-72 rounded-xl bg-gradient-to-b from-slate-100 to-slate-200 dark:from-gray-800 dark:to-gray-900 animate-pulse" />
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-72 text-gray-500 dark:text-gray-400">
              Bu döneme ait veri bulunamadı.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              {/* Benchmark seçiliyken İKİ ölçek tek eksende buluşur: ikisi de
                  dönem başı = 100 endeksi. Çift y-ekseni (₺ + endeks) okunaksız
                  ve yanıltıcıydı. */}
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={chrome.grid} />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 12, fill: chrome.axis }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12, fill: chrome.axis }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => (benchmarkKey ? v.toFixed(0) : fmtAxisEUR(v))}
                  domain={paddedDomain}
                  width={benchmarkKey ? 50 : 70}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 space-y-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatTooltipDate(data.date)}
                        </p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                          Portföy: {fmtEUR0(data.value)}
                          <span className="ml-2 text-xs text-gray-500">(idx {data.portfolioIdx?.toFixed(1)})</span>
                        </p>
                        <p className="text-[11px] text-gray-400">≈ ₺{Math.round(data.valueTRY).toLocaleString('tr-TR')} (kur dahil) · EUR/TL {data.eurRate.toFixed(2)}</p>
                        {data.benchmarkIdx != null && benchmarkKey && (
                          <p className="text-sm font-bold text-brand-600 dark:text-brand-400">
                            {BENCHMARK_OPTIONS.find((b) => b.key === benchmarkKey)?.label}: idx {data.benchmarkIdx.toFixed(1)}
                            <span className="ml-2 text-xs text-gray-500">
                              ({data.portfolioIdx > data.benchmarkIdx ? '+' : ''}
                              {(data.portfolioIdx - data.benchmarkIdx).toFixed(1)} pp)
                            </span>
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                {benchmarkKey && <Legend wrapperStyle={{ fontSize: 12 }} />}
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey={benchmarkKey ? 'portfolioIdx' : 'value'}
                  stroke={isPositive ? '#22c55e' : '#ef4444'}
                  strokeWidth={2}
                  fill="url(#valueGradient)"
                  name="Portföy"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2 }}
                />
                {benchmarkKey && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="benchmarkIdx"
                    stroke="#6366f1"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                    activeDot={{ r: 4 }}
                    name={BENCHMARK_OPTIONS.find((b) => b.key === benchmarkKey)?.label || 'Benchmark'}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Stats grid */}
        {!loading && chartData.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Dönem başı servet" value={fmtEUR0(stats.startValue)} />
            <StatCard label="Şu anki servet" value={fmtEUR0(stats.endValue)} />
            <StatCard
              label="Dönem kârı (para hariç)"
              value={fmtSignedEUR0(stats.gainEUR)}
              sub={`${stats.twrPct >= 0 ? '+' : ''}${stats.twrPct.toFixed(2)}% getiri`}
              color={isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
            />
            <StatCard
              label="Kur EUR/TL (bilgi, kâr değil)"
              value={`${stats.rateStart.toFixed(2)} → ${stats.rateEnd.toFixed(2)}`}
              sub={`TL ${stats.rateEnd >= stats.rateStart ? '−' : '+'}${Math.abs(100 * (stats.rateEnd / stats.rateStart - 1)).toFixed(1)}%`}
            />
            <StatCard label="Veri noktası" value={`${snapshots.length} gün`} sub={period === 9999 ? `${RELIABLE_FROM}'dan` : undefined} />
          </div>
        )}

        {/* Bu ay — kâr nereden, para nereden? */}
        {holdings.length > 0 && (
          <div className="mt-6">
            <MonthlyAttribution holdings={holdings} />
          </div>
        )}

        {/* Deposit-arındırılmış risk metrikleri (tüm geçmiş) */}
        <div className="mt-6">
          <RiskMetricsPanel />
        </div>

        {/* Kuruluştan bugüne — alış günü kuruyla euro kâr */}
        <div className="mt-6"><InceptionPnl /></div>

        {/* Günlük/haftalık/aylık geçmiş (euro) */}
        {holdings.length > 0 && (
          <div className="mt-6">
            <DailyMonthlyPnL />
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color || 'text-gray-900 dark:text-white'}`}>
        {value}
      </p>
      {sub && (
        <p className={`text-sm font-medium mt-0.5 ${color || 'text-gray-600 dark:text-gray-300'}`}>
          {sub}
        </p>
      )}
    </div>
  );
}
