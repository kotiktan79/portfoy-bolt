import { useState, useEffect } from 'react';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface CandleData {
  timestamp: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IntradayChartProps {
  symbol: string;
  currentPrice: number;
  assetType: string;
}

export function IntradayChart({ symbol, currentPrice }: IntradayChartProps) {
  const [candleData, setCandleData] = useState<CandleData[]>([]);
  const [timeRange, setTimeRange] = useState<'1h' | '4h' | '1d'>('4h');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadIntradayData();
    const interval = setInterval(loadIntradayData, 60000);
    return () => clearInterval(interval);
  }, [symbol, timeRange]);

  async function loadIntradayData() {
    setLoading(true);
    try {
      const now = Date.now();
      const intervals = timeRange === '1h' ? 60 : timeRange === '4h' ? 240 : 480;
      const mockData: CandleData[] = [];

      for (let i = intervals; i >= 0; i--) {
        const timestamp = now - i * 60000;
        const basePrice = currentPrice * (0.95 + Math.random() * 0.1);
        const volatility = 0.01;

        const open = basePrice;
        const close = basePrice * (1 + (Math.random() - 0.5) * volatility);
        const high = Math.max(open, close) * (1 + Math.random() * volatility);
        const low = Math.min(open, close) * (1 - Math.random() * volatility);

        mockData.push({
          timestamp,
          time: new Date(timestamp).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          open,
          high,
          low,
          close,
          volume: Math.floor(Math.random() * 1000000),
        });
      }

      setCandleData(mockData);
    } catch (error) {
      console.error('Error loading intraday data:', error);
    }
    setLoading(false);
  }

  const priceChange = candleData.length > 1
    ? candleData[candleData.length - 1].close - candleData[0].open
    : 0;
  const priceChangePercent = candleData.length > 1
    ? (priceChange / candleData[0].open) * 100
    : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Activity className="text-blue-600" size={20} />
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {symbol} İntraday
            </h3>
            <div className="flex items-center gap-2 mt-1">
              {priceChange >= 0 ? (
                <TrendingUp className="text-green-500" size={16} />
              ) : (
                <TrendingDown className="text-red-500" size={16} />
              )}
              <span className={`text-sm font-semibold ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {(['1h', '4h', '1d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                timeRange === range
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'
              }`}
            >
              {range.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={candleData}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="time"
              stroke="#64748b"
              tick={{ fontSize: 12 }}
              interval={Math.floor(candleData.length / 8)}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 12 }}
              domain={['auto', 'auto']}
              tickFormatter={(value) => value.toFixed(2)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px',
              }}
              formatter={(value: number) => [value.toFixed(2) + ' ₺', 'Fiyat']}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#colorPrice)"
            />
            <Line
              type="monotone"
              dataKey="high"
              stroke="#10b981"
              strokeWidth={1}
              dot={false}
              strokeDasharray="3 3"
            />
            <Line
              type="monotone"
              dataKey="low"
              stroke="#ef4444"
              strokeWidth={1}
              dot={false}
              strokeDasharray="3 3"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-gray-700">
        {candleData.length > 0 && (
          <>
            <div>
              <p className="text-xs text-slate-500 dark:text-gray-400">Açılış</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {candleData[0].open.toFixed(2)} ₺
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-gray-400">Yüksek</p>
              <p className="text-sm font-semibold text-green-600">
                {Math.max(...candleData.map(d => d.high)).toFixed(2)} ₺
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-gray-400">Düşük</p>
              <p className="text-sm font-semibold text-red-600">
                {Math.min(...candleData.map(d => d.low)).toFixed(2)} ₺
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-gray-400">Kapanış</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {candleData[candleData.length - 1].close.toFixed(2)} ₺
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
