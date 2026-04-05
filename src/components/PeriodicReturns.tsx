import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getHistoricalSnapshots } from '../services/analyticsService';
import { Calendar, TrendingUp, Download } from 'lucide-react';

interface MonthlyReturn {
  period: string;
  return: number;
  startValue: number;
  endValue: number;
  profit: number;
}

export default function PeriodicReturns() {
  const [monthlyReturns, setMonthlyReturns] = useState<MonthlyReturn[]>([]);
  const [yearlyReturns, setYearlyReturns] = useState<MonthlyReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    loadReturns();
  }, []);

  async function loadReturns() {
    setLoading(true);
    try {
      const snapshots = await getHistoricalSnapshots(365);

      if (!snapshots || snapshots.length === 0) {
        console.warn('No portfolio snapshots found');
        setMonthlyReturns([]);
        setYearlyReturns([]);
        setLoading(false);
        return;
      }

      if (snapshots.length < 2) {
        console.warn('Need at least 2 snapshots for PnL calculation');
        setMonthlyReturns([]);
        setYearlyReturns([]);
        setLoading(false);
        return;
      }

      const monthly = calculateMonthlyReturns(snapshots);
      const yearly = calculateYearlyReturns(snapshots);

      setMonthlyReturns(monthly);
      setYearlyReturns(yearly);
    } catch (error) {
      console.error('Error loading returns:', error);
      setMonthlyReturns([]);
      setYearlyReturns([]);
    } finally {
      setLoading(false);
    }
  }

  function calculateMonthlyReturns(snapshots: any[]): MonthlyReturn[] {
    const monthlyData = new Map<string, any[]>();

    snapshots.forEach((snapshot) => {
      if (!snapshot || !snapshot.date || snapshot.total_value === undefined) {
        console.warn('Invalid snapshot data:', snapshot);
        return;
      }

      const date = new Date(snapshot.date);
      if (isNaN(date.getTime())) {
        console.warn('Invalid date in snapshot:', snapshot.date);
        return;
      }

      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, []);
      }
      monthlyData.get(monthKey)!.push(snapshot);
    });

    const returns: MonthlyReturn[] = [];

    monthlyData.forEach((data, monthKey) => {
      if (data.length === 0) return;

      data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const startValue = Number(data[0].total_value) || 0;
      const endValue = Number(data[data.length - 1].total_value) || 0;

      if (startValue === 0) {
        console.warn('Start value is 0 for month:', monthKey);
        return;
      }

      const profit = endValue - startValue;
      const returnPct = (profit / startValue) * 100;

      const [year, month] = monthKey.split('-');
      const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('tr-TR', {
        month: 'short',
        year: 'numeric'
      });

      returns.push({
        period: monthName,
        return: isFinite(returnPct) ? returnPct : 0,
        startValue,
        endValue,
        profit,
      });
    });

    return returns.sort((a, b) => {
      const [aMonth, aYear] = a.period.split(' ');
      const [bMonth, bYear] = b.period.split(' ');
      return new Date(`${aMonth} 1, ${aYear}`).getTime() - new Date(`${bMonth} 1, ${bYear}`).getTime();
    });
  }

  function calculateYearlyReturns(snapshots: any[]): MonthlyReturn[] {
    const yearlyData = new Map<string, any[]>();

    snapshots.forEach((snapshot) => {
      if (!snapshot || !snapshot.date || snapshot.total_value === undefined) {
        return;
      }

      const date = new Date(snapshot.date);
      if (isNaN(date.getTime())) {
        return;
      }

      const year = date.getFullYear().toString();

      if (!yearlyData.has(year)) {
        yearlyData.set(year, []);
      }
      yearlyData.get(year)!.push(snapshot);
    });

    const returns: MonthlyReturn[] = [];

    yearlyData.forEach((data, year) => {
      if (data.length === 0) return;

      data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const startValue = Number(data[0].total_value) || 0;
      const endValue = Number(data[data.length - 1].total_value) || 0;

      if (startValue === 0) {
        console.warn('Start value is 0 for year:', year);
        return;
      }

      const profit = endValue - startValue;
      const returnPct = (profit / startValue) * 100;

      returns.push({
        period: year,
        return: isFinite(returnPct) ? returnPct : 0,
        startValue,
        endValue,
        profit,
      });
    });

    return returns.sort((a, b) => parseInt(a.period) - parseInt(b.period));
  }

  function exportToCSV() {
    const data = viewMode === 'monthly' ? monthlyReturns : yearlyReturns;
    const headers = ['Dönem', 'Getiri (%)', 'Başlangıç Değeri (₺)', 'Bitiş Değeri (₺)', 'Kar/Zarar (₺)'];
    const rows = data.map(row => [
      row.period,
      row.return.toFixed(2),
      row.startValue.toFixed(2),
      row.endValue.toFixed(2),
      row.profit.toFixed(2)
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${viewMode === 'monthly' ? 'aylik' : 'yillik'}_getiriler_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
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

  const currentData = viewMode === 'monthly' ? monthlyReturns : yearlyReturns;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Periyodik Getiriler</h2>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('monthly')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'monthly'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Aylık
          </button>
          <button
            onClick={() => setViewMode('yearly')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'yearly'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Yıllık
          </button>
          <button
            onClick={exportToCSV}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            CSV İndir
          </button>
        </div>
      </div>

      {currentData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
          <TrendingUp className="w-16 h-16 mb-4 opacity-50" />
          <p className="font-semibold mb-2">Henüz yeterli veri yok</p>
          <p className="text-sm text-center max-w-md">
            Periyodik getiri hesaplaması için en az 2 gün portföy snapshot'ı gereklidir.
            <br />
            Portföyünüz her gün otomatik olarak kaydedilir.
          </p>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={currentData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `${value.toFixed(0)}%`}
              />
              <Tooltip
                formatter={(value: number) => `${value.toFixed(2)}%`}
                labelStyle={{ color: '#000' }}
              />
              <Bar dataKey="return" name="Getiri" radius={[8, 8, 0, 0]}>
                {currentData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.return >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Dönem</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Başlangıç</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Bitiş</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Kar/Zarar</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Getiri</th>
                </tr>
              </thead>
              <tbody>
                {currentData.map((row, index) => (
                  <tr key={index} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-white font-medium">{row.period}</td>
                    <td className="py-3 px-4 text-sm text-right text-gray-700 dark:text-gray-300">
                      ₺{row.startValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-700 dark:text-gray-300">
                      ₺{row.endValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`py-3 px-4 text-sm text-right font-semibold ${row.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {row.profit >= 0 ? '+' : ''}₺{row.profit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`py-3 px-4 text-sm text-right font-bold ${row.return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {row.return >= 0 ? '+' : ''}{row.return.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <p className="text-sm text-green-600 dark:text-green-400 mb-1">En İyi Dönem</p>
              <p className="text-xl font-bold text-green-900 dark:text-green-300">
                +{Math.max(...currentData.map(d => d.return)).toFixed(2)}%
              </p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                {currentData.find(d => d.return === Math.max(...currentData.map(d => d.return)))?.period}
              </p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
              <p className="text-sm text-red-600 dark:text-red-400 mb-1">En Kötü Dönem</p>
              <p className="text-xl font-bold text-red-900 dark:text-red-300">
                {Math.min(...currentData.map(d => d.return)).toFixed(2)}%
              </p>
              <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                {currentData.find(d => d.return === Math.min(...currentData.map(d => d.return)))?.period}
              </p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">Ortalama Getiri</p>
              <p className="text-xl font-bold text-blue-900 dark:text-blue-300">
                {(currentData.reduce((sum, d) => sum + d.return, 0) / currentData.length).toFixed(2)}%
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                {currentData.length} dönem
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
