import { supabase, Holding } from '../lib/supabase';
import type { RiskProfile, AIRecommendation } from './aiAdvisorService';
import { getFxRatesFromHoldings, holdingValueTRY, holdingCostTRY } from '../lib/fx';

export interface TechnicalIndicators {
  rsi: number;
  macd: { value: number; signal: number; histogram: number };
  movingAverages: { ma20: number; ma50: number; ma200: number };
  bollingerBands: { upper: number; middle: number; lower: number };
  momentum: number;
  volatilityIndex: number;
}

export interface BuySellSignal {
  symbol: string;
  signal: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  strength: number;
  reasons: string[];
  technicals: TechnicalIndicators;
  targetPrice?: number;
  stopLoss?: number;
  expectedReturn?: number;
  timeframe: 'short' | 'medium' | 'long';
}

export interface PortfolioScore {
  overall: number;
  breakdown: {
    diversification: number;
    performance: number;
    riskManagement: number;
    assetQuality: number;
    timing: number;
  };
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';
  comparison: {
    vsMarket: number;
    vsPeers: number;
  };
}

export interface SmartSuggestion {
  type: 'add_asset' | 'increase' | 'decrease' | 'exit' | 'sector_rotate';
  symbol: string;
  currentAllocation: number;
  suggestedAllocation: number;
  reason: string;
  expectedImpact: {
    riskChange: number;
    returnChange: number;
    sharpeChange: number;
  };
  priority: number;
  actionSteps: string[];
}

export interface AIResponseContext {
  riskProfile?: RiskProfile;
  portfolioScore?: PortfolioScore;
  topRecommendation?: AIRecommendation;
  strongBuySignal?: string;
  strongSellSignal?: string;
  totalPnL?: number;
}

export interface AIChat {
  question: string;
  answer: string;
  context: AIResponseContext;
  suggestions: string[];
  timestamp: Date;
}

export function calculateTechnicalIndicators(prices: number[]): TechnicalIndicators {
  if (prices.length < 14) {
    return {
      rsi: 50,
      macd: { value: 0, signal: 0, histogram: 0 },
      movingAverages: { ma20: prices[prices.length - 1], ma50: prices[prices.length - 1], ma200: prices[prices.length - 1] },
      bollingerBands: { upper: 0, middle: 0, lower: 0 },
      momentum: 0,
      volatilityIndex: 0,
    };
  }

  const rsi = calculateRSI(prices, 14);
  const macd = calculateMACD(prices);
  const movingAverages = {
    ma20: calculateSMA(prices, 20),
    ma50: calculateSMA(prices, 50),
    ma200: calculateSMA(prices, 200),
  };
  const bollingerBands = calculateBollingerBands(prices, 20);
  const momentum = calculateMomentum(prices, 10);
  const volatilityIndex = calculateVolatility(prices, 20);

  return {
    rsi,
    macd,
    movingAverages,
    bollingerBands,
    momentum,
    volatilityIndex,
  };
}

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  return rsi;
}

function calculateMACD(prices: number[]): { value: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12 - ema26;

  const macdValues = [macdLine];
  const signal = calculateEMA(macdValues, 9);
  const histogram = macdLine - signal;

  return { value: macdLine, signal, histogram };
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];

  const multiplier = 2 / (period + 1);
  let ema = calculateSMA(prices.slice(0, period), period);

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];

  const slice = prices.slice(-period);
  return slice.reduce((sum, price) => sum + price, 0) / period;
}

function calculateBollingerBands(prices: number[], period: number = 20): { upper: number; middle: number; lower: number } {
  const middle = calculateSMA(prices, period);
  const slice = prices.slice(-period);

  const variance = slice.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: middle + stdDev * 2,
    middle,
    lower: middle - stdDev * 2,
  };
}

function calculateMomentum(prices: number[], period: number = 10): number {
  if (prices.length < period) return 0;
  return ((prices[prices.length - 1] - prices[prices.length - period]) / prices[prices.length - period]) * 100;
}

function calculateVolatility(prices: number[], period: number = 20): number {
  if (prices.length < period) return 0;

  const returns = [];
  for (let i = prices.length - period; i < prices.length - 1; i++) {
    returns.push((prices[i + 1] - prices[i]) / prices[i]);
  }

  const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;

  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export async function generateBuySellSignals(holdings: Holding[]): Promise<BuySellSignal[]> {
  const signals: BuySellSignal[] = [];

  for (const holding of holdings) {
    try {
      const { data: priceHistory } = await supabase
        .from('price_history')
        .select('price, recorded_at')
        .eq('symbol', holding.symbol)
        .order('recorded_at', { ascending: true })
        .limit(200);

      const prices = priceHistory?.map((p) => p.price) || [holding.current_price];

      if (prices.length < 2) {
        prices.unshift(holding.purchase_price);
      }

      const indicators = calculateTechnicalIndicators(prices);
      const signal = determineSignal(holding, indicators, prices);
      signals.push(signal);
    } catch (error) {
      console.error(`Error generating signal for ${holding.symbol}:`, error);
    }
  }

  return signals.sort((a, b) => b.strength - a.strength);
}

function determineSignal(holding: Holding, indicators: TechnicalIndicators, prices: number[]): BuySellSignal {
  const reasons: string[] = [];
  let signalStrength = 0;

  if (indicators.rsi < 30) {
    reasons.push('RSI aşırı satım bölgesinde (< 30)');
    signalStrength += 30;
  } else if (indicators.rsi < 40) {
    reasons.push('RSI düşük (< 40)');
    signalStrength += 15;
  } else if (indicators.rsi > 70) {
    reasons.push('RSI aşırı alım bölgesinde (> 70)');
    signalStrength -= 30;
  } else if (indicators.rsi > 60) {
    reasons.push('RSI yüksek (> 60)');
    signalStrength -= 15;
  }

  if (indicators.macd.histogram > 0 && indicators.macd.value > indicators.macd.signal) {
    reasons.push('MACD pozitif crossover');
    signalStrength += 20;
  } else if (indicators.macd.histogram < 0 && indicators.macd.value < indicators.macd.signal) {
    reasons.push('MACD negatif crossover');
    signalStrength -= 20;
  }

  const currentPrice = prices[prices.length - 1];
  const { ma20, ma50, ma200 } = indicators.movingAverages;

  if (currentPrice > ma20 && ma20 > ma50 && ma50 > ma200) {
    reasons.push('Tüm hareketli ortalamalar yükseliş trendinde');
    signalStrength += 25;
  } else if (currentPrice < ma20 && ma20 < ma50 && ma50 < ma200) {
    reasons.push('Tüm hareketli ortalamalar düşüş trendinde');
    signalStrength -= 25;
  }

  if (currentPrice < indicators.bollingerBands.lower) {
    reasons.push('Fiyat Bollinger alt bandının altında');
    signalStrength += 20;
  } else if (currentPrice > indicators.bollingerBands.upper) {
    reasons.push('Fiyat Bollinger üst bandının üstünde');
    signalStrength -= 20;
  }

  if (indicators.momentum > 5) {
    reasons.push(`Güçlü momentum (+${indicators.momentum.toFixed(1)}%)`);
    signalStrength += 15;
  } else if (indicators.momentum < -5) {
    reasons.push(`Zayıf momentum (${indicators.momentum.toFixed(1)}%)`);
    signalStrength -= 15;
  }

  const fxRates = getFxRatesFromHoldings([holding]);
  const currentValue = holdingValueTRY(holding, fxRates);
  const invested = holdingCostTRY(holding, fxRates);
  const pnl = invested > 0 ? ((currentValue - invested) / invested) * 100 : 0;

  if (pnl < -15) {
    reasons.push(`Kayıp pozisyonu (${pnl.toFixed(1)}%)`);
    signalStrength -= 10;
  } else if (pnl > 30) {
    reasons.push(`Güçlü kar pozisyonu (+${pnl.toFixed(1)}%)`);
    signalStrength -= 5;
  }

  let signalType: BuySellSignal['signal'];
  if (signalStrength >= 50) signalType = 'strong_buy';
  else if (signalStrength >= 20) signalType = 'buy';
  else if (signalStrength <= -50) signalType = 'strong_sell';
  else if (signalStrength <= -20) signalType = 'sell';
  else signalType = 'hold';

  const targetPrice = currentPrice * (1 + signalStrength / 200);
  const stopLoss = currentPrice * 0.92;
  const expectedReturn = ((targetPrice - currentPrice) / currentPrice) * 100;

  return {
    symbol: holding.symbol,
    signal: signalType,
    strength: Math.abs(signalStrength),
    reasons,
    technicals: indicators,
    targetPrice,
    stopLoss,
    expectedReturn,
    timeframe: indicators.volatilityIndex > 40 ? 'short' : indicators.volatilityIndex > 20 ? 'medium' : 'long',
  };
}

export async function calculatePortfolioScore(holdings: Holding[]): Promise<PortfolioScore> {
  const totalValue = holdings.reduce((sum, h) => sum + holdingValueTRY(h, getFxRatesFromHoldings(holdings)), 0);
  const totalInvested = holdings.reduce((sum, h) => sum + holdingCostTRY(h, getFxRatesFromHoldings(holdings)), 0);
  const totalPnL = ((totalValue - totalInvested) / totalInvested) * 100;

  const assetTypes = new Set(holdings.map((h) => h.asset_type));
  const diversificationScore = Math.min(100, (assetTypes.size / 6) * 100 + (holdings.length / 20) * 50);

  const performanceScore = Math.min(100, Math.max(0, 50 + totalPnL * 2));

  const volatilityWeights: Record<string, number> = {
    crypto: 50, stock: 30, commodity: 25, fund: 15, currency: 10, eurobond: 5,
  };

  let weightedVolatility = 0;
  const assetTypeValues = new Map<string, number>();
  holdings.forEach((h) => {
    const value = holdingValueTRY(h, getFxRatesFromHoldings(holdings));
    assetTypeValues.set(h.asset_type, (assetTypeValues.get(h.asset_type) || 0) + value);
  });

  assetTypeValues.forEach((value, type) => {
    weightedVolatility += (value / totalValue) * (volatilityWeights[type] || 20);
  });

  const riskManagementScore = Math.max(0, 100 - weightedVolatility * 1.5);

  const avgPnL = holdings.reduce((sum, h) => {
    const invested = holdingCostTRY(h, getFxRatesFromHoldings(holdings));
    const current = holdingValueTRY(h, getFxRatesFromHoldings(holdings));
    return sum + ((current - invested) / invested) * 100;
  }, 0) / holdings.length;

  const consistencyScore = Math.max(0, 100 - holdings.reduce((sum, h) => {
    const invested = holdingCostTRY(h, getFxRatesFromHoldings(holdings));
    const current = holdingValueTRY(h, getFxRatesFromHoldings(holdings));
    const pnl = ((current - invested) / invested) * 100;
    return sum + Math.abs(pnl - avgPnL);
  }, 0) / holdings.length);

  const assetQualityScore = consistencyScore;

  const timingScore = performanceScore;

  const overall =
    diversificationScore * 0.25 +
    performanceScore * 0.25 +
    riskManagementScore * 0.2 +
    assetQualityScore * 0.15 +
    timingScore * 0.15;

  let grade: PortfolioScore['grade'];
  if (overall >= 90) grade = 'A+';
  else if (overall >= 85) grade = 'A';
  else if (overall >= 80) grade = 'B+';
  else if (overall >= 70) grade = 'B';
  else if (overall >= 60) grade = 'C';
  else if (overall >= 50) grade = 'D';
  else grade = 'F';

  return {
    overall,
    breakdown: {
      diversification: diversificationScore,
      performance: performanceScore,
      riskManagement: riskManagementScore,
      assetQuality: assetQualityScore,
      timing: timingScore,
    },
    grade,
    comparison: {
      vsMarket: totalPnL - 15,
      vsPeers: overall - 70,
    },
  };
}

export async function generateSmartSuggestions(
  holdings: Holding[]
): Promise<SmartSuggestion[]> {
  const suggestions: SmartSuggestion[] = [];
  const totalValue = holdings.reduce((sum, h) => sum + holdingValueTRY(h, getFxRatesFromHoldings(holdings)), 0);

  const assetTypes = new Map<string, number>();
  holdings.forEach((h) => {
    const value = holdingValueTRY(h, getFxRatesFromHoldings(holdings));
    assetTypes.set(h.asset_type, (assetTypes.get(h.asset_type) || 0) + value);
  });

  const missingAssets = ['stock', 'fund', 'eurobond', 'currency', 'commodity', 'crypto'].filter(
    (type) => !assetTypes.has(type)
  );

  const symbolSuggestions: Record<string, string[]> = {
    stock: ['GARAN', 'AKBNK', 'THYAO', 'ASELS', 'SISE'],
    fund: ['AFK', 'AFT', 'ABD'],
    eurobond: ['TRYEUROBOND', 'USEUROBOND'],
    currency: ['USD', 'EUR', 'GBP'],
    commodity: ['GOLD', 'SILVER', 'BRENT'],
    crypto: ['BTC', 'ETH', 'USDT'],
  };

  missingAssets.slice(0, 3).forEach((assetType) => {
    const suggestedSymbol = symbolSuggestions[assetType]?.[0] || assetType.toUpperCase();
    suggestions.push({
      type: 'add_asset',
      symbol: suggestedSymbol,
      currentAllocation: 0,
      suggestedAllocation: 10,
      reason: `Portföyünüzde ${assetType} yok. Çeşitlendirme için ekleyin.`,
      expectedImpact: {
        riskChange: -5,
        returnChange: 2,
        sharpeChange: 0.1,
      },
      priority: 80,
      actionSteps: [
        `${suggestedSymbol} hissesini araştırın`,
        `Portföy değerinizin %10'u kadar alım yapın`,
        'İlk alımdan sonra performansı takip edin',
      ],
    });
  });

  holdings.forEach((holding) => {
    const value = holdingValueTRY(holding, getFxRatesFromHoldings(holdings));
    const allocation = (value / totalValue) * 100;

    if (allocation > 25) {
      suggestions.push({
        type: 'decrease',
        symbol: holding.symbol,
        currentAllocation: allocation,
        suggestedAllocation: 15,
        reason: `${holding.symbol} portföyünüzün %${allocation.toFixed(1)}'ini oluşturuyor. Konsantrasyon riski yüksek.`,
        expectedImpact: {
          riskChange: -10,
          returnChange: 0,
          sharpeChange: 0.15,
        },
        priority: 90,
        actionSteps: [
          `${holding.symbol} pozisyonunuzun %${((allocation - 15) / allocation * 100).toFixed(0)}'ini satın`,
          'Satış gelirini farklı varlıklara dağıtın',
          'Kalan pozisyonu takip edin',
        ],
      });
    }

    const invested = holdingCostTRY(holding, getFxRatesFromHoldings(holdings));
    const current = value;
    const pnl = ((current - invested) / invested) * 100;

    if (pnl < -20) {
      suggestions.push({
        type: 'exit',
        symbol: holding.symbol,
        currentAllocation: allocation,
        suggestedAllocation: 0,
        reason: `${holding.symbol} %${Math.abs(pnl).toFixed(1)} kayıpta. Stop-loss stratejisi düşünün.`,
        expectedImpact: {
          riskChange: -5,
          returnChange: -3,
          sharpeChange: 0.05,
        },
        priority: 70,
        actionSteps: [
          'Kaybın daha fazla büyümesini önlemek için pozisyonu kapatın',
          'Alternatif yatırım fırsatlarını değerlendirin',
          'Kayıp nedenini analiz edin',
        ],
      });
    }
  });

  return suggestions.sort((a, b) => b.priority - a.priority);
}

export function generateAIResponse(question: string, context: AIResponseContext): AIChat {
  const lowerQ = question.toLowerCase();
  let answer = '';
  const suggestions: string[] = [];

  if (lowerQ.includes('ne yapmalı') || lowerQ.includes('öneri')) {
    answer = `Portföyünüzün risk skoru ${context.riskProfile?.score?.toFixed(0) || 'hesaplanıyor'}. En önemli önerim: ${context.topRecommendation?.title || 'Portföyünüzü çeşitlendirin'}. Detaylar için AI öneriler bölümüne bakın.`;
    suggestions.push('Risk profilimi nasıl düşürürüm?', 'Hangi varlığı almalıyım?');
  } else if (lowerQ.includes('risk')) {
    answer = `Risk seviyeniz "${context.riskProfile?.level || 'bilinmiyor'}". Risk faktörleri: Çeşitlendirme ${context.riskProfile?.factors?.diversification?.toFixed(0) || 0}%, Volatilite ${context.riskProfile?.factors?.volatility?.toFixed(0) || 0}%.`;
    suggestions.push('Riskimi nasıl azaltırım?', 'Bu risk seviyesi iyi mi?');
  } else if (lowerQ.includes('al') || lowerQ.includes('sat')) {
    answer = `En güçlü AL sinyali: ${context.strongBuySignal || 'Hesaplanıyor'}. En güçlü SAT sinyali: ${context.strongSellSignal || 'Hesaplanıyor'}. Teknik analiz sayfasından detaylı sinyalleri görebilirsiniz.`;
    suggestions.push('Hangi varlıkta RSI düşük?', 'MACD sinyalleri nedir?');
  } else if (lowerQ.includes('performans') || lowerQ.includes('getiri')) {
    answer = `Portföy notunuz: ${context.portfolioScore?.grade || 'hesaplanıyor'}. Toplam getiri: ${context.totalPnL?.toFixed(1) || 0}%. Piyasaya göre: ${(context.portfolioScore?.comparison?.vsMarket ?? 0) > 0 ? '+' : ''}${context.portfolioScore?.comparison?.vsMarket?.toFixed(1) || 0}%.`;
    suggestions.push('Notumu nasıl yükseltebilirim?', 'Performansım iyi mi?');
  } else {
    answer = 'Portföyünüz hakkında daha spesifik bir soru sorabilirsiniz. Risk analizi, alım-satım önerileri veya performans değerlendirmesi gibi konularda yardımcı olabilirim.';
    suggestions.push('Risk profilim nedir?', 'Hangi hisseyi almalıyım?', 'Performansım nasıl?');
  }

  return {
    question,
    answer,
    context,
    suggestions,
    timestamp: new Date(),
  };
}
