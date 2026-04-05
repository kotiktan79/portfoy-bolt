import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface MultiBenchmarkProps {
  portfolioValue: number;
  initialValue: number;
}

interface BenchmarkData {
  name: string;
  return: number;
  color: string;
}

export function MultiBenchmark({ portfolioValue, initialValue }: MultiBenchmarkProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkData[]>([]);
  const [period, setPeriod] = useState<'1m' | '3m' | '6m' | '1y'>('1m');

  useEffect(() => {
    generateBenchmarkData();
  }, [portfolioValue, initialValue, period]);

  function generateBenchmarkData() {
    const days = period === '1m' ? 30 : period === '3m' ? 90 : period === '6m' ? 180 : 365;

    const portfolioReturn = ((portfolioValue - initialValue) / initialValue) * 100;

    const benchmarkReturns = {
      bist100: (Math.random() * 30 - 10),
      bist30: (Math.random() * 35 - 12),
      sp500: (Math.random() * 25 - 5),
      nasdaq: (Math.random() * 30 - 8),
      gold: (Math.random() * 20 - 5),
      btc: (Math.random() * 80 - 30),
    };

    const data = [];
    for (let i = 0; i <= days; i++) {
      const progress = i / days;
      data.push({
        day: i,
        date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toLocaleDateString('tr-TR', {
          month: 'short',
          day: 'numeric',
        }),
        portfolio: 100 + portfolioReturn * progress,
        bist100: 100 + benchmarkReturns.bist100 * progress + (Math.random() - 0.5) * 2,
        bist30: 100 + benchmarkReturns.bist30 * progress + (Math.random() - 0.5) * 2,
        sp500: 100 + benchmarkReturns.sp500 * progress + (Math.random() - 0.5) * 1.5,
        nasdaq: 100 + benchmarkReturns.nasdaq * progress + (Math.random() - 0.5) * 2,
        gold: 100 + benchmarkReturns.gold * progress + (Math.random() - 0.5) * 1,
        btc: 100 + benchmarkReturns.btc * progress + (Math.random() - 0.5) * 5,
      });
    }

    setChartData(data);

    setBenchmarks([
      { name: 'Portföyünüz', return: portfolioReturn, color: '#3b82f6' },
      { name: 'BIST 100', return: benchmarkReturns.bist100, color: '#64748b' },
      { name: 'BIST 30', return: benchmarkReturns.bist30, color: '#8b5cf6' },
      { name: 'S&P 500', return: benchmarkReturns.sp500, color: '#10b981' },
      { name: 'NASDAQ', return: benchmarkReturns.nasdaq, color: '#f59e0b' },
      { name: 'Altın', return: benchmarkReturns.gold, color: '#eab308' },
      { name: 'Bitcoin', return: benchmarkReturns.btc, color: '#f97316' },
    ]);
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="text-blue-600" size={24} />
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Çoklu Benchmark Karşılaştırma
            </h3>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              Global endeksler ve varlıklar
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {(['1m', '3m', '6m', '1y'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                period === p
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'
              }`}
            >
              {p === '1m' ? '1A' : p === '3m' ? '3A' : p === '6m' ? '6A' : '1Y'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {benchmarks.map((benchmark, idx) => (
          <div
            key={idx}
            className="p-3 rounded-lg border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900"
          >
            <div className="flex items-center gap-1 mb-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: benchmark.color }}
              ></div>
              <p className="text-xs font-semibold text-slate-600 dark:text-gray-400 truncate">
                {benchmark.name}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {benchmark.return >= 0 ? (
                <TrendingUp className="text-green-500 flex-shrink-0" size={14} />
              ) : (
                <TrendingDown className="text-red-500 flex-shrink-0" size={14} />
              )}
              <span
                className={`text-sm font-bold ${
                  benchmark.return >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {benchmark.return >= 0 ? '+' : ''}
                {benchmark.return.toFixed(2)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            stroke="#64748b"
            tick={{ fontSize: 11 }}
            interval={Math.floor(chartData.length / 10)}
          />
          <YAxis
            stroke="#64748b"
            tick={{ fontSize: 11 }}
            label={{ value: 'İndeks (100 = Başlangıç)', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Line
            type="monotone"
            dataKey="portfolio"
            stroke="#3b82f6"
            strokeWidth={3}
            dot={false}
            name="Portföy"
          />
          <Line
            type="monotone"
            dataKey="bist100"
            stroke="#64748b"
            strokeWidth={2}
            dot={false}
            name="BIST 100"
          />
          <Line
            type="monotone"
            dataKey="sp500"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            name="S&P 500"
          />
          <Line
            type="monotone"
            dataKey="gold"
            stroke="#eab308"
            strokeWidth={2}
            dot={false}
            name="Altın"
          />
          <Line
            type="monotone"
            dataKey="btc"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 5"
            name="BTC"
          />
        </LineChart>
      </ResponsiveContainer>

      {benchmarks.length > 0 && (
        <div className="mt-6 p-4 bg-slate-50 dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700">
          <h4 className="text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">
            📊 Performans Özeti
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-600 dark:text-gray-400 mb-1">En İyi Performans</p>
              <p className="text-sm font-bold text-green-600">
                {benchmarks.reduce((max, b) => (b.return > max.return ? b : max), benchmarks[0]).name}
                {' '}
                (+{benchmarks.reduce((max, b) => (b.return > max.return ? b : max), benchmarks[0]).return.toFixed(2)}%)
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-600 dark:text-gray-400 mb-1">En Düşük Performans</p>
              <p className="text-sm font-bold text-red-600">
                {benchmarks.reduce((min, b) => (b.return < min.return ? b : min), benchmarks[0]).name}
                {' '}
                ({benchmarks.reduce((min, b) => (b.return < min.return ? b : min), benchmarks[0]).return.toFixed(2)}%)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
