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

export type TradePlatform = 'Revolut' | 'BIST' | 'Genel';

export interface Trade {
  symbol: string;
  asset_type: string;
  action: 'buy' | 'sell';
  amount: number;
  shares: number;
  current_price: number;
  reason: string;
  platform?: TradePlatform;
}

// Asset type başına ortalama yıllık temettü/kupon/staking yield (USD-eşdeğer)
export const ASSET_TYPE_YIELD: Record<string, number> = {
  stock: 0.03,      // BIST + US dividend hisse karışımı, ortalama %3
  fund: 0.02,       // BIST temettü fonu ortalaması
  eurobond: 0.05,   // US Treasury kupon ~%5
  crypto: 0.02,     // sadece staking yapılan kısım için
  commodity: 0,     // altın temettü vermez
  currency: 0.01,   // USDC staking + minimal mevduat faizi
  cash: 0,
};

// Strateji uygulanırsa beklenen yıllık pasif gelir
export function calculatePassiveIncome(
  targetAllocations: Record<string, number>,
  totalValue: number,
): { yearly: number; monthly: number } {
  const yearly = Object.entries(targetAllocations).reduce((sum, [type, pct]) => {
    const yld = ASSET_TYPE_YIELD[type] ?? 0;
    return sum + (totalValue * (pct / 100)) * yld;
  }, 0);
  return { yearly, monthly: yearly / 12 };
}

function formatPercent(v?: number): string {
  return `%${(v ?? 0).toFixed(1)}`;
}

// Sembolden platform tahmini
export function inferPlatform(symbol: string, assetType: string): TradePlatform {
  if (assetType === 'crypto') return 'Genel';
  if (assetType === 'currency') return 'Genel';
  if (assetType === 'commodity') return 'Genel';
  if (assetType === 'eurobond') return 'Revolut';
  // Hisse: 4-5 harf büyük TR ticker → BIST, aksi → Revolut
  const trBistRegex = /^[A-Z]{3,5}$/;
  const knownTR = ['ASELS', 'TUPRS', 'GARAN', 'BIMAS', 'TCELL', 'CCOLA', 'SAHOL', 'EREGL', 'EKGYO', 'TOASO', 'TTKOM', 'AKSEN', 'ENKAI', 'THYAO', 'SISE'];
  if (knownTR.includes(symbol)) return 'BIST';
  if (trBistRegex.test(symbol) && symbol.length <= 5) {
    // Bilinen US tickerlar
    const knownUS = ['JNJ', 'AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN', 'META', 'TSLA', 'KO', 'PEP', 'PG', 'WMT', 'JPM', 'V', 'MCD', 'O', 'SCHD', 'VYM', 'VIG', 'HDV', 'ASML'];
    if (knownUS.includes(symbol)) return 'Revolut';
    return 'BIST'; // varsayılan kısa ticker → BIST
  }
  return 'Revolut';
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
  income: {
    name: 'Gelir Odaklı (Maaş)',
    target_allocations: {
      stock: 30,      // temettü hisseler (Revolut: SCHD/VYM/JNJ/KO + BIST: TUPRS/GARAN)
      eurobond: 25,   // ~%5 kupon
      fund: 15,       // BIST temettü fonları
      commodity: 12,  // altın stabilizatör
      currency: 10,   // yastık (acil)
      crypto: 8,      // staking + uzun vade
    },
    deviation_threshold: 10,
    is_active: true,
  },
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
      // currency tipi için "buy" anlamsız (USD/EUR alımı bir trade değil, transfer)
      // Sadece holdings'i azaltarak hedefe ulaşılır.
      if (assetType === 'currency') {
        return;
      }

      // Asset tipi için varsayılan öneri sembolü (yoksa kategorik öneri ver)
      const defaultSymbolByType: Record<string, { sym: string; price: number; platform: TradePlatform; note: string }> = {
        stock:    { sym: 'SCHD',  price: 28,  platform: 'Revolut', note: 'temettü ETF' },
        fund:     { sym: 'GPA',   price: 21,  platform: 'BIST',    note: 'BIST temettü fonu' },
        eurobond: { sym: 'US-T',  price: 100, platform: 'Revolut', note: 'US Treasury 5y' },
        crypto:   { sym: 'BTC',   price: 0,   platform: 'Genel',   note: 'mevcut pozisyona ekle' },
        commodity:{ sym: 'ALTIN', price: 6800, platform: 'Genel',  note: 'gram altın' },
      };
      const defaults = defaultSymbolByType[assetType];

      const symbol = holdingsOfType.length > 0 ? holdingsOfType[0].symbol : (defaults?.sym ?? assetType.toUpperCase());
      const currentPrice = holdingsOfType.length > 0
        ? holdingsOfType[0].current_price
        : (defaults?.price && defaults.price > 0 ? defaults.price : 100);
      const platform = inferPlatform(symbol, assetType);

      trades.push({
        symbol,
        asset_type: assetType,
        action: 'buy',
        amount: difference,
        shares: currentPrice > 0 ? difference / currentPrice : 0,
        current_price: currentPrice,
        reason: `Hedef: %${targetAllocations[assetType]?.toFixed(1) || 0}, Mevcut: %${((currentValue / totalValue) * 100).toFixed(1)}${defaults && holdingsOfType.length === 0 ? ` · öneri: ${defaults.note}` : ''}`,
        platform,
      });
    } else if (difference < 0) {
      // currency tipi azaltma → "sat" değil, "transfer/yatır" mantığında
      if (assetType === 'currency') {
        const symbol = holdingsOfType.length > 0 ? holdingsOfType[0].symbol : 'USD';
        const currentPrice = holdingsOfType.length > 0 ? holdingsOfType[0].current_price : 1;
        trades.push({
          symbol,
          asset_type: assetType,
          action: 'sell',
          amount: Math.abs(difference),
          shares: currentPrice > 0 ? Math.abs(difference) / currentPrice : 0,
          current_price: currentPrice,
          reason: `Cash fazla — ${formatPercent(targetAllocations[assetType])} hedef için yatırıma yönlendir`,
          platform: 'Genel',
        });
        return;
      }

      const sortedHoldings = [...holdingsOfType].sort((a, b) => {
        const profitA = ((a.current_price - a.purchase_price) / a.purchase_price) * 100;
        const profitB = ((b.current_price - b.purchase_price) / b.purchase_price) * 100;
        return profitB - profitA; // önce kâra geçmiş olanı sat
      });

      let remainingToSell = Math.abs(difference);

      sortedHoldings.forEach((holding) => {
        if (remainingToSell <= 0) return;

        const holdingValue = holding.current_price * holding.quantity;
        const sellValue = Math.min(holdingValue, remainingToSell);
        const sellShares = holding.current_price > 0 ? sellValue / holding.current_price : 0;

        trades.push({
          symbol: holding.symbol,
          asset_type: assetType,
          action: 'sell',
          amount: sellValue,
          shares: sellShares,
          current_price: holding.current_price,
          reason: `Hedef: %${targetAllocations[assetType]?.toFixed(1) || 0}, Mevcut: %${((currentValue / totalValue) * 100).toFixed(1)}`,
          platform: inferPlatform(holding.symbol, assetType),
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
