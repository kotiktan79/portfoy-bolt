// 2026-09-22: yalnız yapısal risk profili kaldı (çeşitlendirme/volatilite/konsantrasyon/dağılım). Öneri, sentiment,
// içgörü ve ai_analyses kaydı KALDIRILDI — AI işlem önermez; tek plan sabit.
import { Holding } from '../lib/supabase';
import { getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';

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

  const totalValue = holdings.reduce((sum, h) => sum + holdingValueTRY(h, getFxRatesFromHoldings(holdings)), 0);

  const assetTypes = new Map<string, number>();
  holdings.forEach((h) => {
    const value = holdingValueTRY(h, getFxRatesFromHoldings(holdings));
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
