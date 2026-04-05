import { useState } from 'react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush } from 'recharts';
import { format } from 'date-fns';
import { PortfolioSnapshot } from '../services/analyticsService';
import { Activity, TrendingUp, BarChart3 } from 'lucide-react';

interface PortfolioChartProps {
  data: PortfolioSnapshot[];
  type?: 'line' | 'area' | 'bar';
  showControls?: boolean;
}

export function PortfolioChart({ data, type: initialType = 'area', showControls = true }: PortfolioChartProps) {
  const [chartType, setChartType] = useState<'line' | 'area' | 'bar'>(initialType);
  const [showPnL, setShowPnL] = useState(true);

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

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const valueData = payload.find((p: any) => p.dataKey === 'value');
      const investmentData = payload.find((p: any) => p.dataKey === 'investment');

      if (!valueData || !investmentData) return null;

      return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-slate-200 dark:border-gray-700">
          <p className="text-sm font-semibold text-slate-700 dark:text-gray-200 mb-2">{payload[0].payload.date}</p>
          <div className="space-y-1">
            <p className="text-sm text-slate-600 dark:text-gray-400">
              Değer: <span className="font-bold text-slate-900 dark:text-gray-100">{valueData.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
            </p>
            <p className="text-sm text-slate-600 dark:text-gray-400">
              Yatırım: <span className="font-bold text-slate-900 dark:text-gray-100">{investmentData.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
            </p>
            <p className="text-sm text-slate-600 dark:text-gray-400">
              PnL: <span className={`font-bold ${(valueData.value - investmentData.value) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {(valueData.value - investmentData.value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
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
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" stroke="#64748b" style={{ fontSize: '12px' }} />
            <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="value" fill="#3b82f6" name="Portföy Değeri" radius={[8, 8, 0, 0]} />
            <Bar dataKey="investment" fill="#64748b" name="Yatırım" radius={[8, 8, 0, 0]} />
            {showPnL && <Bar dataKey="pnl" fill="#10b981" name="Kar/Zarar" radius={[8, 8, 0, 0]} />}
            <Brush dataKey="date" height={30} stroke="#3b82f6" />
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
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorInvestment" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#64748b" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="#64748b" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" stroke="#64748b" style={{ fontSize: '12px' }} />
          <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorValue)"
            name="Portföy Değeri"
          />
          <Area
            type="monotone"
            dataKey="investment"
            stroke="#64748b"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorInvestment)"
            name="Yatırım"
          />
          <Brush dataKey="date" height={30} stroke="#3b82f6" />
        </AreaChart>
      </ResponsiveContainer>
    );
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" stroke="#64748b" style={{ fontSize: '12px' }} />
          <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={3}
            dot={{ fill: '#3b82f6', r: 4 }}
            activeDot={{ r: 7, stroke: '#3b82f6', strokeWidth: 2 }}
            name="Portföy Değeri"
          />
          <Line
            type="monotone"
            dataKey="investment"
            stroke="#64748b"
            strokeWidth={2}
            dot={{ fill: '#64748b', r: 3 }}
            activeDot={{ r: 6 }}
            name="Yatırım"
            strokeDasharray="5 5"
          />
          {showPnL && (
            <Line
              type="monotone"
              dataKey="pnl"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ fill: '#10b981', r: 3 }}
              name="Kar/Zarar"
            />
          )}
          <Brush dataKey="date" height={30} stroke="#3b82f6" />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="space-y-4">
      {showControls && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => setChartType('area')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                chartType === 'area'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'
              }`}
            >
              <Activity size={16} />
              <span className="hidden sm:inline">Alan</span>
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                chartType === 'line'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'
              }`}
            >
              <TrendingUp size={16} />
              <span className="hidden sm:inline">Çizgi</span>
            </button>
            <button
              onClick={() => setChartType('bar')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                chartType === 'bar'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'
              }`}
            >
              <BarChart3 size={16} />
              <span className="hidden sm:inline">Çubuk</span>
            </button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showPnL}
              onChange={(e) => setShowPnL(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-gray-300">
              Kar/Zarar Göster
            </span>
          </label>
        </div>
      )}
      {renderChart()}
    </div>
  );
}
