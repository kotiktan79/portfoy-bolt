import { supabase } from '../lib/supabase';

export interface Holding {
  id: string;
  symbol: string;
  asset_type: string;
  quantity: number;
  current_price: number;
  purchase_price: number;
}

export interface Allocation {
  asset_type: string;
  current_value: number;
  current_percent: number;
  target_percent: number;
  deviation: number;
}

export interface Trade {
  symbol: string;
  asset_type: string;
  action: 'buy' | 'sell';
  amount: number;
  shares: number;
  current_price: number;
  reason: string;
}

export interface RebalancingStrategy {
  id?: string;
  portfolio_id?: string;
  name: string;
  target_allocations: Record<string, number>;
  deviation_threshold: number;
  is_active: boolean;
}

export interface RebalancingSimulation {
  id?: string;
  portfolio_id: string;
  strategy_id?: string;
  current_allocations: Record<string, number>;
  target_allocations: Record<string, number>;
  suggested_trades: Trade[];
  expected_cost: number;
  deviation_before: number;
  deviation_after: number;
  status: 'pending' | 'executed' | 'cancelled';
}

export const PRESET_STRATEGIES: Record<string, RebalancingStrategy> = {
  conservative: {
    name: 'Muhafazakar',
    target_allocations: {
      stock: 20,
      fund: 30,
      eurobond: 25,
      currency: 15,
      commodity: 10,
      crypto: 0,
    },
    deviation_threshold: 10,
    is_active: true,
  },
  balanced: {
    name: 'Dengeli',
    target_allocations: {
      stock: 40,
      fund: 20,
      eurobond: 15,
      currency: 10,
      commodity: 10,
      crypto: 5,
    },
    deviation_threshold: 10,
    is_active: true,
  },
  aggressive: {
    name: 'Agresif',
    target_allocations: {
      stock: 50,
      crypto: 20,
      fund: 15,
      commodity: 10,
      currency: 5,
      eurobond: 0,
    },
    deviation_threshold: 10,
    is_active: true,
  },
};

export async function calculateCurrentAllocations(holdings: Holding[]): Promise<Allocation[]> {
  const totalValue = holdings.reduce((sum, h) => sum + h.current_price * h.quantity, 0);

  if (totalValue === 0) {
    return [];
  }

  const allocationMap = new Map<string, Allocation>();

  holdings.forEach((holding) => {
    const value = holding.current_price * holding.quantity;
    const percent = (value / totalValue) * 100;

    if (allocationMap.has(holding.asset_type)) {
      const existing = allocationMap.get(holding.asset_type)!;
      existing.current_value += value;
      existing.current_percent += percent;
    } else {
      allocationMap.set(holding.asset_type, {
        asset_type: holding.asset_type,
        current_value: value,
        current_percent: percent,
        target_percent: 0,
        deviation: 0,
      });
    }
  });

  return Array.from(allocationMap.values());
}

export function calculateDeviations(
  allocations: Allocation[],
  targetAllocations: Record<string, number>
): Allocation[] {
  return allocations.map((allocation) => ({
    ...allocation,
    target_percent: targetAllocations[allocation.asset_type] || 0,
    deviation: allocation.current_percent - (targetAllocations[allocation.asset_type] || 0),
  }));
}

export function calculateTotalDeviation(allocations: Allocation[]): number {
  return allocations.reduce((sum, a) => sum + Math.abs(a.deviation), 0) / 2;
}

export function generateRebalancingTrades(
  holdings: Holding[],
  targetAllocations: Record<string, number>,
  feePercent: number = 0.1
): Trade[] {
  const totalValue = holdings.reduce((sum, h) => sum + h.current_price * h.quantity, 0);

  if (totalValue === 0) {
    return [];
  }

  const currentByType = new Map<string, { value: number; holdings: Holding[] }>();

  holdings.forEach((holding) => {
    const value = holding.current_price * holding.quantity;
    if (!currentByType.has(holding.asset_type)) {
      currentByType.set(holding.asset_type, { value: 0, holdings: [] });
    }
    const entry = currentByType.get(holding.asset_type)!;
    entry.value += value;
    entry.holdings.push(holding);
  });

  const trades: Trade[] = [];
  const assetTypes = new Set([
    ...Object.keys(targetAllocations),
    ...Array.from(currentByType.keys()),
  ]);

  assetTypes.forEach((assetType) => {
    const currentValue = currentByType.get(assetType)?.value || 0;
    const targetValue = (totalValue * (targetAllocations[assetType] || 0)) / 100;
    const difference = targetValue - currentValue;

    if (Math.abs(difference) < totalValue * 0.01) {
      return;
    }

    const holdingsOfType = currentByType.get(assetType)?.holdings || [];

    if (difference > 0) {
      const symbol = holdingsOfType.length > 0 ? holdingsOfType[0].symbol : `${assetType.toUpperCase()}_INDEX`;
      const currentPrice = holdingsOfType.length > 0 ? holdingsOfType[0].current_price : 100;

      trades.push({
        symbol,
        asset_type: assetType,
        action: 'buy',
        amount: difference,
        shares: difference / currentPrice,
        current_price: currentPrice,
        reason: `Hedef: %${targetAllocations[assetType]?.toFixed(1) || 0}, Mevcut: %${((currentValue / totalValue) * 100).toFixed(1)}`,
      });
    } else if (difference < 0) {
      const sortedHoldings = [...holdingsOfType].sort((a, b) => {
        const profitA = ((a.current_price - a.purchase_price) / a.purchase_price) * 100;
        const profitB = ((b.current_price - b.purchase_price) / b.purchase_price) * 100;
        return profitA - profitB;
      });

      let remainingToSell = Math.abs(difference);

      sortedHoldings.forEach((holding) => {
        if (remainingToSell <= 0) return;

        const holdingValue = holding.current_price * holding.quantity;
        const sellValue = Math.min(holdingValue, remainingToSell);
        const sellShares = sellValue / holding.current_price;

        trades.push({
          symbol: holding.symbol,
          asset_type: assetType,
          action: 'sell',
          amount: sellValue,
          shares: sellShares,
          current_price: holding.current_price,
          reason: `Hedef: %${targetAllocations[assetType]?.toFixed(1) || 0}, Mevcut: %${((currentValue / totalValue) * 100).toFixed(1)}`,
        });

        remainingToSell -= sellValue;
      });
    }
  });

  trades.forEach((trade) => {
    if (trade.action === 'buy') {
      // Buy: total cost increases with fee
      trade.amount = trade.amount * (1 + feePercent / 100);
    } else {
      // Sell: net proceeds decrease with fee
      trade.amount = trade.amount * (1 - feePercent / 100);
    }
  });

  return trades;
}

export async function saveRebalancingStrategy(strategy: RebalancingStrategy): Promise<string> {
  const { data, error } = await supabase
    .from('rebalancing_strategies')
    .insert([strategy])
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function getRebalancingStrategies(portfolioId?: string): Promise<RebalancingStrategy[]> {
  let query = supabase
    .from('rebalancing_strategies')
    .select('*')
    .order('created_at', { ascending: false });

  if (portfolioId) {
    query = query.eq('portfolio_id', portfolioId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function saveRebalancingSimulation(simulation: RebalancingSimulation): Promise<string> {
  const { data, error } = await supabase
    .from('rebalancing_simulations')
    .insert([simulation])
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function executeRebalancing(
  simulationId: string,
  portfolioId: string,
  trades: Trade[]
): Promise<void> {
  const totalValue = trades.reduce((sum, t) => sum + t.amount, 0);

  await supabase.from('rebalancing_history').insert([
    {
      portfolio_id: portfolioId,
      simulation_id: simulationId,
      trades_executed: trades,
      total_cost: totalValue * 0.001,
      portfolio_value_before: 0,
      portfolio_value_after: 0,
      executed_at: new Date().toISOString(),
    },
  ]);

  await supabase
    .from('rebalancing_simulations')
    .update({ status: 'executed', executed_at: new Date().toISOString() })
    .eq('id', simulationId);

  for (const trade of trades) {
    if (trade.action === 'sell') {
      const { data: holdings } = await supabase
        .from('holdings')
        .select('*')
        .eq('symbol', trade.symbol)
        .eq('portfolio_id', portfolioId);

      if (holdings && holdings.length > 0) {
        const holding = holdings[0];
        const newQuantity = holding.quantity - trade.shares;

        if (newQuantity <= 0.001) {
          await supabase.from('holdings').delete().eq('id', holding.id);
        } else {
          await supabase
            .from('holdings')
            .update({ quantity: newQuantity })
            .eq('id', holding.id);
        }

        await supabase.from('transactions').insert([
          {
            holding_id: holding.id,
            portfolio_id: portfolioId,
            transaction_type: 'sell',
            quantity: trade.shares,
            price: trade.current_price,
            total_amount: trade.amount,
            transaction_date: new Date().toISOString(),
            notes: `Rebalancing: ${trade.reason}`,
          },
        ]);
      }
    }
  }
}
