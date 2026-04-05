import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Activity, AlertTriangle } from 'lucide-react';
import { Holding } from '../lib/supabase';

interface VolumeData {
  symbol: string;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  isAnomaly: boolean;
}

interface VolumeAnalysisProps {
  holdings: Holding[];
}

export function VolumeAnalysis({ holdings }: VolumeAnalysisProps) {
  const [volumeData, setVolumeData] = useState<VolumeData[]>([]);

  useEffect(() => {
    analyzeVolume();
  }, [holdings]);

  function analyzeVolume() {
    const data: VolumeData[] = holdings.map((holding) => {
      const currentVolume = Math.floor(Math.random() * 10000000) + 1000000;
      const avgVolume = currentVolume * (0.7 + Math.random() * 0.6);
      const volumeRatio = currentVolume / avgVolume;
      const isAnomaly = volumeRatio > 2.0 || volumeRatio < 0.5;

      return {
        symbol: holding.symbol,
        volume: currentVolume,
        avgVolume,
        volumeRatio,
        isAnomaly,
      };
    });

    setVolumeData(data.sort((a, b) => b.volumeRatio - a.volumeRatio));
  }

  const anomalies = volumeData.filter((d) => d.isAnomaly);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="text-blue-600" size={24} />
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Hacim Analizi
            </h3>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              Güncel hacim / Ortalama hacim oranı
            </p>
          </div>
        </div>

        {anomalies.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <AlertTriangle className="text-amber-600" size={16} />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {anomalies.length} Anomali
            </span>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={volumeData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="symbol"
            stroke="#64748b"
            tick={{ fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            stroke="#64748b"
            tick={{ fontSize: 12 }}
            label={{ value: 'Hacim Oranı', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '12px',
            }}
            formatter={(value: number) => [value.toFixed(2) + 'x', 'Oran']}
          />
          <Bar dataKey="volumeRatio" radius={[8, 8, 0, 0]}>
            {volumeData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  entry.isAnomaly
                    ? entry.volumeRatio > 2
                      ? '#10b981'
                      : '#ef4444'
                    : '#3b82f6'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {anomalies.length > 0 && (
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-bold text-slate-700 dark:text-gray-300 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600" />
            Tespit Edilen Anomaliler
          </h4>
          <div className="space-y-2">
            {anomalies.map((anomaly) => (
              <div
                key={anomaly.symbol}
                className="flex items-center justify-between p-3 bg-slate-50 dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {anomaly.symbol}
                  </span>
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded ${
                      anomaly.volumeRatio > 2
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}
                  >
                    {anomaly.volumeRatio > 2 ? 'Yüksek Hacim' : 'Düşük Hacim'}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {anomaly.volumeRatio.toFixed(2)}x
                  </p>
                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    Ort: {(anomaly.avgVolume / 1000000).toFixed(1)}M
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
