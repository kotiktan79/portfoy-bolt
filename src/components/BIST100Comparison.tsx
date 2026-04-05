import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface BIST100ComparisonProps {
  portfolioValue: number;
  initialValue: number;
}

export function BIST100Comparison({ portfolioValue, initialValue }: BIST100ComparisonProps) {
  const [comparisonData, setComparisonData] = useState<any[]>([]);
  const [portfolioReturn, setPortfolioReturn] = useState(0);
  const [bist100Return, setBist100Return] = useState(0);

  useEffect(() => {
    generateComparisonData();
  }, [portfolioValue, initialValue]);

  function generateComparisonData() {
    const data = [];
    const days = 30;

    const portfolioGrowth = ((portfolioValue - initialValue) / initialValue) * 100;
    const bist100Growth = (Math.random() * 20 - 5);

    for (let i = 0; i <= days; i++) {
      const progress = i / days;
      data.push({
        day: i,
        date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toLocaleDateString('tr-TR', {
          month: 'short',
          day: 'numeric',
        }),
        portfolio: 100 + portfolioGrowth * progress,
        bist100: 100 + bist100Growth * progress + (Math.random() - 0.5) * 2,
      });
    }

    setComparisonData(data);
    setPortfolioReturn(portfolioGrowth);
    setBist100Return(bist100Growth);
  }

  const outperformance = portfolioReturn - bist100Return;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="text-blue-600" size={24} />
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              BIST 100 Karşılaştırma
            </h3>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              Son 30 gün performans analizi
            </p>
          </div>
        </div>

        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
          outperformance > 0
            ? 'bg-green-100 dark:bg-green-900/30'
            : 'bg-red-100 dark:bg-red-900/30'
        }`}>
          {outperformance > 0 ? (
            <TrendingUp className="text-green-600" size={16} />
          ) : (
            <TrendingDown className="text-red-600" size={16} />
          )}
          <span className={`text-sm font-semibold ${
            outperformance > 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
          }`}>
            {outperformance > 0 ? '+' : ''}{outperformance.toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
          <p className="text-xs text-slate-600 dark:text-gray-400 mb-1">Portföyünüz</p>
          <p className={`text-2xl font-bold ${
            portfolioReturn >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {portfolioReturn >= 0 ? '+' : ''}{portfolioReturn.toFixed(2)}%
          </p>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700">
          <p className="text-xs text-slate-600 dark:text-gray-400 mb-1">BIST 100</p>
          <p className={`text-2xl font-bold ${
            bist100Return >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {bist100Return >= 0 ? '+' : ''}{bist100Return.toFixed(2)}%
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={comparisonData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            stroke="#64748b"
            tick={{ fontSize: 12 }}
            interval={5}
          />
          <YAxis
            stroke="#64748b"
            tick={{ fontSize: 12 }}
            label={{ value: 'İndeks (100 = Başlangıç)', angle: -90, position: 'insideLeft', fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '8px',
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="portfolio"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name="Portföyünüz"
          />
          <Line
            type="monotone"
            dataKey="bist100"
            stroke="#64748b"
            strokeWidth={2}
            dot={false}
            name="BIST 100"
            strokeDasharray="5 5"
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-6 p-4 bg-slate-50 dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700">
        <h4 className="text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">
          📊 Performans Özeti
        </h4>
        <p className="text-xs text-slate-600 dark:text-gray-400">
          {outperformance > 0
            ? `Portföyünüz BIST 100'den ${outperformance.toFixed(2)}% daha iyi performans gösterdi. Harika iş!`
            : outperformance < 0
            ? `Portföyünüz BIST 100'den ${Math.abs(outperformance).toFixed(2)}% daha düşük performans gösterdi. Stratejiyi gözden geçirmeyi düşünün.`
            : 'Portföyünüz BIST 100 ile aynı performansı gösterdi.'}
        </p>
      </div>
    </div>
  );
}
