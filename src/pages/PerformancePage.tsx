import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Calendar } from 'lucide-react';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
} from 'recharts';
import { getHistoricalSnapshots, PortfolioSnapshot } from '../services/analyticsService';
import { formatCurrency } from '../services/priceService';

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
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>(30);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

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

  const chartData = useMemo(() => {
    return snapshots.map((s) => ({
      date: s.date,
      dateLabel: formatDateTR(s.date),
      value: s.total_value,
      investment: s.total_investment,
    }));
  }, [snapshots]);

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-md"
          >
            <ArrowLeft size={18} />
            Geri
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <TrendingUp size={24} className="text-blue-600" />
            Performans
          </h1>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2 mb-6">
          <Calendar size={16} className="text-gray-500 dark:text-gray-400" />
          <div className="flex gap-1 bg-white dark:bg-gray-800 rounded-lg p-1 shadow-sm">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  period === opt.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6">
          {loading ? (
            <div className="flex items-center justify-center h-72">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-72 text-gray-500 dark:text-gray-400">
              Bu döneme ait veri bulunamadı.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
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
                  tick={{ fontSize: 12, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatCurrency(v, 0)}
                  width={90}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          {formatTooltipDate(data.date)}
                        </p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                          {formatCurrency(data.value)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={isPositive ? '#22c55e' : '#ef4444'}
                  strokeWidth={2.5}
                  fill="url(#valueGradient)"
                  name="Portföy Değeri"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2 }}
                />
              </AreaChart>
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
