import { describe, it, expect } from 'vitest';
import { computeKasaFx } from './kasaFxService';

// Kur satırları: EUR ve RUB'un TL karşılığı. Kasa 1.000.000 ₽ + 10.000 TL.
// 1 Haz: EUR/TRY 50, RUB/TRY 0,60 → ruble 1.000.000×0,60/50 = €12.000 · TL 10.000/50 = €200
// 1 Tem: EUR/TRY 50, RUB/TRY 0,55 → ruble €11.000 · TL €200  (ruble eridi: −€1.000)
const rates = [
  { day: '2026-06-01', from_currency: 'EUR', rate: 50 },
  { day: '2026-06-01', from_currency: 'RUB', rate: 0.60 },
  { day: '2026-07-01', from_currency: 'EUR', rate: 50 },
  { day: '2026-07-01', from_currency: 'RUB', rate: 0.55 },
];
const balances = [{ currency: 'RUB', balance: 1_000_000 }, { currency: 'TRY', balance: 10_000 }];

describe('computeKasaFx — kasa kur etkisi (ölçüm dışı, yalnız gösterim)', () => {
  it('atıl rublenin euro erimesini yakalar; TL nötr kalır', () => {
    const k = computeKasaFx(balances, rates, 30)!;
    expect(k.asOf).toBe('2026-07-01');
    expect(k.totalEurNow).toBeCloseTo(11_000 + 200, 6);
    // uzun pencere = serinin ilk günü (1 Haz): 12.200 → 11.200 = −1.000
    expect(k.longWindow.sinceDay).toBe('2026-06-01');
    expect(k.longWindow.fxDeltaEUR).toBeCloseTo(-1_000, 6);
    const rub = k.rows.find(r => r.currency === 'RUB')!;
    expect(rub.fxDeltaEUR).toBeCloseTo(-1_000, 6);
    expect(k.rows.find(r => r.currency === 'TRY')!.fxDeltaEUR).toBeCloseTo(0, 6);
    expect(k.rows[0].currency).toBe('RUB');                  // etkisi en büyük olan başta
  });

  it('EUR nakit kur etkisinden bağımsızdır (euro her zaman euro)', () => {
    const k = computeKasaFx([{ currency: 'EUR', balance: 5_000 }], rates, 30)!;
    expect(k.totalEurNow).toBeCloseTo(5_000, 6);
    expect(k.longWindow.fxDeltaEUR).toBeCloseTo(0, 6);
  });

  it('kuru olmayan para birimi hesaba KATILMAZ ve bildirilir', () => {
    const k = computeKasaFx([...balances, { currency: 'XYZ', balance: 999 }], rates, 30)!;
    expect(k.missingCcy).toEqual(['XYZ']);
    expect(k.totalEurNow).toBeCloseTo(11_200, 6);            // XYZ toplama girmedi
  });

  it('veri yoksa null döner (sahte €0 basılmaz)', () => {
    expect(computeKasaFx([], rates)).toBeNull();
    expect(computeKasaFx(balances, [])).toBeNull();
    expect(computeKasaFx(balances, [{ day: '2026-06-01', from_currency: 'RUB', rate: 0.6 }])).toBeNull();  // EUR kuru yok
  });

  it('kısa pencere seri başından öncesine taşmaz', () => {
    const k = computeKasaFx(balances, rates, 365)!;
    expect(k.shortWindow.sinceDay).toBe('2026-06-01');       // seri 1 Haz'da başlıyor
  });
});
