import { describe, it, expect } from 'vitest';
import { convertQuote, rateToTRY, guessQuoteCcy } from '../../../api/lib/quoteConvert';

const R = { USD: 49.2782, EUR: 55.2355 };

describe('convertQuote', () => {
  it('XEON hatası: EUR kote fiyat EUR pozisyona çevrilmez, aynen kalır', () => {
    expect(convertQuote(150.44, 'EUR', 'EUR', R)).toBe(150.44);
  });

  it('eski hatalı davranış ~%11 eksik yazıyordu — artık olmuyor', () => {
    const hatali = 150.44 * (R.USD / R.EUR);              // USD sanıp çevirmek
    expect(hatali).toBeLessThan(150.44 * 0.9);            // gerçekten %10+ eksik
    expect(convertQuote(150.44, 'EUR', 'EUR', R)).not.toBeCloseTo(hatali, 2);
  });

  it('USD kote → EUR pozisyon doğru çevrilir', () => {
    expect(convertQuote(100, 'USD', 'EUR', R)).toBeCloseTo((100 * R.USD) / R.EUR, 8);
  });

  it('USD kote → TRY pozisyon', () => {
    expect(convertQuote(100, 'USD', 'TRY', R)).toBeCloseTo(100 * R.USD, 8);
  });

  it('kur bilinmiyorsa null — sabit yedek kullanılmaz', () => {
    expect(convertQuote(100, 'USD', 'EUR', { USD: null, EUR: R.EUR })).toBeNull();
    expect(convertQuote(100, 'USD', 'EUR', { USD: R.USD, EUR: null })).toBeNull();
  });

  it('bilinmeyen para birimi null', () => {
    expect(convertQuote(100, 'GBP', 'EUR', R)).toBeNull();
    expect(rateToTRY('CHF', R)).toBeNull();
  });

  it('geçersiz fiyat null', () => {
    expect(convertQuote(0, 'EUR', 'EUR', R)).toBeNull();
    expect(convertQuote(-5, 'EUR', 'EUR', R)).toBeNull();
    expect(convertQuote(NaN, 'EUR', 'EUR', R)).toBeNull();
  });

  it('TRY her zaman 1, kur gerekmez', () => {
    expect(rateToTRY('TRY', { USD: null, EUR: null })).toBe(1);
  });
});

describe('guessQuoteCcy', () => {
  it('Xetra ve diğer euro borsaları EUR', () => {
    for (const s of ['XEON.DE', 'ASML.AS', 'MC.PA', 'ENI.MI', 'SAN.MC']) expect(guessQuoteCcy(s)).toBe('EUR');
  });
  it('BIST TRY, ABD USD', () => {
    expect(guessQuoteCcy('ASELS.IS')).toBe('TRY');
    expect(guessQuoteCcy('JNJ')).toBe('USD');
  });
  it('Londra TAHMİN EDİLMEZ — hem USD hem GBp kote var', () => {
    expect(guessQuoteCcy('IB01.L')).toBeNull();
  });
});
