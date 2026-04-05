import { useState, useEffect } from 'react';
import { Brain, TrendingUp, TrendingDown, AlertTriangle, Lightbulb, Target, Activity, Shield, Sparkles, MessageSquare, Send, Award, ArrowUpRight, ArrowDownRight, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  analyzeRiskProfile,
  generateAIRecommendations,
  analyzeMarketSentiment,
  generatePortfolioInsights,
  type RiskProfile,
  type AIRecommendation,
  type MarketSentiment,
  type PortfolioInsight,
} from '../services/aiAdvisorService';
import {
  generateBuySellSignals,
  calculatePortfolioScore,
  generateSmartSuggestions,
  generateAIResponse,
  type BuySellSignal,
  type PortfolioScore,
  type SmartSuggestion,
  type AIChat,
} from '../services/advancedAI';

export default function AIAdvisor() {
  const [holdings, setHoldings] = useState<any[]>([]);
  const [riskProfile, setRiskProfile] = useState<RiskProfile | null>(null);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [sentiment, setSentiment] = useState<MarketSentiment | null>(null);
  const [insights, setInsights] = useState<PortfolioInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [buySellSignals, setBuySellSignals] = useState<BuySellSignal[]>([]);
  const [portfolioScore, setPortfolioScore] = useState<PortfolioScore | null>(null);
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([]);
  const [chatHistory, setChatHistory] = useState<AIChat[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'signals' | 'suggestions' | 'chat'>('overview');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data } = await supabase.from('holdings').select('*').gt('quantity', 0);
      if (data) {
        setHoldings(data);
        await runAnalysis(data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis(holdingsData: any[]) {
    setAnalyzing(true);
    try {
      const profile = await analyzeRiskProfile(holdingsData);
      setRiskProfile(profile);

      const recs = await generateAIRecommendations(holdingsData, profile);
      setRecommendations(recs);

      const sent = await analyzeMarketSentiment(holdingsData);
      setSentiment(sent);

      const insightsData = await generatePortfolioInsights(holdingsData, profile, sent);
      setInsights(insightsData);

      const signals = await generateBuySellSignals(holdingsData);
      setBuySellSignals(signals);

      const score = await calculatePortfolioScore(holdingsData);
      setPortfolioScore(score);

      const suggestions = await generateSmartSuggestions(holdingsData);
      setSmartSuggestions(suggestions);
    } catch (error) {
      console.error('Error running analysis:', error);
    } finally {
      setAnalyzing(false);
    }
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'conservative':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'moderate':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'aggressive':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'very_aggressive':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'bearish':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'medium':
        return <Lightbulb className="w-5 h-5 text-yellow-600" />;
      default:
        return <Target className="w-5 h-5 text-blue-600" />;
    }
  };

  const getRecommendationColor = (type: string) => {
    switch (type) {
      case 'buy':
        return 'bg-green-50 border-green-200';
      case 'sell':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'rebalance':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'strong_buy':
        return 'bg-green-600 text-white';
      case 'buy':
        return 'bg-green-500 text-white';
      case 'hold':
        return 'bg-gray-500 text-white';
      case 'sell':
        return 'bg-red-500 text-white';
      case 'strong_sell':
        return 'bg-red-600 text-white';
      default:
        return 'bg-gray-400 text-white';
    }
  };

  const handleChatSubmit = () => {
    if (!chatInput.trim()) return;

    const totalPnL = holdings.reduce((sum, h) => {
      const invested = h.purchase_price * h.quantity;
      const current = h.current_price * h.quantity;
      return sum + ((current - invested) / invested) * 100;
    }, 0) / holdings.length;

    const context = {
      riskProfile,
      portfolioScore,
      topRecommendation: recommendations[0],
      strongBuySignal: buySellSignals.find((s) => s.signal === 'strong_buy')?.symbol,
      strongSellSignal: buySellSignals.find((s) => s.signal === 'strong_sell')?.symbol,
      totalPnL,
    };

    const response = generateAIResponse(chatInput, context);
    setChatHistory([...chatHistory, response]);
    setChatInput('');
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center">
        <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          AI Analiz için varlık gerekli
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Portföyünüze varlık ekleyin ve AI danışmanınızı kullanmaya başlayın.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
            <Brain className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">AI Portföy Danışmanı</h2>
            <p className="text-blue-100">Kişiselleştirilmiş öneriler ve analizler</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => runAnalysis(holdings)}
            disabled={analyzing}
            className="flex items-center gap-2 px-6 py-3 bg-white text-purple-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 font-semibold transition-colors"
          >
            <Sparkles className="w-5 h-5" />
            {analyzing ? 'Analiz ediliyor...' : 'Yeniden Analiz Et'}
          </button>
          {portfolioScore && (
            <div className="flex items-center gap-2 px-4 py-3 bg-white/20 rounded-lg backdrop-blur-sm">
              <Award className="w-6 h-6" />
              <div>
                <p className="text-xs text-blue-100">Portföy Notu</p>
                <p className="text-2xl font-bold">{portfolioScore.grade}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4">
        <div className="flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'overview'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Genel Bakış
          </button>
          <button
            onClick={() => setActiveTab('signals')}
            className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'signals'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Al/Sat Sinyalleri
          </button>
          <button
            onClick={() => setActiveTab('suggestions')}
            className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'suggestions'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Akıllı Öneriler
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'chat'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            AI Sohbet
          </button>
        </div>
      </div>

      {activeTab === 'overview' && riskProfile && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-6 h-6 text-blue-600" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Risk Profili</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${getRiskColor(
                  riskProfile.level
                )} font-bold text-lg mb-4`}
              >
                {riskProfile.level === 'conservative' && '🛡️ Muhafazakar'}
                {riskProfile.level === 'moderate' && '⚖️ Dengeli'}
                {riskProfile.level === 'aggressive' && '🚀 Agresif'}
                {riskProfile.level === 'very_aggressive' && '⚡ Çok Agresif'}
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Genel Risk Skoru
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {riskProfile.score.toFixed(0)}/100
                    </span>
                  </div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                      style={{ width: `${riskProfile.score}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Çeşitlendirme</span>
                  <span className="text-sm font-bold">
                    {riskProfile.factors.diversification.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${riskProfile.factors.diversification}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Volatilite</span>
                  <span className="text-sm font-bold">
                    {riskProfile.factors.volatility.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${riskProfile.factors.volatility}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Konsantrasyon</span>
                  <span className="text-sm font-bold">
                    {riskProfile.factors.concentration.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-500"
                    style={{ width: `${riskProfile.factors.concentration}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Varlık Dağılımı</span>
                  <span className="text-sm font-bold">
                    {riskProfile.factors.asset_allocation.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500"
                    style={{ width: `${riskProfile.factors.asset_allocation}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'overview' && sentiment && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <Activity className="w-6 h-6 text-purple-600" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Piyasa Sentiment</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${getSentimentColor(
                  sentiment.overall
                )} font-bold text-lg mb-4`}
              >
                {sentiment.overall === 'bullish' && (
                  <>
                    <TrendingUp className="w-5 h-5" /> Yükseliş
                  </>
                )}
                {sentiment.overall === 'bearish' && (
                  <>
                    <TrendingDown className="w-5 h-5" /> Düşüş
                  </>
                )}
                {sentiment.overall === 'neutral' && '↔️ Nötr'}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Genel piyasa skoru: {sentiment.score.toFixed(0)}/100
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">Teknik</span>
                <span className="text-sm font-bold">
                  {sentiment.signals.technical.toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">Fundamental</span>
                <span className="text-sm font-bold">
                  {sentiment.signals.fundamental.toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">Sentiment</span>
                <span className="text-sm font-bold">
                  {sentiment.signals.sentiment.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'overview' && recommendations.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <Lightbulb className="w-6 h-6 text-yellow-600" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              AI Önerileri ({recommendations.length})
            </h3>
          </div>

          <div className="space-y-4">
            {recommendations.map((rec, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-2 ${getRecommendationColor(rec.type)}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">{getPriorityIcon(rec.priority)}</div>
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 dark:text-white mb-1">
                      {rec.title}
                    </h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      {rec.description}
                    </p>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-gray-600 dark:text-gray-400">
                        <strong>Sebep:</strong> {rec.reason}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        <strong>Etki:</strong> {rec.impact}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        <strong>Güven:</strong> %{rec.confidence}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'overview' && insights.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="w-6 h-6 text-purple-600" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              Portföy İçgörüleri
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map((insight, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-2 ${
                  insight.severity === 'critical'
                    ? 'bg-red-50 border-red-200'
                    : insight.severity === 'warning'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-blue-50 border-blue-200'
                }`}
              >
                <h4 className="font-bold text-gray-900 dark:text-white mb-2">
                  {insight.title}
                </h4>
                <p className="text-sm text-gray-700 dark:text-gray-300">{insight.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'signals' && (
        <div className="space-y-4">
          {portfolioScore && (
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl shadow-lg p-6 text-white">
              <h3 className="text-2xl font-bold mb-4">Portföy Skoru</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <p className="text-sm text-blue-100">Genel</p>
                  <p className="text-3xl font-bold">{portfolioScore.overall.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-sm text-blue-100">Çeşitlendirme</p>
                  <p className="text-2xl font-bold">{portfolioScore.breakdown.diversification.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-sm text-blue-100">Performans</p>
                  <p className="text-2xl font-bold">{portfolioScore.breakdown.performance.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-sm text-blue-100">Risk</p>
                  <p className="text-2xl font-bold">{portfolioScore.breakdown.riskManagement.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-sm text-blue-100">Not</p>
                  <p className="text-3xl font-bold">{portfolioScore.grade}</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              Al/Sat Sinyalleri ({buySellSignals.length})
            </h3>
            <div className="space-y-4">
              {buySellSignals.map((signal, index) => (
                <div key={index} className="border-2 border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <h4 className="text-lg font-bold text-gray-900 dark:text-white">{signal.symbol}</h4>
                      <span className={`px-3 py-1 rounded-lg text-sm font-bold ${getSignalColor(signal.signal)}`}>
                        {signal.signal.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Güç</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{signal.strength.toFixed(0)}%</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">RSI</p>
                      <p className="font-bold text-gray-900 dark:text-white">{signal.technicals.rsi.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Momentum</p>
                      <p className="font-bold text-gray-900 dark:text-white">{signal.technicals.momentum.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Hedef</p>
                      <p className="font-bold text-green-600">₺{signal.targetPrice?.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Stop-Loss</p>
                      <p className="font-bold text-red-600">₺{signal.stopLoss?.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {signal.reasons.map((reason, idx) => (
                      <p key={idx} className="text-sm text-gray-700 dark:text-gray-300">• {reason}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'suggestions' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
            Akıllı Öneriler ({smartSuggestions.length})
          </h3>
          <div className="space-y-4">
            {smartSuggestions.map((suggestion, index) => (
              <div key={index} className="border-2 border-gray-200 dark:border-gray-700 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {suggestion.type === 'add_asset' && <ArrowUpRight className="w-6 h-6 text-green-600" />}
                    {suggestion.type === 'decrease' && <ArrowDownRight className="w-6 h-6 text-red-600" />}
                    {suggestion.type === 'exit' && <X className="w-6 h-6 text-red-600" />}
                    <div>
                      <h4 className="text-lg font-bold text-gray-900 dark:text-white">{suggestion.symbol}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{suggestion.type.replace('_', ' ').toUpperCase()}</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 rounded-lg text-sm font-bold">
                    Öncelik: {suggestion.priority}
                  </span>
                </div>

                <p className="text-gray-700 dark:text-gray-300 mb-4">{suggestion.reason}</p>

                <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Risk Değişimi</p>
                    <p className={`font-bold ${suggestion.expectedImpact.riskChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {suggestion.expectedImpact.riskChange > 0 ? '+' : ''}{suggestion.expectedImpact.riskChange}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Getiri Değişimi</p>
                    <p className={`font-bold ${suggestion.expectedImpact.returnChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {suggestion.expectedImpact.returnChange > 0 ? '+' : ''}{suggestion.expectedImpact.returnChange}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Sharpe Değişimi</p>
                    <p className={`font-bold ${suggestion.expectedImpact.sharpeChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {suggestion.expectedImpact.sharpeChange > 0 ? '+' : ''}{suggestion.expectedImpact.sharpeChange.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Aksiyon Adımları:</p>
                  {suggestion.actionSteps.map((step, idx) => (
                    <p key={idx} className="text-sm text-gray-600 dark:text-gray-400 ml-4">
                      {idx + 1}. {step}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <MessageSquare className="w-6 h-6 text-purple-600" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">AI Sohbet</h3>
          </div>

          <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
            {chatHistory.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Portföyünüz hakkında sorular sorun!
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    onClick={() => setChatInput('Risk profilim nedir?')}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Risk profilim nedir?
                  </button>
                  <button
                    onClick={() => setChatInput('Hangi hisseyi almalıyım?')}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Hangi hisseyi almalıyım?
                  </button>
                  <button
                    onClick={() => setChatInput('Performansım nasıl?')}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Performansım nasıl?
                  </button>
                </div>
              </div>
            )}

            {chatHistory.map((chat, index) => (
              <div key={index} className="space-y-3">
                <div className="flex justify-end">
                  <div className="bg-purple-600 text-white rounded-lg px-4 py-2 max-w-md">
                    <p className="text-sm">{chat.question}</p>
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-3 max-w-md">
                    <p className="text-sm text-gray-900 dark:text-white mb-2">{chat.answer}</p>
                    {chat.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {chat.suggestions.map((suggestion, idx) => (
                          <button
                            key={idx}
                            onClick={() => setChatInput(suggestion)}
                            className="px-2 py-1 bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs hover:bg-gray-50 dark:hover:bg-gray-500"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleChatSubmit()}
              placeholder="Portföyünüz hakkında soru sorun..."
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <button
              onClick={handleChatSubmit}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
