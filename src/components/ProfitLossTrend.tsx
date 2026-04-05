import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { getHistoricalSnapshots } from '../services/analyticsService';
import { TrendingUp, Calendar } from 'lucide-react';

interface TrendData {
  date: string;
  value: number;
  investment: number;
  profit: number;
  profitPercentage: number;
}

export default function ProfitLossTrend() {
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<7 | 30 | 90 | 365>(30);

  useEffect(() => {
    loadTrendData();
  }, [period]);

  async function loadTrendData() {
    setLoading(true);
    try {
      const snapshots = await getHistoricalSnapshots(period);

      const data: TrendData[] = snapshots.map((snapshot) => ({
        date: new Date(snapshot.date).toLocaleDateString('tr-TR', {
          day: '2-digit',
          month: 'short'
        }),
        value: snapshot.total_value,
        investment: snapshot.total_investment,
        profit: snapshot.total_pnl,
        profitPercentage: snapshot.pnl_percentage,
      }));

      setTrendData(data);
    } catch (error) {
      console.error('Error loading trend data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="h-80 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Kar/Zarar Trendi</h2>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setPeriod(7)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              period === 7
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            7 Gün
          </button>
          <button
            onClick={() => setPeriod(30)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              period === 30
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            1 Ay
          </button>
          <button
            onClick={() => setPeriod(90)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              period === 90
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            3 Ay
          </button>
          <button
            onClick={() => setPeriod(365)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              period === 365
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            1 Yıl
          </button>
        </div>
      </div>

      {trendData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
          <Calendar className="w-16 h-16 mb-4 opacity-50" />
          <p>Bu dönem için veri bulunamadı</p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Portföy Değeri vs Yatırım</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorInvestment" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `₺${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: number) => `₺${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  labelStyle={{ color: '#000' }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorValue)"
                  name="Portföy Değeri"
                />
                <Area
                  type="monotone"
                  dataKey="investment"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#colorInvestment)"
                  name="Toplam Yatırım"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Kar/Zarar Gelişimi</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `${value.toFixed(0)}%`}
                />
                <Tooltip
                  formatter={(value: number) => `${value.toFixed(2)}%`}
                  labelStyle={{ color: '#000' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="profitPercentage"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Getiri Oranı"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {trendData.length > 0 && (
              <>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">En Yüksek Değer</p>
                  <p className="text-lg font-bold text-blue-900 dark:text-blue-300">
                    ₺{Math.max(...trendData.map(d => d.value)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                  <p className="text-sm text-red-600 dark:text-red-400 mb-1">En Düşük Değer</p>
                  <p className="text-lg font-bold text-red-900 dark:text-red-300">
                    ₺{Math.min(...trendData.map(d => d.value)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <p className="text-sm text-green-600 dark:text-green-400 mb-1">En Yüksek Getiri</p>
                  <p className="text-lg font-bold text-green-900 dark:text-green-300">
                    {Math.max(...trendData.map(d => d.profitPercentage)).toFixed(2)}%
                  </p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                  <p className="text-sm text-orange-600 dark:text-orange-400 mb-1">Ortalama Getiri</p>
                  <p className="text-lg font-bold text-orange-900 dark:text-orange-300">
                    {(trendData.reduce((sum, d) => sum + d.profitPercentage, 0) / trendData.length).toFixed(2)}%
                  </p>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
