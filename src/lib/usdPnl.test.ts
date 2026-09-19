import { describe, it, expect } from 'vitest';
import { makeRateSeries, usdGainBetween, dailyUsdGains, periodUsdGains } from './usdPnl';

describe('usdPnl — dolar bazlı kâr', () => {
  const rates = makeRateSeries([{ date: '2026-08-01', rate: 47.5 }, { date: '2026-08-31', rate: 48.25 }], 48);

  it('kur hareketi tek başına kâr üretmez ($34.000 nakit, kur 47,5→48,25)', () => {
    const a = { date: '2026-08-01', totalValue: 34000 * 47.5, totalInvestment: 34000 * 38.2 };
    const b = { date: '2026-08-31', totalValue: 34000 * 48.25, totalInvestment: 34000 * 38.2 };
    expect(usdGainBetween(a, b, rates)).toBeCloseTo(0, 6);
  });

  it('yeni para kâr sayılmaz', () => {
    const a = { date: '2026-08-01', totalValue: 1_000_000, totalInvestment: 800_000 };
    const b = { date: '2026-08-31', totalValue: 1_000_000 * (48.25 / 47.5) + 100_000, totalInvestment: 900_000 };
    expect(usdGainBetween(a, b, rates)).toBeCloseTo(0, 6);
  });

  it('gerçek dolar kazancı görünür', () => {
    const a = { date: '2026-08-01', totalValue: 100 * 47.5, totalInvestment: 100 * 47.5 };
    const b = { date: '2026-08-31', totalValue: 110 * 48.25, totalInvestment: 100 * 47.5 }; // $100 → $110
    expect(usdGainBetween(a, b, rates)).toBeCloseTo(10, 6);
  });

  it('satış: maliyet düşer, realize geri eklenir → kâr = hasılat − maliyet', () => {
    // 100$ maliyetli lot 130$ hasılatla satıldı, hasılat portföyde kaldı (nakit)
    const a = { date: '2026-08-01', totalValue: 130 * 47.5, totalInvestment: 100 * 47.5 };
    const b = { date: '2026-08-31', totalValue: 130 * 48.25, totalInvestment: 0 };
    const realizedTRY = 30 * 48.25;
    // değer değişmedi ($130), maliyet 100→0 (satış), R=30 → yeni para = (0−4750−1447)/48.25 negatif = hasılat çıkışı sayılmaz
    expect(usdGainBetween(a, b, rates, realizedTRY)).toBeCloseTo(130 - 130 - (0 - 100 * 47.5 - realizedTRY) / 48.25, 6);
  });

  it('periyot toplama günlükleri toplar', () => {
    const snaps = [
      { date: '2026-08-01', totalValue: 100 * 47.5, totalInvestment: 100 * 47.5 },
      { date: '2026-08-15', totalValue: 105 * 47.9, totalInvestment: 100 * 47.5 },
      { date: '2026-08-31', totalValue: 110 * 48.25, totalInvestment: 100 * 47.5 },
    ];
    const r = makeRateSeries([{ date: '2026-08-01', rate: 47.5 }, { date: '2026-08-15', rate: 47.9 }, { date: '2026-08-31', rate: 48.25 }], 48);
    const d = dailyUsdGains(snaps, r);
    const m = periodUsdGains(d, x => x.slice(0, 7));
    expect(m[0].gainUSD).toBeCloseTo(10, 6);
  });
});
