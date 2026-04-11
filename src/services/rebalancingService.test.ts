import { describe, it, expect } from 'vitest';
import {
  calculateCurrentAllocations,
  calculateDeviations,
  calculateTotalDeviation,
  generateRebalancingTrades,
} from './rebalancingService';

const mockHoldings = [
  { id: '1', symbol: 'THYAO', asset_type: 'stock', quantity: 10, current_price: 350, purchase_price: 300 },
  { id: '2', symbol: 'BTC', asset_type: 'crypto', quantity: 0.1, current_price: 3200000, purchase_price: 2800000 },
  { id: '3', symbol: 'USD', asset_type: 'currency', quantity: 1000, current_price: 38, purchase_price: 36 },
];

describe('calculateCurrentAllocations', () => {
  it('should return empty for no holdings', async () => {
    const result = await calculateCurrentAllocations([]);
    expect(result).toEqual([]);
  });

  it('should calculate correct allocations', async () => {
    const result = await calculateCurrentAllocations(mockHoldings);
    const totalValue = 3500 + 320000 + 38000; // 361500
    expect(result.length).toBe(3);

    const stock = result.find(a => a.asset_type === 'stock');
    expect(stock).toBeDefined();
    expect(stock!.current_value).toBeCloseTo(3500);
    expect(stock!.current_percent).toBeCloseTo((3500 / totalValue) * 100, 1);
  });

  it('should handle zero-price holdings', async () => {
    const holdings = [{ id: '1', symbol: 'X', asset_type: 'stock', quantity: 10, current_price: 0, purchase_price: 0 }];
    const result = await calculateCurrentAllocations(holdings);
    expect(result).toEqual([]);
  });
});

describe('calculateDeviations', () => {
  it('should calculate deviations from target', () => {
    const allocations = [
      { asset_type: 'stock', current_value: 5000, current_percent: 50, target_percent: 0, deviation: 0 },
      { asset_type: 'crypto', current_value: 5000, current_percent: 50, target_percent: 0, deviation: 0 },
    ];
    const targets = { stock: 40, crypto: 60 };
    const result = calculateDeviations(allocations, targets);

    expect(result[0].target_percent).toBe(40);
    expect(result[0].deviation).toBeCloseTo(10); // 50 - 40
    expect(result[1].deviation).toBeCloseTo(-10); // 50 - 60
  });
});

describe('calculateTotalDeviation', () => {
  it('should calculate total deviation correctly', () => {
    const allocations = [
      { asset_type: 'stock', current_value: 0, current_percent: 0, target_percent: 40, deviation: 10 },
      { asset_type: 'crypto', current_value: 0, current_percent: 0, target_percent: 60, deviation: -10 },
    ];
    // (|10| + |-10|) / 2 = 10
    expect(calculateTotalDeviation(allocations)).toBe(10);
  });
});

describe('generateRebalancingTrades', () => {
  it('should return empty for no holdings', () => {
    const result = generateRebalancingTrades([], { stock: 100 });
    expect(result).toEqual([]);
  });

  it('should generate buy/sell trades', () => {
    const holdings = [
      { id: '1', symbol: 'THYAO', asset_type: 'stock', quantity: 100, current_price: 100, purchase_price: 80 },
      { id: '2', symbol: 'BTC', asset_type: 'crypto', quantity: 1, current_price: 10000, purchase_price: 8000 },
    ];
    // Total = 10000 + 10000 = 20000
    // Target: stock 70% = 14000, crypto 30% = 6000
    const trades = generateRebalancingTrades(holdings, { stock: 70, crypto: 30 }, 0);
    expect(trades.length).toBeGreaterThan(0);

    const buyTrade = trades.find(t => t.action === 'buy');
    const sellTrade = trades.find(t => t.action === 'sell');
    expect(buyTrade).toBeDefined();
    expect(sellTrade).toBeDefined();
    expect(buyTrade!.asset_type).toBe('stock');
    expect(sellTrade!.asset_type).toBe('crypto');
  });

  it('should apply fee correctly — buy increases, sell decreases', () => {
    const holdings = [
      { id: '1', symbol: 'THYAO', asset_type: 'stock', quantity: 100, current_price: 100, purchase_price: 80 },
      { id: '2', symbol: 'BTC', asset_type: 'crypto', quantity: 1, current_price: 10000, purchase_price: 8000 },
    ];
    const tradesNoFee = generateRebalancingTrades(holdings, { stock: 70, crypto: 30 }, 0);
    const tradesWithFee = generateRebalancingTrades(holdings, { stock: 70, crypto: 30 }, 1);

    const buyNoFee = tradesNoFee.find(t => t.action === 'buy')!;
    const buyWithFee = tradesWithFee.find(t => t.action === 'buy')!;
    expect(buyWithFee.amount).toBeGreaterThan(buyNoFee.amount); // fee increases buy cost

    const sellNoFee = tradesNoFee.find(t => t.action === 'sell')!;
    const sellWithFee = tradesWithFee.find(t => t.action === 'sell')!;
    expect(sellWithFee.amount).toBeLessThan(sellNoFee.amount); // fee decreases sell proceeds
  });

  it('should skip small deviations under 1%', () => {
    const holdings = [
      { id: '1', symbol: 'THYAO', asset_type: 'stock', quantity: 1, current_price: 100, purchase_price: 80 },
    ];
    // Target exactly matches
    const trades = generateRebalancingTrades(holdings, { stock: 100 });
    expect(trades.length).toBe(0);
  });
});
