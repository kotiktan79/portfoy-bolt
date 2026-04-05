import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, PieChart as PieChartIcon } from 'lucide-react';

interface SectorData {
  [key: string]: string | number;
  sector: string;
  value: number;
  percentage: number;
  count: number;
  avgReturn: number;
}

const SECTOR_MAP: Record<string, string> = {
  'THYAO': 'Havacılık',
  'AKBNK': 'Bankacılık',
  'GARAN': 'Bankacılık',
  'ISCTR': 'Bankacılık',
  'YKBNK': 'Bankacılık',
  'VAKBN': 'Bankacılık',
  'HALKB': 'Bankacılık',
  'ASELS': 'Savunma',
  'KCHOL': 'Holding',
  'SAHOL': 'Holding',
  'EREGL': 'Metal',
  'TUPRS': 'Petrokimya',
  'PETKM': 'Petrokimya',
  'SISE': 'Cam',
  'TTKOM': 'Telekomünikasyon',
  'BIMAS': 'Perakende',
  'MGROS': 'Perakende',
  'SODA': 'Kimya',
  'KOZAL': 'Madencilik',
  'PGSUS': 'Havacılık',
};

const SECTOR_COLORS: Record<string, string> = {
  'Bankacılık': '#3b82f6',
  'Havacılık': '#10b981',
  'Savunma': '#ef4444',
  'Holding': '#f59e0b',
  'Metal': '#6366f1',
  'Petrokimya': '#ec4899',
  'Cam': '#14b8a6',
  'Telekomünikasyon': '#8b5cf6',
  'Perakende': '#f97316',
  'Kimya': '#06b6d4',
  'Madencilik': '#84cc16',
  'Diğer': '#64748b',
};

export default function SectorAnalysis() {
  const [sectorData, setSectorData] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSectorData();
  }, []);

  async function loadSectorData() {
    try {
      const { data: holdings } = await supabase
        .from('holdings')
        .select('*');

      if (!holdings || holdings.length === 0) {
        setLoading(false);
        return;
      }

      const sectorMap = new Map<string, { value: number; count: number; totalReturn: number }>();

      holdings.forEach((holding) => {
        const sector = SECTOR_MAP[holding.symbol] || 'Diğer';
        const value = holding.current_price * holding.quantity;
        const returnValue = ((holding.current_price - holding.average_cost) / holding.average_cost) * 100;

        if (sectorMap.has(sector)) {
          const existing = sectorMap.get(sector)!;
          sectorMap.set(sector, {
            value: existing.value + value,
            count: existing.count + 1,
            totalReturn: existing.totalReturn + returnValue,
          });
        } else {
          sectorMap.set(sector, {
            value,
            count: 1,
            totalReturn: returnValue,
          });
        }
      });

      const totalValue = Array.from(sectorMap.values()).reduce((sum, s) => sum + s.value, 0);

      const sectors: SectorData[] = Array.from(sectorMap.entries()).map(([sector, data]) => ({
        sector,
        value: data.value,
        percentage: (data.value / totalValue) * 100,
        count: data.count,
        avgReturn: data.totalReturn / data.count,
      }));

      sectors.sort((a, b) => b.value - a.value);
      setSectorData(sectors);
    } catch (error) {
      console.error('Error loading sector data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (sectorData.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <PieChartIcon className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Sektör Analizi</h2>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">Henüz veri yok</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <PieChartIcon className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Sektör Analizi</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Sektörel Dağılım</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={sectorData}
                dataKey="value"
                nameKey="sector"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(entry: any) => `${entry.sector} ${(entry.percentage || entry.percent * 100).toFixed(1)}%`}
              >
                {sectorData.map((entry) => (
                  <Cell key={entry.sector} fill={SECTOR_COLORS[entry.sector] || SECTOR_COLORS['Diğer']} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `₺${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Sektör Performansı</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sectorData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="sector" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip
                formatter={(value: number) => `${value.toFixed(2)}%`}
                labelStyle={{ color: '#000' }}
              />
              <Bar dataKey="avgReturn" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sectorData.map((sector) => (
          <div
            key={sector.sector}
            className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border-l-4"
            style={{ borderColor: SECTOR_COLORS[sector.sector] || SECTOR_COLORS['Diğer'] }}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-gray-900 dark:text-white">{sector.sector}</h4>
              {sector.avgReturn >= 0 ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600" />
              )}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Değer:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  ₺{sector.value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Oran:</span>
                <span className="font-semibold text-gray-900 dark:text-white">{sector.percentage.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Varlık:</span>
                <span className="font-semibold text-gray-900 dark:text-white">{sector.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Ort. Getiri:</span>
                <span className={`font-semibold ${sector.avgReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {sector.avgReturn >= 0 ? '+' : ''}{sector.avgReturn.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
