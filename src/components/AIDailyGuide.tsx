import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, TrendingUp, TrendingDown, AlertTriangle, Shield,
  Target, ArrowRight, ChevronDown, ChevronUp, Sparkles,
  RefreshCw, PieChart, Scale, Zap
} from 'lucide-react';
import { Holding } from '../lib/supabase';
import { analyzeRiskProfile, RiskProfile, AIRecommendation } from '../services/aiAdvisorService';
import { generateBuySellSignals, calculatePortfolioScore, BuySellSignal, PortfolioScore } from '../services/advancedAI';
import { formatCurrency } from '../services/priceService';

interface AIDailyGuideProps {
  holdings: Holding[];
  totalValue: number;
  totalInvestment: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
}

interface DailyAnalysis {
  greeting: string;
  healthScore: number;
  healthGrade: string;
  healthColor: string;
  topAction: string;
  topActionType: 'success' | 'warning' | 'danger' | 'info';
  insights: Insight[];
  signals: BuySellSignal[];
  riskProfile: RiskProfile | null;
  portfolioScore: PortfolioScore | null;
}

interface Insight {
  icon: 'warning' | 'success' | 'info' | 'danger';
  title: string;
  description: string;
  action?: string;
  actionRoute?: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'İyi geceler';
  if (hour < 12) return 'Günaydın';
  if (hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

function analyzePortfolio(
  holdings: Holding[],
  totalValue: number,
  totalInvestment: number,
  totalProfitLoss: number,
  totalProfitLossPercent: number,
  riskProfile: RiskProfile | null,
  portfolioScore: PortfolioScore | null,
  signals: BuySellSignal[]
): DailyAnalysis {
  const insights: Insight[] = [];
  const greeting = getGreeting();

  // 1. Concentration check
  const assetValues = holdings.map(h => ({
    symbol: h.symbol,
    value: h.current_price * h.quantity,
    type: h.asset_type,
    pnlPercent: h.purchase_price > 0
      ? ((h.current_price - h.purchase_price) / h.purchase_price) * 100
      : 0,
  }));

  const sortedByValue = [...assetValues].sort((a, b) => b.value - a.value);
  if (sortedByValue.length > 0 && totalValue > 0) {
    const topConcentration = (sortedByValue[0].value / totalValue) * 100;
    if (topConcentration > 40) {
      insights.push({
        icon: 'danger',
        title: `${sortedByValue[0].symbol} çok yoğun (%${topConcentration.toFixed(0)})`,
        description: `Portföyünüzün %${topConcentration.toFixed(0)}'ı tek varlıkta. Riski azaltmak için çeşitlendirme yapın.`,
        action: 'Rebalance Yap',
        actionRoute: '/rebalancing',
      });
    } else if (topConcentration > 25) {
      insights.push({
        icon: 'warning',
        title: `${sortedByValue[0].symbol} yoğunluğu yüksek (%${topConcentration.toFixed(0)})`,
        description: 'En büyük pozisyonunuz portföyün çeyreğinden fazla. İzlemeye devam edin.',
      });
    }
  }

  // 2. Losing positions
  const bigLosers = assetValues.filter(a => a.pnlPercent < -10);
  if (bigLosers.length > 0) {
    const worst = bigLosers.sort((a, b) => a.pnlPercent - b.pnlPercent)[0];
    insights.push({
      icon: 'danger',
      title: `${worst.symbol} zararda (%${worst.pnlPercent.toFixed(1)})`,
      description: bigLosers.length > 1
        ? `${bigLosers.length} varlık %10'dan fazla zararda. Stop-loss seviyeleri belirleyin.`
        : `Bu varlık için stop-loss seviyesi belirlemeyi düşünün.`,
    });
  }

  // 3. Big winners
  const bigWinners = assetValues.filter(a => a.pnlPercent > 30);
  if (bigWinners.length > 0) {
    const best = bigWinners.sort((a, b) => b.pnlPercent - a.pnlPercent)[0];
    insights.push({
      icon: 'success',
      title: `${best.symbol} güçlü kârda (%${best.pnlPercent.toFixed(1)})`,
      description: 'Kâr realizasyonu düşünebilirsiniz. Kârın bir kısmını güvenceye alın.',
    });
  }

  // 4. Asset type diversity
  const assetTypes = new Set(holdings.map(h => h.asset_type));
  if (assetTypes.size < 3 && holdings.length >= 3) {
    insights.push({
      icon: 'warning',
      title: 'Çeşitlendirme yetersiz',
      description: `Sadece ${assetTypes.size} varlık türünüz var. Hisse, kripto, emtia ve döviz karışımı riski azaltır.`,
      action: 'Analiz Et',
      actionRoute: '/allocation',
    });
  }

  // 5. Buy/Sell signals
  const strongBuys = signals.filter(s => s.signal === 'strong_buy');
  const strongSells = signals.filter(s => s.signal === 'strong_sell');

  if (strongSells.length > 0) {
    insights.push({
      icon: 'danger',
      title: `${strongSells.map(s => s.symbol).join(', ')} için güçlü SAT sinyali`,
      description: `Teknik göstergeler ${strongSells.length} varlık için satış öneriyor.`,
    });
  }

  if (strongBuys.length > 0) {
    insights.push({
      icon: 'success',
      title: `${strongBuys.map(s => s.symbol).join(', ')} için güçlü AL sinyali`,
      description: `Teknik göstergeler ${strongBuys.length} varlık için alım fırsatı gösteriyor.`,
    });
  }

  // 6. Risk level
  if (riskProfile && riskProfile.level === 'very_aggressive') {
    insights.push({
      icon: 'warning',
      title: 'Risk seviyeniz çok yüksek',
      description: `Risk skoru: ${riskProfile.score.toFixed(0)}/100. Daha güvenli varlıklar eklemeyi düşünün.`,
      action: 'Senaryo Analizi',
      actionRoute: '/scenario',
    });
  }

  // 7. Overall PnL insight
  if (totalProfitLossPercent > 0) {
    insights.push({
      icon: 'info',
      title: `Portföy toplam %${totalProfitLossPercent.toFixed(1)} kârda`,
      description: `Toplam kâr: ${formatCurrency(totalProfitLoss)} ₺. Düzenli olarak kâr realizasyonu stratejisi uygulayın.`,
    });
  } else if (totalProfitLossPercent < -5) {
    insights.push({
      icon: 'warning',
      title: `Portföy toplam %${Math.abs(totalProfitLossPercent).toFixed(1)} zararda`,
      description: 'Panik satış yapmayın. Varlıklarınızın temel analizini gözden geçirin.',
      action: 'AI Danışman',
      actionRoute: '/ai-advisor',
    });
  }

  // Determine top action
  let topAction = 'Portföyünüz dengeli görünüyor. İzlemeye devam edin.';
  let topActionType: 'success' | 'warning' | 'danger' | 'info' = 'success';

  const dangerInsights = insights.filter(i => i.icon === 'danger');
  const warningInsights = insights.filter(i => i.icon === 'warning');

  if (dangerInsights.length > 0) {
    topAction = dangerInsights[0].title;
    topActionType = 'danger';
  } else if (warningInsights.length > 0) {
    topAction = warningInsights[0].title;
    topActionType = 'warning';
  } else if (strongBuys.length > 0) {
    topAction = `${strongBuys[0].symbol} için alım fırsatı!`;
    topActionType = 'info';
  }

  // Health score
  const healthScore = portfolioScore?.overall ?? 65;
  const healthGrade = portfolioScore?.grade ?? (healthScore >= 80 ? 'A' : healthScore >= 60 ? 'B' : healthScore >= 40 ? 'C' : 'D');
  const healthColor = healthScore >= 80 ? 'text-green-500' : healthScore >= 60 ? 'text-blue-500' : healthScore >= 40 ? 'text-yellow-500' : 'text-red-500';

  return {
    greeting,
    healthScore,
    healthGrade,
    healthColor,
    topAction,
    topActionType,
    insights: insights.slice(0, 5),
    signals,
    riskProfile,
    portfolioScore,
  };
}

const iconMap = {
  warning: <AlertTriangle size={16} className="text-yellow-500" />,
  success: <TrendingUp size={16} className="text-green-500" />,
  info: <Sparkles size={16} className="text-blue-500" />,
  danger: <Shield size={16} className="text-red-500" />,
};

const actionColors = {
  success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300',
  warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300',
  danger: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300',
  info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300',
};

export function AIDailyGuide({ holdings, totalValue, totalInvestment, totalProfitLoss, totalProfitLossPercent }: AIDailyGuideProps) {
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<DailyAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const hasRunRef = useRef(false);
  const holdingsCountRef = useRef(0);

  useEffect(() => {
    if (holdings.length === 0) {
      setLoading(false);
      return;
    }
    // Only run on first load or when holdings count changes (add/delete)
    // NOT on every price update
    if (!hasRunRef.current || holdings.length !== holdingsCountRef.current) {
      hasRunRef.current = true;
      holdingsCountRef.current = holdings.length;
      runAnalysis();
    }
  }, [holdings.length]);

  async function runAnalysis() {
    setLoading(true);
    try {
      const [riskProfile, signals, portfolioScore] = await Promise.allSettled([
        analyzeRiskProfile(holdings),
        generateBuySellSignals(holdings),
        calculatePortfolioScore(holdings),
      ]);

      const result = analyzePortfolio(
        holdings,
        totalValue,
        totalInvestment,
        totalProfitLoss,
        totalProfitLossPercent,
        riskProfile.status === 'fulfilled' ? riskProfile.value : null,
        portfolioScore.status === 'fulfilled' ? portfolioScore.value : null,
        signals.status === 'fulfilled' ? signals.value : [],
      );
      setAnalysis(result);
    } catch (error) {
      console.error('AI analysis failed:', error);
    }
    setLoading(false);
  }

  if (holdings.length === 0) return null;

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 dark:from-indigo-900/20 dark:via-purple-900/20 dark:to-blue-900/20 rounded-2xl p-5 border border-indigo-200/50 dark:border-indigo-800/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
            <Brain className="text-indigo-600 dark:text-indigo-400 animate-pulse" size={22} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200">AI Portföy Analizi</h3>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">Portföyünüz analiz ediliyor...</p>
          </div>
          <RefreshCw className="ml-auto animate-spin text-indigo-400" size={16} />
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 dark:from-indigo-900/20 dark:via-purple-900/20 dark:to-blue-900/20 rounded-2xl border border-indigo-200/50 dark:border-indigo-800/50 overflow-hidden">
      {/* Header */}
      <div
        className="p-4 md:p-5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
            <Brain className="text-white" size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-bold text-indigo-900 dark:text-indigo-100">
                {analysis.greeting}! AI Rehberiniz
              </h3>
              <button
                onClick={(e) => { e.stopPropagation(); runAnalysis(); }}
                className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg transition-colors"
              >
                <RefreshCw size={14} className="text-indigo-400" />
              </button>
            </div>

            {/* Top Action Banner */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium ${actionColors[analysis.topActionType]}`}>
              {analysis.topActionType === 'danger' ? <AlertTriangle size={15} /> :
               analysis.topActionType === 'warning' ? <AlertTriangle size={15} /> :
               analysis.topActionType === 'success' ? <TrendingUp size={15} /> :
               <Sparkles size={15} />}
              <span className="truncate">{analysis.topAction}</span>
            </div>
          </div>

          {/* Health Score */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className={`text-2xl font-black ${analysis.healthColor}`}>
              {analysis.healthGrade}
            </div>
            <div className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider">
              Sağlık
            </div>
          </div>

          <button className="p-1 text-indigo-400">
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-3">
          {/* Insights */}
          {analysis.insights.map((insight, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl"
            >
              <div className="mt-0.5">{iconMap[insight.icon]}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{insight.title}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{insight.description}</p>
              </div>
              {insight.action && insight.actionRoute && (
                <button
                  onClick={() => navigate(insight.actionRoute!)}
                  className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                >
                  {insight.action}
                  <ArrowRight size={12} />
                </button>
              )}
            </div>
          ))}

          {/* Quick Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => navigate('/ai-advisor')}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
            >
              <Brain size={14} />
              AI'a Sor
            </button>
            <button
              onClick={() => navigate('/rebalancing')}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Scale size={14} />
              Rebalance
            </button>
            <button
              onClick={() => navigate('/scenario')}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Zap size={14} />
              Senaryo
            </button>
            <button
              onClick={() => navigate('/analytics')}
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <PieChart size={14} />
              Analitik
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
