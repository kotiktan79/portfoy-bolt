import { describe, it, expect } from 'vitest';
import { cashCurrencyFor, ccySymbol } from './cashCurrency';

describe('cashCurrencyFor', () => {
  it('USD/EUR varlık kendi kasasına gider', () => {
    expect(cashCurrencyFor('USD')).toBe('USD');
    expect(cashCurrencyFor('eur')).toBe('EUR');
  });
  it('TL ve boş TRY kalır', () => {
    expect(cashCurrencyFor('TRY')).toBe('TRY');
    expect(cashCurrencyFor(null)).toBe('TRY');
  });
  it('bilinmeyen birim TRY kasaya düşer', () => {
    expect(cashCurrencyFor('JPY')).toBe('TRY');
  });
  it('sembol', () => {
    expect(ccySymbol('USD')).toBe('$');
    expect(ccySymbol('TRY')).toBe('₺');
  });
});
