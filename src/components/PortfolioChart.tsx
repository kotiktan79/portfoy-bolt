import { useState } from 'react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush } from 'recharts';
import { format } from 'date-fns';
import { PortfolioSnapshot } from '../services/analyticsService';
import { Activity, TrendingUp, BarChart3 } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import { chartChrome, fmtAxisTRY, fmtTRY0, paddedDomain } from '../lib/chartTheme';

interface PortfolioChartProps {
  data: PortfolioSnapshot[];
  type?: 'line' | 'area' | 'bar';
  showControls?: boolean;
}

export function PortfolioChart({ data, type: initialType = 'area', showControls = true }: PortfolioChartProps) {
  const [chartType, setChartType] = useState<'line' | 'area' | 'bar'>(initialType);
  // Kapalı başlar: K/Z serisi (≈₺1,3M) değer serisiyle (≈₺7M+) aynı eksende
  // trendi eziyor; isteyen aç/kapa yapabilir.
  const [showPnL, setShowPnL] = useState(false);
  const { isDark } = useDarkMode();
  const chrome = chartChrome(isDark);
  const axisTick = { fontSize: 12, fill: chrome.axis };
  const brushProps = {
    dataKey: 'date', height: 22, stroke: chrome.neutralLine,
    fill: 'transparent', travellerWidth: 8,
    tickFormatter: () => '',
  } as const;

  const chartData = data
    .filter((snapshot) => snapshot.date)
    .map((snapshot) => {
      try {
        return {
          date: format(new Date(snapshot.date), 'dd MMM'),
          value: Number(snapshot.total_value) || 0,
          investment: Number(snapshot.total_investment) || 0,
          pnl: Number(snapshot.total_pnl) || 0,
        };
      } catch (error) {
        console.error('Error formatting date:', snapshot.date, error);
        return null;
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  interface TooltipItem { dataKey?: string | number; value?: number; payload: { date: string; pnl?: number } }
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: TooltipItem[] }) => {
    if (active && payload && payload.length) {
      const valueData = payload.find((p) => p.dataKey === 'value');
      const investmentData = payload.find((p) => p.dataKey === 'investment');

      if (!valueData || !investmentData) return null;

      // Snapshot'ın total_pnl'ini DOĞRUDAN kullan (kâr-bazlı tek kaynak).
      // value − investment ile recompute snapshot'taki resmi total_pnl ile uyuşmayabilir
      // (örn. total_investment NULL veya geçici 0 ise tüm değer fake kâr gibi görünür).
      const pnl = Number(payload[0].payload.pnl) || 0;

      return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-slate-200 dark:border-gray-700">
          <p className="text-sm font-semibold text-slate-700 dark:text-gray-200 mb-2">{payload[0].payload.date}</p>
          <div className="space-y-1">
            <p className="text-sm text-slate-600 dark:text-gray-400">
              Değer: <span className="font-bold tabular-nums text-slate-900 dark:text-gray-100">{fmtTRY0(valueData.value ?? 0)}</span>
            </p>
            <p className="text-sm text-slate-600 dark:text-gray-400">
              Yatırım: <span className="font-bold tabular-nums text-slate-900 dark:text-gray-100">{fmtTRY0(investmentData.value ?? 0)}</span>
            </p>
            <p className="text-sm text-slate-600 dark:text-gray-400">
              K/Z: <span className={`font-bold tabular-nums ${pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {pnl >= 0 ? '+' : ''}{fmtTRY0(pnl)}
              </span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    if (chartType === 'bar') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={2}>
            <CartesianGrid vertical={false} stroke={chrome.grid} />
            <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={fmtAxisTRY} width={64} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="value" fill="#6366f1" name="Portföy Değeri" radius={[4, 4, 0, 0]} />
            <Bar dataKey="investment" fill={chrome.neutralLine} name="Yatırım" radius={[4, 4, 0, 0]} />
            {showPnL && <Bar dataKey="pnl" fill={chrome.positive} name="Kar/Zarar" radius={[4, 4, 0, 0]} />}
            <Brush {...brushProps} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/>
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={chrome.grid} />
          <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={fmtAxisTRY} width={64} domain={paddedDomain} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#6366f1"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorValue)"
            name="Portföy Değeri"
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2 }}
          />
          <Area
            type="monotone"
            dataKey="investment"
            stroke={chrome.neutralLine}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            fill="none"
            name="Yatırım"
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Brush {...brushProps} />
        </AreaChart>
      </ResponsiveContainer>
    );
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid vertical={false} stroke={chrome.grid} />
          <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={fmtAxisTRY} width={64} domain={showPnL ? undefined : paddedDomain} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, stroke: '#6366f1', strokeWidth: 2 }}
            name="Portföy Değeri"
          />
          <Line
            type="monotone"
            dataKey="investment"
            stroke={chrome.neutralLine}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4 }}
            name="Yatırım"
            strokeDasharray="5 4"
          />
          {showPnL && (
            <Line
              type="monotone"
              dataKey="pnl"
              stroke={chrome.positive}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              name="Kar/Zarar"
            />
          )}
          <Brush {...brushProps} />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {showControls && (
        <div className="flex items-center justify-between flex-wrap gap-3 flex-shrink-0">
          <div className="inline-flex gap-0.5 bg-slate-100 dark:bg-gray-800 rounded-lg p-1">
            {([
              { key: 'area', label: 'Alan', Icon: Activity },
              { key: 'line', label: 'Çizgi', Icon: TrendingUp },
              { key: 'bar', label: 'Çubuk', Icon: BarChart3 },
            ] as const).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setChartType(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  chartType === key
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200'
                }`}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPnL}
              onChange={(e) => setShowPnL(e.target.checked)}
              className="w-4 h-4 text-brand-600 rounded focus:ring-2 focus:ring-brand-500"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-gray-300">
              Kar/Zarar Göster
            </span>
          </label>
        </div>
      )}
      <div className="flex-1 min-h-0">
        {renderChart()}
      </div>
    </div>
  );
}
