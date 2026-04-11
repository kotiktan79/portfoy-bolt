import { describe, it, expect } from 'vitest';
import { formatCurrency, formatCurrencyUSD, formatPercentage } from './priceService';

describe('formatCurrency', () => {
  it('should format numbers in Turkish locale', () => {
    const result = formatCurrency(1234567.89);
    expect(result).toContain('1');
    expect(result).toContain('234');
    expect(result).toContain('567');
    expect(result).toContain('89');
  });

  it('should handle zero', () => {
    expect(formatCurrency(0)).toBeDefined();
  });

  it('should respect decimal places', () => {
    const result = formatCurrency(100, 4);
    expect(result).toContain('0000');
  });
});

describe('formatCurrencyUSD', () => {
  it('should convert TRY to USD correctly', () => {
    const result = formatCurrencyUSD(38000, 38);
    // 38000 / 38 = 1000
    expect(result).toContain('1');
    expect(result).toContain('000');
  });

  it('should handle edge case with very small rate', () => {
    const result = formatCurrencyUSD(100, 0.01);
    expect(result).toBeDefined();
  });
});

describe('formatPercentage', () => {
  it('should add + sign for positive values', () => {
    expect(formatPercentage(5.5)).toBe('+5.50%');
  });

  it('should show - sign for negative values', () => {
    expect(formatPercentage(-3.2)).toBe('-3.20%');
  });

  it('should show +0.00% for zero', () => {
    expect(formatPercentage(0)).toBe('+0.00%');
  });
});
