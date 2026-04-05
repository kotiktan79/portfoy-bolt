import { supabase, Holding } from '../lib/supabase';

export interface RiskProfile {
  level: 'conservative' | 'moderate' | 'aggressive' | 'very_aggressive';
  score: number;
  volatility_tolerance: number;
  loss_tolerance: number;
  investment_horizon: 'short' | 'medium' | 'long';
  factors: {
    diversification: number;
    volatility: number;
    concentration: number;
    asset_allocation: number;
  };
}

export interface AIRecommendation {
  type: 'buy' | 'sell' | 'hold' | 'rebalance' | 'warning';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  reason: string;
  impact: string;
  action?: {
    symbol?: string;
    amount?: number;
    target_allocation?: Record<string, number>;
  };
  confidence: number;
}

export interface MarketSentiment {
  overall: 'bullish' | 'bearish' | 'neutral';
  score: number;
  signals: {
    technical: number;
    fundamental: number;
    sentiment: number;
  };
  trends: {
    short_term: 'up' | 'down' | 'sideways';
    medium_term: 'up' | 'down' | 'sideways';
    long_term: 'up' | 'down' | 'sideways';
  };
}

export interface PortfolioInsight {
  category: 'performance' | 'risk' | 'opportunity' | 'alert';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  data?: any;
}

export async function analyzeRiskProfile(holdings: Holding[]): Promise<RiskProfile> {
  if (holdings.length === 0) {
    return {
      level: 'conservative',
      score: 0,
      volatility_tolerance: 0,
      loss_tolerance: 0,
      investment_horizon: 'short',
      factors: {
        diversification: 0,
        volatility: 0,
        concentration: 0,
        asset_allocation: 0,
      },
    };
  }

  const totalValue = holdings.reduce((sum, h) => sum + h.current_price * h.quantity, 0);

  const assetTypes = new Map<string, number>();
  holdings.forEach((h) => {
    const value = h.current_price * h.quantity;
    assetTypes.set(h.asset_type, (assetTypes.get(h.asset_type) || 0) + value);
  });

  const diversification = Math.min(100, (assetTypes.size / 6) * 100);

  const volatilityWeights: Record<string, number> = {
    crypto: 50,
    stock: 30,
    commodity: 25,
    fund: 15,
    currency: 10,
    eurobond: 5,
  };

  let weightedVolatility = 0;
  assetTypes.forEach((value, type) => {
    const weight = value / totalValue;
    const volatility = volatilityWeights[type] || 20;
    weightedVolatility += weight * volatility;
  });

  const cryptoAllocation = (assetTypes.get('crypto') || 0) / totalValue;
  const stockAllocation = (assetTypes.get('stock') || 0) / totalValue;
  const riskAssets = cryptoAllocation + stockAllocation;

  const concentration = Math.max(
    ...Array.from(assetTypes.values()).map((v) => (v / totalValue) * 100)
  );

  const allocationScore = 100 - Math.abs(50 - riskAssets * 100);

  const diversificationScore = diversification;
  const volatilityScore = Math.max(0, 100 - weightedVolatility * 2);
  const concentrationScore = Math.max(0, 100 - concentration);
  const allocationScoreNormalized = allocationScore;

  const overallScore =
    diversificationScore * 0.3 +
    volatilityScore * 0.3 +
    concentrationScore * 0.2 +
    allocationScoreNormalized * 0.2;

  let level: RiskProfile['level'];
  if (overallScore < 40) level = 'very_aggressive';
  else if (overallScore < 55) level = 'aggressive';
  else if (overallScore < 70) level = 'moderate';
  else level = 'conservative';

  let horizon: RiskProfile['investment_horizon'];
  if (riskAssets > 0.6) horizon = 'long';
  else if (riskAssets > 0.3) horizon = 'medium';
  else horizon = 'short';

  return {
    level,
    score: overallScore,
    volatility_tolerance: 100 - weightedVolatility,
    loss_tolerance: volatilityScore,
    investment_horizon: horizon,
    factors: {
      diversification: diversificationScore,
      volatility: volatilityScore,
      concentration: concentrationScore,
      asset_allocation: allocationScoreNormalized,
    },
  };
}

export async function generateAIRecommendations(
  holdings: Holding[],
  riskProfile: RiskProfile
): Promise<AIRecommendation[]> {
  const recommendations: AIRecommendation[] = [];
  const totalValue = holdings.reduce((sum, h) => sum + h.current_price * h.quantity, 0);

  const assetTypes = new Map<string, number>();
  holdings.forEach((h) => {
    const value = h.current_price * h.quantity;
    assetTypes.set(h.asset_type, (assetTypes.get(h.asset_type) || 0) + value);
  });

  if (holdings.length < 5) {
    recommendations.push({
      type: 'buy',
      priority: 'high',
      title: 'Portföyünüzü Çeşitlendirin',
      description: 'Portföyünüzde sadece ' + holdings.length + ' varlık var.',
      reason: 'Çeşitlendirme riski azaltır ve daha istikrarlı getiri sağlar.',
      impact: 'Risk %30-40 azalabilir',
      confidence: 85,
    });
  }

  const cryptoAllocation = ((assetTypes.get('crypto') || 0) / totalValue) * 100;
  if (cryptoAllocation > 30 && riskProfile.level === 'conservative') {
    recommendations.push({
      type: 'rebalance',
      priority: 'high',
      title: 'Kripto Ağırlığı Yüksek',
      description: `Portföyünüzün %${cryptoAllocation.toFixed(1)}'i kriptoda. Risk profilinize göre fazla.`,
      reason: 'Muhafazakar profil için %10-15 kripto ideal.',
      impact: 'Volatilite %40 azalabilir',
      action: {
        target_allocation: {
          crypto: 15,
        },
      },
      confidence: 90,
    });
  }

  if (cryptoAllocation > 50 && riskProfile.level === 'aggressive') {
    recommendations.push({
      type: 'warning',
      priority: 'medium',
      title: 'Yüksek Kripto Konsantrasyonu',
      description: `Portföyünüzün %${cryptoAllocation.toFixed(1)}'i kriptoda.`,
      reason: 'Agresif profil için bile %30-40 kripto yeterli.',
      impact: 'Aşırı volatilite riski',
      confidence: 80,
    });
  }

  const holdingsWithLoss = holdings.filter((h) => {
    const invested = h.purchase_price * h.quantity;
    const current = h.current_price * h.quantity;
    const loss = ((current - invested) / invested) * 100;
    return loss < -20;
  });

  if (holdingsWithLoss.length > 0) {
    holdingsWithLoss.forEach((h) => {
      const invested = h.purchase_price * h.quantity;
      const current = h.current_price * h.quantity;
      const loss = ((current - invested) / invested) * 100;

      recommendations.push({
        type: 'sell',
        priority: 'medium',
        title: `${h.symbol} Değer Kaybediyor`,
        description: `%${Math.abs(loss).toFixed(1)} kayıp var.`,
        reason: 'Stop-loss stratejisi düşünün veya uzun vade için tutun.',
        impact: 'Kayıpları durdurabilir veya toparlanma bekleyebilir',
        action: {
          symbol: h.symbol,
        },
        confidence: 65,
      });
    });
  }

  const holdingsWithBigGain = holdings.filter((h) => {
    const invested = h.purchase_price * h.quantity;
    const current = h.current_price * h.quantity;
    const gain = ((current - invested) / invested) * 100;
    return gain > 50;
  });

  if (holdingsWithBigGain.length > 0) {
    holdingsWithBigGain.slice(0, 2).forEach((h) => {
      const invested = h.purchase_price * h.quantity;
      const current = h.current_price * h.quantity;
      const gain = ((current - invested) / invested) * 100;

      recommendations.push({
        type: 'sell',
        priority: 'low',
        title: `${h.symbol} Güçlü Kazanç`,
        description: `%${gain.toFixed(1)} kar var.`,
        reason: 'Kısmi kar realizasyonu düşünebilirsiniz.',
        impact: 'Karı güvence altına alır',
        action: {
          symbol: h.symbol,
          amount: current * 0.5,
        },
        confidence: 70,
      });
    });
  }

  if (assetTypes.size >= 3) {
    const needsRebalance = Array.from(assetTypes.values()).some((value) => {
      return (value / totalValue) * 100 > 40;
    });

    if (needsRebalance) {
      recommendations.push({
        type: 'rebalance',
        priority: 'medium',
        title: 'Rebalancing Gerekli',
        description: 'Bir varlık sınıfı portföyünüzü domine ediyor.',
        reason: 'Dengeli dağılım daha sağlıklıdır.',
        impact: 'Risk-getiri dengesi iyileşir',
        confidence: 85,
      });
    }
  }

  const bondAllocation = ((assetTypes.get('eurobond') || 0) / totalValue) * 100;
  if (bondAllocation < 10 && riskProfile.level === 'conservative') {
    recommendations.push({
      type: 'buy',
      priority: 'medium',
      title: 'Tahvil Ekleyin',
      description: 'Portföyünüzde yeterli tahvil yok.',
      reason: 'Muhafazakar yatırımcılar için %20-30 tahvil ideal.',
      impact: 'Stabilite artar',
      confidence: 80,
    });
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
}

export async function analyzeMarketSentiment(holdings: Holding[]): Promise<MarketSentiment> {
  const assetTypes = new Map<string, number>();
  const totalValue = holdings.reduce((sum, h) => sum + h.current_price * h.quantity, 0);

  holdings.forEach((h) => {
    const value = h.current_price * h.quantity;
    assetTypes.set(h.asset_type, (assetTypes.get(h.asset_type) || 0) + value);
  });

  const avgPnL =
    holdings.reduce((sum, h) => {
      const invested = h.purchase_price * h.quantity;
      const current = h.current_price * h.quantity;
      return sum + ((current - invested) / invested) * 100;
    }, 0) / holdings.length;

  const technicalScore = avgPnL > 0 ? Math.min(100, 50 + avgPnL * 2) : Math.max(0, 50 + avgPnL * 2);

  const diversificationScore = Math.min(100, (assetTypes.size / 6) * 100);
  const fundamentalScore = diversificationScore;

  const riskAssetRatio =
    ((assetTypes.get('crypto') || 0) + (assetTypes.get('stock') || 0)) / totalValue;
  const sentimentScore = 50 + riskAssetRatio * 50;

  const overallScore = (technicalScore + fundamentalScore + sentimentScore) / 3;

  let overall: MarketSentiment['overall'];
  if (overallScore > 60) overall = 'bullish';
  else if (overallScore < 40) overall = 'bearish';
  else overall = 'neutral';

  const getDirection = (score: number): 'up' | 'down' | 'sideways' => {
    if (score > 55) return 'up';
    if (score < 45) return 'down';
    return 'sideways';
  };

  return {
    overall,
    score: overallScore,
    signals: {
      technical: technicalScore,
      fundamental: fundamentalScore,
      sentiment: sentimentScore,
    },
    trends: {
      short_term: getDirection(technicalScore),
      medium_term: getDirection(fundamentalScore),
      long_term: getDirection(sentimentScore),
    },
  };
}

export async function generatePortfolioInsights(
  holdings: Holding[],
  riskProfile: RiskProfile,
  sentiment: MarketSentiment
): Promise<PortfolioInsight[]> {
  const insights: PortfolioInsight[] = [];

  if (riskProfile.score < 50) {
    insights.push({
      category: 'risk',
      title: 'Yüksek Risk Tespit Edildi',
      message: `Risk skorunuz ${riskProfile.score.toFixed(0)}/100. Portföyünüz ${riskProfile.level} kategorisinde.`,
      severity: 'warning',
      data: riskProfile,
    });
  }

  const totalValue = holdings.reduce((sum, h) => sum + h.current_price * h.quantity, 0);
  const totalInvested = holdings.reduce((sum, h) => sum + h.purchase_price * h.quantity, 0);
  const totalPnL = ((totalValue - totalInvested) / totalInvested) * 100;

  if (totalPnL > 20) {
    insights.push({
      category: 'performance',
      title: 'Güçlü Performans',
      message: `Portföyünüz %${totalPnL.toFixed(1)} getiri sağladı. Harika!`,
      severity: 'info',
      data: { pnl: totalPnL },
    });
  } else if (totalPnL < -10) {
    insights.push({
      category: 'alert',
      title: 'Dikkat: Negatif Getiri',
      message: `Portföyünüz %${Math.abs(totalPnL).toFixed(1)} kayıpla. Stratejinizi gözden geçirin.`,
      severity: 'critical',
      data: { pnl: totalPnL },
    });
  }

  if (sentiment.overall === 'bearish') {
    insights.push({
      category: 'alert',
      title: 'Piyasa Düşüş Eğiliminde',
      message: 'Sentiment analizi düşüş gösteriyor. Savunma pozisyonu düşünün.',
      severity: 'warning',
      data: sentiment,
    });
  } else if (sentiment.overall === 'bullish') {
    insights.push({
      category: 'opportunity',
      title: 'Piyasa Yükselişte',
      message: 'Sentiment analizi pozitif. Fırsatları değerlendirin.',
      severity: 'info',
      data: sentiment,
    });
  }

  if (riskProfile.factors.diversification < 50) {
    insights.push({
      category: 'opportunity',
      title: 'Çeşitlendirme Fırsatı',
      message: 'Daha fazla varlık sınıfına yatırım yaparak riski azaltabilirsiniz.',
      severity: 'info',
    });
  }

  return insights;
}

export async function saveAIAnalysis(
  portfolioId: string,
  riskProfile: RiskProfile,
  recommendations: AIRecommendation[],
  sentiment: MarketSentiment
) {
  try {
    const { error } = await supabase.from('ai_analyses').insert([
      {
        portfolio_id: portfolioId,
        risk_profile: riskProfile,
        recommendations: recommendations,
        market_sentiment: sentiment,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) throw error;
  } catch (error) {
    console.error('Error saving AI analysis:', error);
  }
}
