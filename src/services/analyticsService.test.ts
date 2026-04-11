import { describe, it, expect } from 'vitest';
import { calculateRebalance, getDefaultTargetAllocations } from './analyticsService';

describe('calculateRebalance', () => {
  it('should return allocations sorted by value descending', () => {
    const holdings = [
      { symbol: 'A', asset_type: 'stock', current_price: 10, quantity: 1 },
      { symbol: 'B', asset_type: 'crypto', current_price: 100, quantity: 1 },
    ];
    const targets = { stock: 50, crypto: 50 };
    const result = calculateRebalance(holdings, targets);

    expect(result[0].value).toBeGreaterThanOrEqual(result[1].value);
  });

  it('should calculate correct percentages', () => {
    const holdings = [
      { symbol: 'A', asset_type: 'stock', current_price: 50, quantity: 1 },
      { symbol: 'B', asset_type: 'crypto', current_price: 50, quantity: 1 },
    ];
    const targets = { stock: 50, crypto: 50 };
    const result = calculateRebalance(holdings, targets);

    expect(result[0].percentage).toBeCloseTo(50);
    expect(result[1].percentage).toBeCloseTo(50);
    expect(result[0].rebalance_amount).toBeCloseTo(0);
  });

  it('should handle zero total value', () => {
    const holdings = [
      { symbol: 'A', asset_type: 'stock', current_price: 0, quantity: 10 },
    ];
    const result = calculateRebalance(holdings, { stock: 100 });
    expect(result[0].percentage).toBe(0);
  });

  it('should calculate rebalance amounts', () => {
    const holdings = [
      { symbol: 'A', asset_type: 'stock', current_price: 80, quantity: 1 },
      { symbol: 'B', asset_type: 'crypto', current_price: 20, quantity: 1 },
    ];
    // Total = 100, stock = 80%, crypto = 20%
    // Target: stock 50% = 50, crypto 50% = 50
    const targets = { stock: 50, crypto: 50 };
    const result = calculateRebalance(holdings, targets);

    const stock = result.find(a => a.asset_type === 'stock')!;
    const crypto = result.find(a => a.asset_type === 'crypto')!;

    expect(stock.rebalance_amount).toBeCloseTo(-30); // sell 30
    expect(crypto.rebalance_amount).toBeCloseTo(30);  // buy 30
  });
});

describe('getDefaultTargetAllocations', () => {
  it('should return allocations that sum to 100', () => {
    const defaults = getDefaultTargetAllocations();
    const total = Object.values(defaults).reduce((sum, v) => sum + v, 0);
    expect(total).toBe(100);
  });

  it('should include all asset types', () => {
    const defaults = getDefaultTargetAllocations();
    expect(defaults.stock).toBeDefined();
    expect(defaults.crypto).toBeDefined();
    expect(defaults.currency).toBeDefined();
    expect(defaults.fund).toBeDefined();
    expect(defaults.eurobond).toBeDefined();
    expect(defaults.commodity).toBeDefined();
  });
});
