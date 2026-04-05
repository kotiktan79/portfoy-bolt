import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart, Bar, ComposedChart } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { calculateRSI, calculateMACD, calculateBollingerBands } from '../services/technicalIndicators';

interface AdvancedChartProps {
  symbol: string;
  currentPrice: number;
}

interface ChartData {
  timestamp: number;
  time: string;
  price: number;
  rsi?: number;
  macd?: number;
  signal?: number;
  histogram?: number;
  upperBand?: number;
  middleBand?: number;
  lowerBand?: number;
}

export function AdvancedChart({ symbol, currentPrice }: AdvancedChartProps) {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [indicator, setIndicator] = useState<'rsi' | 'macd' | 'bollinger' | 'none'>('none');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    generateChartData();
  }, [symbol, currentPrice, indicator]);

  function generateChartData() {
    setLoading(true);
    const data: ChartData[] = [];
    const days = 100;

    const basePrices: number[] = [];
    for (let i = 0; i < days; i++) {
      const volatility = 0.02;
      const trend = 0.0005;
      const randomWalk = (Math.random() - 0.5) * volatility;
      const price = i === 0
        ? currentPrice * 0.9
        : basePrices[i - 1] * (1 + trend + randomWalk);
      basePrices.push(price);
    }

    let rsiValues: number[] = [];
    let macdData: { macd: number[]; signal: number[]; histogram: number[] } | null = null;
    let bollingerData: { upper: number[]; middle: number[]; lower: number[] } | null = null;

    if (indicator === 'rsi') {
      rsiValues = calculateRSI(basePrices, 14);
    } else if (indicator === 'macd') {
      macdData = calculateMACD(basePrices);
    } else if (indicator === 'bollinger') {
      bollingerData = calculateBollingerBands(basePrices, 20, 2);
    }

    for (let i = 0; i < days; i++) {
      const timestamp = Date.now() - (days - i) * 24 * 60 * 60 * 1000;
      const dataPoint: ChartData = {
        timestamp,
        time: new Date(timestamp).toLocaleDateString('tr-TR', {
          month: 'short',
          day: 'numeric',
        }),
        price: basePrices[i],
      };

      if (indicator === 'rsi' && rsiValues[i]) {
        dataPoint.rsi = rsiValues[i];
      } else if (indicator === 'macd' && macdData) {
        dataPoint.macd = macdData.macd[i];
        dataPoint.signal = macdData.signal[i];
        dataPoint.histogram = macdData.histogram[i];
      } else if (indicator === 'bollinger' && bollingerData) {
        dataPoint.upperBand = bollingerData.upper[i];
        dataPoint.middleBand = bollingerData.middle[i];
        dataPoint.lowerBand = bollingerData.lower[i];
      }

      data.push(dataPoint);
    }

    setChartData(data);
    setLoading(false);
  }

  const latestRSI = chartData.length > 0 && indicator === 'rsi' ? chartData[chartData.length - 1].rsi : null;
  const rsiSignal = latestRSI
    ? latestRSI > 70
      ? 'Aşırı Alım'
      : latestRSI < 30
      ? 'Aşırı Satım'
      : 'Nötr'
    : null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="text-blue-600" size={24} />
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {symbol} Teknik Analiz
            </h3>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              İleri seviye göstergeler
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {(['none', 'rsi', 'macd', 'bollinger'] as const).map((ind) => (
            <button
              key={ind}
              onClick={() => setIndicator(ind)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                indicator === ind
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'
              }`}
            >
              {ind === 'none' ? 'Temel' : ind.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-96 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {indicator === 'none' && (
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData}>
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
                  interval={Math.floor(chartData.length / 8)}
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
                  }}
                  formatter={(value: number) => [value.toFixed(2) + ' ₺', 'Fiyat']}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#colorPrice)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {indicator === 'rsi' && (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="time"
                    stroke="#64748b"
                    tick={{ fontSize: 12 }}
                    interval={Math.floor(chartData.length / 8)}
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fontSize: 12 }}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-slate-700 dark:text-gray-300">
                    RSI (14)
                  </h4>
                  {latestRSI && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {latestRSI.toFixed(2)}
                      </span>
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded ${
                          rsiSignal === 'Aşırı Alım'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : rsiSignal === 'Aşırı Satım'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-slate-100 text-slate-700 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {rsiSignal}
                      </span>
                    </div>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="time"
                      stroke="#64748b"
                      tick={{ fontSize: 12 }}
                      interval={Math.floor(chartData.length / 8)}
                    />
                    <YAxis stroke="#64748b" tick={{ fontSize: 12 }} domain={[0, 100]} />
                    <Tooltip />
                    <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" />
                    <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" />
                    <Line
                      type="monotone"
                      dataKey="rsi"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {indicator === 'macd' && (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="time"
                    stroke="#64748b"
                    tick={{ fontSize: 12 }}
                    interval={Math.floor(chartData.length / 8)}
                  />
                  <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>

              <div className="mt-4">
                <h4 className="text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">
                  MACD (12, 26, 9)
                </h4>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="time"
                      stroke="#64748b"
                      tick={{ fontSize: 12 }}
                      interval={Math.floor(chartData.length / 8)}
                    />
                    <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="histogram" fill="#94a3b8" />
                    <Line
                      type="monotone"
                      dataKey="macd"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="signal"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {indicator === 'bollinger' && (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="time"
                  stroke="#64748b"
                  tick={{ fontSize: 12 }}
                  interval={Math.floor(chartData.length / 8)}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 12 }}
                  domain={['auto', 'auto']}
                />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="upperBand"
                  stroke="#ef4444"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="middleBand"
                  stroke="#64748b"
                  strokeWidth={1}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="lowerBand"
                  stroke="#10b981"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </div>
  );
}
