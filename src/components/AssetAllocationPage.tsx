import { Holding } from '../lib/supabase';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, PieChart as PieIcon } from 'lucide-react';

interface AssetAllocationPageProps {
  holdings: Holding[];
  onBack: () => void;
}

interface AssetTypeData {
  type: string;
  typeName: string;
  value: number;
  investment: number;
  profit: number;
  profitPercent: number;
  count: number;
  color: string;
}

const ASSET_TYPE_INFO: { [key: string]: { name: string; color: string } } = {
  stock: { name: 'BIST Hisseleri', color: '#3B82F6' },
  crypto: { name: 'Kripto Para', color: '#F59E0B' },
  currency: { name: 'Döviz', color: '#10B981' },
  commodity: { name: 'Emtia (Altın)', color: '#EF4444' },
  fund: { name: 'Fon', color: '#8B5CF6' },
  eurobond: { name: 'Eurobond', color: '#EC4899' },
};

export function AssetAllocationPage({ holdings, onBack }: AssetAllocationPageProps) {
  const assetTypeMap = new Map<string, AssetTypeData>();

  holdings.forEach((holding) => {
    const currentValue = holding.current_price * holding.quantity;
    const investmentValue = holding.purchase_price * holding.quantity;
    const profit = currentValue - investmentValue;

    if (!assetTypeMap.has(holding.asset_type)) {
      const info = ASSET_TYPE_INFO[holding.asset_type] || { name: holding.asset_type, color: '#6B7280' };
      assetTypeMap.set(holding.asset_type, {
        type: holding.asset_type,
        typeName: info.name,
        value: 0,
        investment: 0,
        profit: 0,
        profitPercent: 0,
        count: 0,
        color: info.color,
      });
    }

    const data = assetTypeMap.get(holding.asset_type)!;
    data.value += currentValue;
    data.investment += investmentValue;
    data.profit += profit;
    data.count += 1;
  });

  const assetData = Array.from(assetTypeMap.values()).map(data => ({
    ...data,
    profitPercent: data.investment > 0 ? (data.profit / data.investment) * 100 : 0,
  }));

  const totalValue = assetData.reduce((sum, d) => sum + d.value, 0);
  const totalInvestment = assetData.reduce((sum, d) => sum + d.investment, 0);
  const totalProfit = assetData.reduce((sum, d) => sum + d.profit, 0);
  const totalProfitPercent = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0;

  const pieData = assetData.map(d => ({
    name: d.typeName,
    value: d.value,
    percent: totalValue > 0 ? (d.value / totalValue) * 100 : 0,
  }));

  const profitData = assetData
    .map(d => ({
      name: d.typeName,
      profit: d.profit,
      profitPercent: d.profitPercent,
      color: d.color,
    }))
    .sort((a, b) => b.profit - a.profit);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <span>←</span>
            <span className="hidden sm:inline">Geri</span>
          </button>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <PieIcon className="w-6 h-6" />
            Varlık Dağılımı
          </h1>
          <div className="w-16"></div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Total Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 sm:p-6 shadow-lg">
            <div className="text-blue-100 text-sm mb-2">Toplam Değer</div>
            <div className="text-2xl sm:text-3xl font-bold">{totalValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</div>
          </div>

          <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-4 sm:p-6 shadow-lg">
            <div className="text-purple-100 text-sm mb-2">Toplam Yatırım</div>
            <div className="text-2xl sm:text-3xl font-bold">{totalInvestment.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</div>
          </div>

          <div className={`bg-gradient-to-br ${totalProfit >= 0 ? 'from-green-600 to-green-700' : 'from-red-600 to-red-700'} rounded-xl p-4 sm:p-6 shadow-lg`}>
            <div className={`${totalProfit >= 0 ? 'text-green-100' : 'text-red-100'} text-sm mb-2`}>Toplam K/Z</div>
            <div className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              {totalProfit >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
              {totalProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </div>
          </div>

          <div className={`bg-gradient-to-br ${totalProfitPercent >= 0 ? 'from-emerald-600 to-emerald-700' : 'from-orange-600 to-orange-700'} rounded-xl p-4 sm:p-6 shadow-lg`}>
            <div className={`${totalProfitPercent >= 0 ? 'text-emerald-100' : 'text-orange-100'} text-sm mb-2`}>Getiri Oranı</div>
            <div className="text-2xl sm:text-3xl font-bold">
              {totalProfitPercent >= 0 ? '+' : ''}{totalProfitPercent.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-gray-700">
            <h2 className="text-lg sm:text-xl font-bold mb-4">Varlık Dağılımı</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => `${(entry.percent * 100).toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((_entry, index) => {
                    const assetInfo = assetData[index];
                    return <Cell key={`cell-${index}`} fill={assetInfo.color} />;
                  })}
                </Pie>
                <Tooltip
                  formatter={(value: number) => value.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺'}
                  contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Profit Bar Chart */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-gray-700">
            <h2 className="text-lg sm:text-xl font-bold mb-4">Getiri Karşılaştırması</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={profitData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
                <YAxis tick={{ fill: '#9CA3AF' }} />
                <Tooltip
                  formatter={(value: number) => value.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺'}
                  contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                />
                <Bar dataKey="profit" radius={[8, 8, 0, 0]}>
                  {profitData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Table */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
          <h2 className="text-lg sm:text-xl font-bold p-4 sm:p-6 border-b border-gray-700">Detaylı Analiz</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs sm:text-sm font-semibold">Varlık Tipi</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-semibold">Adet</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-semibold">Yatırım</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-semibold">Değer</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-semibold">K/Z</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-semibold">Oran</th>
                  <th className="px-4 py-3 text-right text-xs sm:text-sm font-semibold">Getiri %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {assetData
                  .sort((a, b) => b.value - a.value)
                  .map((asset) => (
                    <tr key={asset.type} className="hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: asset.color }}></div>
                          <span className="font-medium text-sm sm:text-base">{asset.typeName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right text-sm sm:text-base">{asset.count}</td>
                      <td className="px-4 py-4 text-right text-sm sm:text-base">{asset.investment.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
                      <td className="px-4 py-4 text-right font-semibold text-sm sm:text-base">{asset.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
                      <td className={`px-4 py-4 text-right font-semibold text-sm sm:text-base ${asset.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {asset.profit >= 0 ? '+' : ''}{asset.profit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </td>
                      <td className="px-4 py-4 text-right text-sm sm:text-base">
                        {totalValue > 0 ? ((asset.value / totalValue) * 100).toFixed(1) : 0}%
                      </td>
                      <td className={`px-4 py-4 text-right font-semibold text-sm sm:text-base ${asset.profitPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {asset.profitPercent >= 0 ? '+' : ''}{asset.profitPercent.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot className="bg-gray-700/50 font-bold">
                <tr>
                  <td className="px-4 py-4 text-sm sm:text-base">TOPLAM</td>
                  <td className="px-4 py-4 text-right text-sm sm:text-base">{holdings.length}</td>
                  <td className="px-4 py-4 text-right text-sm sm:text-base">{totalInvestment.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
                  <td className="px-4 py-4 text-right text-sm sm:text-base">{totalValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
                  <td className={`px-4 py-4 text-right text-sm sm:text-base ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {totalProfit >= 0 ? '+' : ''}{totalProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </td>
                  <td className="px-4 py-4 text-right text-sm sm:text-base">100%</td>
                  <td className={`px-4 py-4 text-right text-sm sm:text-base ${totalProfitPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {totalProfitPercent >= 0 ? '+' : ''}{totalProfitPercent.toFixed(2)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
