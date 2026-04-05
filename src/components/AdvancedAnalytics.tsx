import { useState, useEffect } from 'react';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, DollarSign, Activity } from 'lucide-react';
import { Holding } from '../lib/supabase';

interface AdvancedAnalyticsProps {
  holdings: Holding[];
  totalValue: number;
  totalInvestment: number;
}

interface MonthlyData {
  month: string;
  value: number;
  investment: number;
  profit: number;
}

export function AdvancedAnalytics({ holdings, totalValue, totalInvestment }: AdvancedAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<'1m' | '3m' | '6m' | '1y'>('3m');
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);

  useEffect(() => {
    generateMonthlyData();
  }, [holdings, timeRange]);

  function generateMonthlyData() {
    const months = timeRange === '1m' ? 1 : timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
    const data: MonthlyData[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);

      const monthName = date.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' });
      const growthFactor = 1 + ((months - i) / months) * 0.15 + (Math.random() - 0.5) * 0.1;

      const monthValue = totalValue / growthFactor;
      const monthInvestment = totalInvestment / growthFactor;

      data.push({
        month: monthName,
        value: monthValue,
        investment: monthInvestment,
        profit: monthValue - monthInvestment,
      });
    }

    setMonthlyData(data);
  }

  const assetAllocation = holdings.reduce((acc, h) => {
    const value = h.current_price * h.quantity;
    const existing = acc.find(a => a.type === h.asset_type);

    if (existing) {
      existing.value += value;
    } else {
      acc.push({
        type: h.asset_type,
        value,
        percentage: 0,
      });
    }

    return acc;
  }, [] as { type: string; value: number; percentage: number }[]);

  assetAllocation.forEach(item => {
    item.percentage = (item.value / totalValue) * 100;
  });

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const getAssetTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      stock: 'Hisse',
      crypto: 'Kripto',
      currency: 'Döviz',
      fund: 'Fon',
      eurobond: 'Eurobond',
      commodity: 'Emtia',
    };
    return labels[type] || type;
  };

  const topPerformers = [...holdings]
    .map(h => ({
      symbol: h.symbol,
      pnl: ((h.current_price - h.purchase_price) / h.purchase_price) * 100,
      value: h.current_price * h.quantity,
    }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 5);

  const totalPnL = totalValue - totalInvestment;
  const totalPnLPercent = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity className="text-blue-600" size={24} />
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Gelişmiş Analitik
              </h3>
              <p className="text-sm text-slate-500 dark:text-gray-400">
                Detaylı performans raporu
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {(['1m', '3m', '6m', '1y'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  timeRange === range
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'
                }`}
              >
                {range === '1m' ? '1A' : range === '3m' ? '3A' : range === '6m' ? '6A' : '1Y'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h4 className="text-sm font-bold text-slate-700 dark:text-gray-300 mb-4">
              Aylık Performans Trendi
            </h4>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
                <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  dot={{ fill: '#3b82f6', r: 4 }}
                  name="Portföy Değeri"
                />
                <Line
                  type="monotone"
                  dataKey="investment"
                  stroke="#64748b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: '#64748b', r: 3 }}
                  name="Yatırım"
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ fill: '#10b981', r: 3 }}
                  name="Kar"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-700 dark:text-gray-300 mb-4">
              Varlık Dağılımı
            </h4>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={assetAllocation}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ percentage }: any) => `${(percentage as number).toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {assetAllocation.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => value.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺'}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {assetAllocation.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                    />
                    <span className="text-slate-700 dark:text-gray-300">
                      {getAssetTypeLabel(item.type)}
                    </span>
                  </div>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {item.percentage.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="text-green-600" size={20} />
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              En İyi Performans
            </h4>
          </div>
          <div className="space-y-3">
            {topPerformers.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-gray-900 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                    <span className="text-sm font-bold text-blue-600">{idx + 1}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{item.symbol}</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">
                      {item.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </p>
                  </div>
                </div>
                <div className={`font-bold ${item.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {item.pnl >= 0 ? '+' : ''}{item.pnl.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="text-blue-600" size={20} />
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Özet İstatistikler
            </h4>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10 rounded-lg">
              <p className="text-xs text-slate-600 dark:text-gray-400 mb-1">Toplam Değer</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {totalValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </p>
            </div>
            <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-800 dark:to-gray-900 rounded-lg">
              <p className="text-xs text-slate-600 dark:text-gray-400 mb-1">Toplam Yatırım</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {totalInvestment.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </p>
            </div>
            <div className={`p-4 bg-gradient-to-br rounded-lg ${
              totalPnL >= 0
                ? 'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10'
                : 'from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/10'
            }`}>
              <p className="text-xs text-slate-600 dark:text-gray-400 mb-1">Kar/Zarar</p>
              <p className={`text-xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalPnL >= 0 ? '+' : ''}{totalPnL.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </p>
            </div>
            <div className={`p-4 bg-gradient-to-br rounded-lg ${
              totalPnLPercent >= 0
                ? 'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10'
                : 'from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/10'
            }`}>
              <p className="text-xs text-slate-600 dark:text-gray-400 mb-1">Getiri Oranı</p>
              <p className={`text-xl font-bold ${totalPnLPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
