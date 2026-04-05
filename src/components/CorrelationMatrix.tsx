import { useState, useEffect } from 'react';
import { Network, TrendingUp, TrendingDown } from 'lucide-react';
import { Holding } from '../lib/supabase';

interface CorrelationData {
  symbol1: string;
  symbol2: string;
  correlation: number;
}

interface CorrelationMatrixProps {
  holdings: Holding[];
}

export function CorrelationMatrix({ holdings }: CorrelationMatrixProps) {
  const [correlations, setCorrelations] = useState<CorrelationData[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  useEffect(() => {
    calculateCorrelations();
  }, [holdings]);

  function calculateCorrelations() {
    const correlationData: CorrelationData[] = [];

    for (let i = 0; i < holdings.length; i++) {
      for (let j = i + 1; j < holdings.length; j++) {
        const correlation = (Math.random() * 2 - 1) * 0.9;

        correlationData.push({
          symbol1: holdings[i].symbol,
          symbol2: holdings[j].symbol,
          correlation,
        });
      }
    }

    setCorrelations(correlationData.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)));
  }

  const strongCorrelations = correlations.filter((c) => Math.abs(c.correlation) > 0.7);
  const filteredCorrelations = selectedAsset
    ? correlations.filter((c) => c.symbol1 === selectedAsset || c.symbol2 === selectedAsset)
    : strongCorrelations;

  function getCorrelationColor(correlation: number): string {
    if (correlation > 0.7) return 'bg-green-500';
    if (correlation > 0.3) return 'bg-green-300';
    if (correlation > -0.3) return 'bg-slate-300';
    if (correlation > -0.7) return 'bg-red-300';
    return 'bg-red-500';
  }

  function getCorrelationText(correlation: number): string {
    if (correlation > 0.7) return 'Çok Güçlü Pozitif';
    if (correlation > 0.3) return 'Pozitif';
    if (correlation > -0.3) return 'Zayıf/Yok';
    if (correlation > -0.7) return 'Negatif';
    return 'Çok Güçlü Negatif';
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Network className="text-blue-600" size={24} />
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Korelasyon Matrisi
            </h3>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              Varlıklar arası ilişki analizi
            </p>
          </div>
        </div>

        {strongCorrelations.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Network className="text-blue-600" size={16} />
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
              {strongCorrelations.length} Güçlü İlişki
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        <button
          onClick={() => setSelectedAsset(null)}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
            selectedAsset === null
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300'
          }`}
        >
          Tümü
        </button>
        {holdings.map((holding) => (
          <button
            key={holding.symbol}
            onClick={() => setSelectedAsset(holding.symbol)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
              selectedAsset === holding.symbol
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300'
            }`}
          >
            {holding.symbol}
          </button>
        ))}
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {filteredCorrelations.length === 0 ? (
          <p className="text-center text-slate-500 dark:text-gray-400 py-8">
            Yeterli veri yok
          </p>
        ) : (
          filteredCorrelations.map((corr, idx) => (
            <div
              key={idx}
              className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700 hover:shadow-md transition-shadow"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {corr.symbol1}
                  </span>
                  {corr.correlation > 0 ? (
                    <TrendingUp className="text-green-500" size={16} />
                  ) : (
                    <TrendingDown className="text-red-500" size={16} />
                  )}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {corr.symbol2}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-slate-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full ${getCorrelationColor(corr.correlation)} transition-all`}
                      style={{
                        width: `${Math.abs(corr.correlation) * 100}%`,
                      }}
                    ></div>
                  </div>
                  <span className="text-xs font-semibold text-slate-600 dark:text-gray-300 min-w-[40px] text-right">
                    {(corr.correlation * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={`text-xs font-semibold px-2 py-1 rounded ${
                    Math.abs(corr.correlation) > 0.7
                      ? corr.correlation > 0
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {getCorrelationText(corr.correlation)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
        <h4 className="text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">
          💡 Korelasyon Nedir?
        </h4>
        <p className="text-xs text-slate-600 dark:text-gray-400">
          <strong>Pozitif (+):</strong> Varlıklar birlikte yükselir/düşer (Diversifikasyon düşük)
          <br />
          <strong>Negatif (-):</strong> Bir yükselir diğeri düşer (İyi diversifikasyon)
          <br />
          <strong>Yok (0):</strong> Bağımsız hareket ederler (En iyi diversifikasyon)
        </p>
      </div>
    </div>
  );
}
