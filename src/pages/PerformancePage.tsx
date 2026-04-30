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
import { getHistoricalSnapshots, PortfolioSnapshot } from '../services/analyticsService';
import { formatCurrency } from '../services/priceService';
import { usePortfolio } from '../contexts/PortfolioContext';
import { DailyGainPanel } from '../components/DailyGainPanel';
import { DailyMonthlyPnL } from '../components/DailyMonthlyPnL';
import {
  getBenchmarkHistory,
  BENCHMARK_OPTIONS,
  BenchmarkKey,
  BenchmarkPoint,
} from '../services/benchmarkService';

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
  const { holdings, livePnlData } = usePortfolio();
  const [period, setPeriod] = useState<Period>(30);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [benchmarkKey, setBenchmarkKey] = useState<BenchmarkKey | null>(null);
  const [benchmarkSeries, setBenchmarkSeries] = useState<BenchmarkPoint[]>([]);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getHistoricalSnapshots(period === 9999 ? 10000 : period).then((data) => {
      if (!cancelled) {
        setSnapshots(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [period]);

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

    const portfolioBase = snapshots[0].total_value;
    const benchmarkMap: Record<string, number> = {};
    for (const p of benchmarkSeries) benchmarkMap[p.date] = p.value;

    let benchmarkBase = 0;
    if (benchmarkKey && benchmarkSeries.length > 0) {
      const firstSnapDate = snapshots[0].date;
      const firstAvailable =
        benchmarkSeries.find((p) => p.date >= firstSnapDate) || benchmarkSeries[0];
      benchmarkBase = firstAvailable?.value || 0;
    }

    return snapshots.map((s) => {
      const benchValue = benchmarkMap[s.date];
      return {
        date: s.date,
        dateLabel: formatDateTR(s.date),
        value: s.total_value,
        investment: s.total_investment,
        portfolioIdx: portfolioBase > 0 ? (s.total_value / portfolioBase) * 100 : 100,
        benchmarkIdx:
          benchmarkKey && benchValue && benchmarkBase > 0
            ? (benchValue / benchmarkBase) * 100
            : null,
      };
    });
  }, [snapshots, benchmarkSeries, benchmarkKey]);

  const stats = useMemo(() => {
    if (snapshots.length === 0)
      return { startValue: 0, endValue: 0, changeTL: 0, changePct: 0, highest: 0, lowest: 0 };

    const startValue = snapshots[0].total_value;
    const endValue = snapshots[snapshots.length - 1].total_value;
    const changeTL = endValue - startValue;
    const changePct = startValue > 0 ? (changeTL / startValue) * 100 : 0;
    const values = snapshots.map((s) => s.total_value);
    const highest = Math.max(...values);
    const lowest = Math.min(...values);

    return { startValue, endValue, changeTL, changePct, highest, lowest };
  }, [snapshots]);

  const isPositive = stats.changeTL >= 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50/40 via-white to-accent-50/30 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <PageHeader
          icon={TrendingUp}
          title="Performans"
          subtitle="Portföy değer trendi ve benchmark karşılaştırması"
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
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 12, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatCurrency(v, 0)}
                  width={90}
                />
                {benchmarkKey && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#6366f1' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v.toFixed(0)}`}
                    domain={['auto', 'auto']}
                    width={50}
                  />
                )}
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
                          Portföy: {formatCurrency(data.value)}
                          <span className="ml-2 text-xs text-gray-500">
                            (idx {data.portfolioIdx?.toFixed(1)})
                          </span>
                        </p>
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
                  dataKey="value"
                  stroke={isPositive ? '#22c55e' : '#ef4444'}
                  strokeWidth={2.5}
                  fill="url(#valueGradient)"
                  name="Portföy"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2 }}
                />
                {benchmarkKey && (
                  <Line
                    yAxisId="right"
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
            <StatCard
              label="Dönem başı değer"
              value={formatCurrency(stats.startValue)}
            />
            <StatCard
              label="Şu anki değer"
              value={formatCurrency(stats.endValue)}
            />
            <StatCard
              label="Değişim"
              value={`${isPositive ? '+' : ''}${formatCurrency(stats.changeTL)}`}
              sub={`${isPositive ? '+' : ''}${stats.changePct.toFixed(2)}%`}
              color={isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
            />
            <StatCard
              label="En yüksek"
              value={formatCurrency(stats.highest)}
              color="text-green-600 dark:text-green-400"
            />
            <StatCard
              label="En düşük"
              value={formatCurrency(stats.lowest)}
              color="text-red-600 dark:text-red-400"
            />
            <StatCard
              label="Veri noktası"
              value={`${snapshots.length} gün`}
            />
          </div>
        )}

        {/* Bugünün kazananları/kaybedenleri + günlük/haftalık/aylık geçmiş tablosu */}
        {holdings.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            <DailyGainPanel
              holdings={holdings}
              totalDailyChange={livePnlData?.daily.change ?? 0}
              totalDailyPct={livePnlData?.daily.percentage ?? 0}
            />
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
