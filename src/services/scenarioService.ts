import { supabase } from '../lib/supabase';
import { Holding } from './rebalancingService';

export interface ScenarioResult {
  scenario_name: string;
  current_value: number;
  projected_value: number;
  pnl_change: number;
  pnl_percent: number;
  asset_impacts: AssetImpact[];
}

export interface AssetImpact {
  symbol: string;
  asset_type: string;
  current_value: number;
  projected_value: number;
  change: number;
  change_percent: number;
}

export interface MonteCarloResult {
  mean: number;
  median: number;
  worst_case: number;
  best_case: number;
  confidence_95_lower: number;
  confidence_95_upper: number;
  confidence_99_lower: number;
  confidence_99_upper: number;
  probability_loss: number;
  probability_gain_10: number;
  probability_gain_20: number;
}

export const PRESET_SCENARIOS: Record<string, Record<string, number>> = {
  crisis: {
    stock: -30,
    crypto: -50,
    fund: -20,
    currency: 5,
    commodity: 20,
    eurobond: 10,
  },
  boom: {
    stock: 50,
    crypto: 100,
    fund: 30,
    currency: -5,
    commodity: 10,
    eurobond: 5,
  },
  inflation: {
    stock: 10,
    crypto: -20,
    fund: 5,
    currency: -25,
    commodity: 40,
    eurobond: 15,
  },
  recession: {
    stock: -20,
    crypto: -40,
    fund: -15,
    currency: 10,
    commodity: -10,
    eurobond: 20,
  },
  stagflation: {
    stock: -10,
    crypto: -30,
    fund: -5,
    currency: -15,
    commodity: 25,
    eurobond: 5,
  },
};

export function calculateScenario(
  holdings: Holding[],
  priceChanges: Record<string, number>
): ScenarioResult {
  const currentValue = holdings.reduce((sum, h) => sum + h.current_price * h.quantity, 0);

  const assetImpacts: AssetImpact[] = holdings.map((holding) => {
    const changePercent = priceChanges[holding.asset_type] || 0;
    const newPrice = holding.current_price * (1 + changePercent / 100);
    const currentVal = holding.current_price * holding.quantity;
    const projectedVal = newPrice * holding.quantity;
    const change = projectedVal - currentVal;

    return {
      symbol: holding.symbol,
      asset_type: holding.asset_type,
      current_value: currentVal,
      projected_value: projectedVal,
      change,
      change_percent: changePercent,
    };
  });

  const projectedValue = assetImpacts.reduce((sum, a) => sum + a.projected_value, 0);
  const pnlChange = projectedValue - currentValue;
  const pnlPercent = currentValue > 0 ? (pnlChange / currentValue) * 100 : 0;

  return {
    scenario_name: 'Custom Scenario',
    current_value: currentValue,
    projected_value: projectedValue,
    pnl_change: pnlChange,
    pnl_percent: pnlPercent,
    asset_impacts: assetImpacts,
  };
}

export function runMonteCarloSimulation(
  holdings: Holding[],
  iterations: number = 1000,
  volatilityByType: Record<string, number> = {
    stock: 20,
    crypto: 50,
    fund: 10,
    currency: 15,
    commodity: 25,
    eurobond: 5,
  }
): MonteCarloResult {
  const currentValue = holdings.reduce((sum, h) => sum + h.current_price * h.quantity, 0);

  const results: number[] = [];

  for (let i = 0; i < iterations; i++) {
    let simulatedValue = 0;

    holdings.forEach((holding) => {
      const volatility = volatilityByType[holding.asset_type] || 20;
      const randomChange = (Math.random() - 0.5) * 2 * volatility;
      const newPrice = holding.current_price * (1 + randomChange / 100);
      simulatedValue += newPrice * holding.quantity;
    });

    results.push(simulatedValue);
  }

  results.sort((a, b) => a - b);

  const mean = results.reduce((sum, v) => sum + v, 0) / iterations;
  const median = results[Math.floor(iterations / 2)];
  const worst_case = results[0];
  const best_case = results[iterations - 1];

  const confidence_95_lower = results[Math.floor(iterations * 0.025)];
  const confidence_95_upper = results[Math.floor(iterations * 0.975)];
  const confidence_99_lower = results[Math.floor(iterations * 0.005)];
  const confidence_99_upper = results[Math.floor(iterations * 0.995)];

  const lossCount = results.filter((v) => v < currentValue).length;
  const gain10Count = results.filter((v) => v >= currentValue * 1.1).length;
  const gain20Count = results.filter((v) => v >= currentValue * 1.2).length;

  return {
    mean,
    median,
    worst_case,
    best_case,
    confidence_95_lower,
    confidence_95_upper,
    confidence_99_lower,
    confidence_99_upper,
    probability_loss: (lossCount / iterations) * 100,
    probability_gain_10: (gain10Count / iterations) * 100,
    probability_gain_20: (gain20Count / iterations) * 100,
  };
}

export async function saveScenarioAnalysis(
  portfolioId: string,
  scenarioName: string,
  scenarioType: 'preset' | 'custom' | 'monte_carlo',
  priceChanges: Record<string, number>,
  result: ScenarioResult,
  confidenceLevel?: number,
  iterations?: number
): Promise<string> {
  const { data, error } = await supabase
    .from('scenario_analyses')
    .insert([
      {
        portfolio_id: portfolioId,
        scenario_name: scenarioName,
        scenario_type: scenarioType,
        price_changes: priceChanges,
        result_current_value: result.current_value,
        result_projected_value: result.projected_value,
        result_pnl_change: result.pnl_change,
        confidence_level: confidenceLevel,
        iterations: iterations,
      },
    ])
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function getScenarioHistory(portfolioId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('scenario_analyses')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  return data || [];
}

export function compareScenarios(scenarios: ScenarioResult[]): {
  best: ScenarioResult;
  worst: ScenarioResult;
  average_change: number;
} {
  if (scenarios.length === 0) {
    throw new Error('No scenarios to compare');
  }

  const best = scenarios.reduce((prev, curr) =>
    curr.pnl_change > prev.pnl_change ? curr : prev
  );

  const worst = scenarios.reduce((prev, curr) =>
    curr.pnl_change < prev.pnl_change ? curr : prev
  );

  const average_change =
    scenarios.reduce((sum, s) => sum + s.pnl_change, 0) / scenarios.length;

  return { best, worst, average_change };
}
