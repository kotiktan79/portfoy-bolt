import { useState, useEffect } from 'react';
import { Brain, AlertTriangle, Target, Lightbulb, Sparkles, Shield, BarChart3 } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { calculateVolatility } from '../services/technicalIndicators';

interface Suggestion {
  type: 'warning' | 'opportunity' | 'rebalance' | 'risk';
  title: string;
  description: string;
  action?: string;
  priority: 'high' | 'medium' | 'low';
}

interface AIPortfolioSuggestionsProps {
  holdings: Holding[];
  totalValue: number;
}

type AnalysisType = 'overview' | 'risk' | 'diversification' | 'suggestions';

export function AIPortfolioSuggestions({ holdings, totalValue }: AIPortfolioSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [activeTab, setActiveTab] = useState<AnalysisType>('overview');
  const [useAI, setUseAI] = useState(false);

  useEffect(() => {
    if (useAI) {
      generateAIAnalysis(activeTab);
    } else {
      generateSuggestions();
    }
  }, [holdings, totalValue, activeTab, useAI]);

  async function generateAIAnalysis(analysisType: AnalysisType) {
    setLoading(true);
    setAiAnalysis('');

    try {
      const portfolioData = {
        holdings: holdings.map(h => ({
          symbol: h.symbol,
          asset_type: h.asset_type,
          quantity: h.quantity,
          avg_price: h.purchase_price,
          current_price: h.current_price,
          total_value: h.current_price * h.quantity,
          profit_loss: (h.current_price - h.purchase_price) * h.quantity,
          profit_loss_percent: ((h.current_price - h.purchase_price) / h.purchase_price) * 100,
        })),
        total_value: totalValue,
        total_invested: holdings.reduce((sum, h) => sum + h.purchase_price * h.quantity, 0),
        total_profit_loss: holdings.reduce((sum, h) => sum + (h.current_price - h.purchase_price) * h.quantity, 0),
        total_profit_loss_percent: 0,
      };

      portfolioData.total_profit_loss_percent =
        (portfolioData.total_profit_loss / portfolioData.total_invested) * 100;

      // Vercel API endpoint kullan — Edge Function yeni projede mevcut değil
      const response = await fetch(
        `/api/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            portfolio: portfolioData,
            question: `Portföy analizi yap. Analiz tipi: ${analysisType}. Risk profili: moderate. Detaylı öneri ver.`,
          }),
        }
      );

      const result = await response.json();

      if (result.success && result.analysis) {
        setAiAnalysis(result.analysis);
      } else if (result.suggestions) {
        setAiAnalysis(result.suggestions.join('\n\n'));
      } else {
        setAiAnalysis('AI analizi şu anda kullanılamıyor. Temel öneriler için AI modunu kapatın.');
      }
    } catch (error) {
      console.error('AI analysis error:', error);
      setAiAnalysis('Bağlantı hatası. Lütfen daha sonra tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }

  function generateSuggestions() {
    setLoading(true);
    const newSuggestions: Suggestion[] = [];

    const totalPnL = holdings.reduce((sum, h) => {
      const invested = h.purchase_price * h.quantity;
      const current = h.current_price * h.quantity;
      return sum + (current - invested);
    }, 0);

    const pnlPercent = totalValue > 0 ? (totalPnL / (totalValue - totalPnL)) * 100 : 0;

    if (holdings.length < 5) {
      newSuggestions.push({
        type: 'warning',
        title: 'Düşük Çeşitlendirme',
        description: `Portföyünüzde sadece ${holdings.length} varlık var. Riski azaltmak için en az 8-10 farklı varlık tutmanız önerilir.`,
        action: 'Farklı sektörlerden varlık ekleyin',
        priority: 'high',
      });
    }

    const assetTypes = new Set(holdings.map(h => h.asset_type));
    if (assetTypes.size === 1) {
      newSuggestions.push({
        type: 'risk',
        title: 'Tek Varlık Sınıfı',
        description: 'Tüm yatırımlarınız tek bir varlık sınıfında. Kripto, hisse ve döviz arasında dağıtım yapmanız önerilir.',
        action: 'Varlık sınıfı çeşitliliği ekleyin',
        priority: 'high',
      });
    }

    const dominantHolding = holdings.reduce((max, h) => {
      const value = h.current_price * h.quantity;
      const maxValue = max.current_price * max.quantity;
      return value > maxValue ? h : max;
    }, holdings[0]);

    const dominantPercent = (dominantHolding.current_price * dominantHolding.quantity / totalValue) * 100;

    if (dominantPercent > 40) {
      newSuggestions.push({
        type: 'rebalance',
        title: 'Yüksek Konsantrasyon',
        description: `${dominantHolding.symbol} portföyünüzün %${dominantPercent.toFixed(1)}'ini oluşturuyor. Tek varlığa bu kadar bağımlılık risklidir.`,
        action: 'Pozisyon küçültmeyi düşünün',
        priority: 'medium',
      });
    }

    const losingPositions = holdings.filter(h => {
      const pnl = (h.current_price - h.purchase_price) * h.quantity;
      return pnl < 0 && Math.abs(pnl) > (h.purchase_price * h.quantity * 0.2);
    });

    if (losingPositions.length > 0) {
      newSuggestions.push({
        type: 'warning',
        title: 'Büyük Kayıplar',
        description: `${losingPositions.length} varlıkta %20'den fazla kayıp var. Stop-loss stratejisi belirlemelisiniz.`,
        action: 'Kayıp sınırı belirleyin',
        priority: 'high',
      });
    }

    if (pnlPercent > 50) {
      newSuggestions.push({
        type: 'opportunity',
        title: 'Kar Realizasyonu',
        description: `Portföyünüz %${pnlPercent.toFixed(1)} kar etti. Karınızın bir kısmını realize etmeyi düşünebilirsiniz.`,
        action: 'Kısmi kar satışı yapın',
        priority: 'medium',
      });
    }

    const cryptoHoldings = holdings.filter(h => h.asset_type === 'crypto');
    if (cryptoHoldings.length > 0) {
      const cryptoValue = cryptoHoldings.reduce((sum, h) => sum + h.current_price * h.quantity, 0);
      const cryptoPercent = (cryptoValue / totalValue) * 100;

      if (cryptoPercent > 50) {
        newSuggestions.push({
          type: 'risk',
          title: 'Yüksek Kripto Oranı',
          description: `Portföyünüzün %${cryptoPercent.toFixed(1)}'i kriptoda. Volatilite riski yüksek.`,
          action: 'Stabil varlık oranını artırın',
          priority: 'medium',
        });
      }
    }

    if (holdings.length >= 3) {
      const prices = holdings.map(h => h.current_price);
      const volatility = calculateVolatility(prices);

      if (volatility > 30) {
        newSuggestions.push({
          type: 'risk',
          title: 'Yüksek Volatilite',
          description: `Portföy volatilitesi %${volatility.toFixed(1)}. Daha stabil varlıklar eklemeyi düşünün.`,
          action: 'Düşük riskli varlık ekleyin',
          priority: 'low',
        });
      }
    }

    const holdingsWithoutStopLoss = holdings.filter(h => {
      const pnl = (h.current_price - h.purchase_price) * h.quantity;
      const invested = h.purchase_price * h.quantity;
      return pnl / invested < -0.05;
    });

    if (holdingsWithoutStopLoss.length > 2) {
      newSuggestions.push({
        type: 'warning',
        title: 'Stop-Loss Eksikliği',
        description: 'Kayıp veren pozisyonlarınız için stop-loss belirlemelisiniz.',
        action: 'Risk yönetimi menüsünü kontrol edin',
        priority: 'high',
      });
    }

    setSuggestions(newSuggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }));

    setLoading(false);
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="text-amber-600" size={20} />;
      case 'opportunity':
        return <Lightbulb className="text-green-600" size={20} />;
      case 'rebalance':
        return <Target className="text-brand-600" size={20} />;
      case 'risk':
        return <AlertTriangle className="text-red-600" size={20} />;
      default:
        return <Brain className="text-brand-600" size={20} />;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'warning':
        return 'border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20';
      case 'opportunity':
        return 'border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20';
      case 'rebalance':
        return 'border-brand-200 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/20';
      case 'risk':
        return 'border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20';
      default:
        return 'border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900';
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'medium':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'low':
        return 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Brain className="text-brand-600" size={24} />
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              AI Portföy Danışmanı
            </h3>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              {useAI ? 'OpenAI GPT-4 Analizi' : 'Temel Analiz'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setUseAI(!useAI)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
            useAI
              ? 'bg-gradient-to-r from-brand-600 to-brand-600 text-white shadow-lg'
              : 'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'
          }`}
        >
          <Sparkles size={16} />
          {useAI ? 'AI Açık' : 'AI Aç'}
        </button>
      </div>

      {useAI && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm whitespace-nowrap transition-colors ${
              activeTab === 'overview'
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'
            }`}
          >
            <BarChart3 size={16} />
            Genel
          </button>
          <button
            onClick={() => setActiveTab('risk')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm whitespace-nowrap transition-colors ${
              activeTab === 'risk'
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'
            }`}
          >
            <Shield size={16} />
            Risk
          </button>
          <button
            onClick={() => setActiveTab('diversification')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm whitespace-nowrap transition-colors ${
              activeTab === 'diversification'
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'
            }`}
          >
            <Target size={16} />
            Diversifikasyon
          </button>
          <button
            onClick={() => setActiveTab('suggestions')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm whitespace-nowrap transition-colors ${
              activeTab === 'suggestions'
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'
            }`}
          >
            <Lightbulb size={16} />
            Öneriler
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mb-4"></div>
          <p className="text-slate-500 dark:text-gray-400">
            {useAI ? 'AI analiz yapıyor...' : 'Analiz ediliyor...'}
          </p>
        </div>
      ) : useAI && aiAnalysis ? (
        <div className="bg-gradient-to-br from-brand-50 to-brand-50 dark:from-brand-900/20 dark:to-brand-900/20 rounded-lg p-6 border border-brand-200 dark:border-brand-700">
          <div className="prose pbrand-sm dark:pbrand-invert max-w-none">
            <div className="whitespace-pre-wrap text-slate-700 dark:text-gray-300 leading-relaxed">
              {aiAnalysis}
            </div>
          </div>
        </div>
      ) : !useAI && suggestions.length === 0 ? (
        <div className="text-center py-12">
          <Brain className="mx-auto text-slate-300 dark:text-gray-600 mb-4" size={48} />
          <p className="text-slate-500 dark:text-gray-400">
            Harika! Portföyünüz dengeli görünüyor.
          </p>
        </div>
      ) : !useAI ? (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {suggestions.map((suggestion, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-lg border ${getColor(suggestion.type)} hover:shadow-md transition-shadow`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">{getIcon(suggestion.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                      {suggestion.title}
                    </h4>
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded whitespace-nowrap ${getPriorityBadge(
                        suggestion.priority
                      )}`}
                    >
                      {suggestion.priority === 'high'
                        ? 'Yüksek'
                        : suggestion.priority === 'medium'
                        ? 'Orta'
                        : 'Düşük'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-gray-400 mb-2">
                    {suggestion.description}
                  </p>
                  {suggestion.action && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-gray-300">
                      <Target size={14} />
                      {suggestion.action}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
