import { describe, expect, it } from 'vitest';
import { computeDailyMovers, summarizeMovers, shareOfPortfolioPct } from './dailyMovers';
import { liveEurGain } from './eurPnl';

const rates = (m: Record<string, number>) => (c: string) => m[c] ?? null;

describe('dailyMovers — bugün en çok yükselen/düşen, euro', () => {
  it('TL varlıkta EUR/TL hareketi € değişime dahil (fiyat sabitken bile)', () => {
    const [m] = computeDailyMovers({
      holdings: [{ symbol: 'BIMAS', asset_type: 'stock', currency: 'TRY', quantity: 100, current_price: 360 }],
      closePrices: new Map([['BIMAS', 360]]),
      rateNow: rates({}), rateClose: rates({}), eurNow: 56, eurClose: 55,
    });
    // fiyat 0%, ama TL euroya karşı değer kaybetti: 100×360×(1/56 − 1/55)
    expect(m.pricePct).toBeCloseTo(0, 9);
    expect(m.eurDelta).toBeCloseTo(36_000 * (1 / 56 - 1 / 55), 9);
    expect(m.fxEUR).toBeCloseTo(m.eurDelta!, 9);
  });

  it('EUR varlıkta yalnız fiyat; USD varlıkta USD/EUR paritesi de girer', () => {
    const ms = computeDailyMovers({
      holdings: [
        { symbol: 'VWCE', asset_type: 'stock', currency: 'EUR', quantity: 10, current_price: 170 },
        { symbol: 'JNJ', asset_type: 'stock', currency: 'USD', quantity: 10, current_price: 110 },
      ],
      closePrices: new Map([['VWCE', 168], ['JNJ', 100]]),
      rateNow: rates({ EUR: 56, USD: 50 }), rateClose: rates({ EUR: 55, USD: 50 }), eurNow: 56, eurClose: 55,
    });
    expect(ms[0].eurDelta).toBeCloseTo(20, 9);
    expect(ms[0].fxEUR).toBeCloseTo(0, 9);
    expect(ms[1].pricePct).toBeCloseTo(10, 9);
    expect(ms[1].eurDelta).toBeCloseTo(10 * (110 * 50 / 56 - 100 * 50 / 55), 9);
  });

  it('nakit/kasa ve adet 0 listede yok; kapanışı/kuru olmayan "veri yok"', () => {
    const ms = computeDailyMovers({
      holdings: [
        { symbol: 'EURO', asset_type: 'currency', currency: 'TRY', quantity: 1000, current_price: 56 },
        { symbol: 'KASA', asset_type: 'cash', currency: 'TRY', quantity: 1, current_price: 1 },
        { symbol: 'ESKI', asset_type: 'stock', currency: 'TRY', quantity: 0, current_price: 10 },
        { symbol: 'ALTIN', asset_type: 'commodity', currency: 'TRY', quantity: 10, current_price: 6400 },
        { symbol: 'RUBX', asset_type: 'stock', currency: 'RUB', quantity: 10, current_price: 100 },
        { symbol: 'SIFIR', asset_type: 'stock', currency: 'TRY', quantity: 10, current_price: 0 },
        { symbol: 'ZIP', asset_type: 'stock', currency: 'TRY', quantity: 10, current_price: 200 },
      ],
      closePrices: new Map([['RUBX', 100], ['SIFIR', 5], ['ZIP', 100]]),
      rateNow: rates({}), rateClose: rates({}), eurNow: 56, eurClose: 55,
    });
    expect(ms.map(m => m.symbol)).toEqual(['ALTIN', 'RUBX', 'SIFIR', 'ZIP']);
    expect(ms.map(m => m.reason)).toEqual(['kapanis-yok', 'kur-yok', 'fiyat-yok', 'supheli']);
    expect(ms.every(m => m.eurDelta === null)).toBe(true);
  });

  it('ilk 3 yükselen / 3 düşen € tutara göre, toplam yalnız verisi olanlardan', () => {
    const mk = (symbol: string, eurDelta: number | null) => ({ symbol, assetType: 'stock', eurDelta, pricePct: 0, fxEUR: 0, valueEUR: 1 });
    const s = summarizeMovers([mk('A', 50), mk('B', -80), mk('C', 10), mk('D', 120), mk('E', -5), mk('F', 30), mk('G', 0.2), mk('H', null), mk('I', -1)]);
    expect(s.gainers.map(m => m.symbol)).toEqual(['D', 'A', 'F']);
    expect(s.losers.map(m => m.symbol)).toEqual(['B', 'E', 'I']);
    expect(s.totalEUR).toBeCloseTo(124.2, 9);
    expect(s.counted).toBe(8);
    expect(s.noData.map(m => m.symbol)).toEqual(['H']);
  });

  it('portföy payı tabanı yoksa null', () => {
    expect(shareOfPortfolioPct(150, 150_000)).toBeCloseTo(0.1, 9);
    expect(shareOfPortfolioPct(150, 0)).toBeNull();
    expect(shareOfPortfolioPct(150, undefined)).toBeNull();
  });

  it('liveEurGain movers üretir; nakit hariç pozisyonlar + nakit = genel toplam', () => {
    const model: any = {
      daily: [{ date: '2026-10-29', wealthEUR: 0, gainEUR: 0, totalValueTRY: 0, eurRate: 55, usdRate: 50 }],
      months: [], health: { ok: true },
      lastSnapshot: { date: '2026-10-29', totalValue: 100 * 300 + 1000 * 50, totalInvestment: 100 * 300 + 1000 * 50 },
      foreignCostsAtLast: [], ratesAtLast: { USD: 50, EUR: 55 },
    };
    const holdings = [
      { symbol: 'TUPRS', asset_type: 'stock', currency: 'TRY', quantity: 100, current_price: 330, purchase_price: 300 },
      { symbol: 'USD', asset_type: 'currency', currency: 'TRY', quantity: 1000, current_price: 50, purchase_price: 50 },
    ];
    const g = liveEurGain(model, {
      holdings, usdNow: 50, eurNow: 56,
      closePrices: new Map([['TUPRS', 300], ['USD', 50]]),
    })!;
    expect(g.movers?.map(m => m.symbol)).toEqual(['TUPRS']);
    const tup = g.movers![0];
    expect(tup.eurDelta).toBeCloseTo(100 * (330 / 56 - 300 / 55), 9);
    // genel toplam: TUPRS + USD nakdin euro değişimi
    const usdCash = 1000 * (50 / 56 - 50 / 55);
    // akış: maliyet sabit (I aynı) → gain = V/e − V0/e0
    expect(g.gainEUR).toBeCloseTo((33_000 + 50_000) / 56 - 80_000 / 55, 9);
    expect(g.gainEUR).toBeCloseTo(tup.eurDelta! + usdCash, 9);
  });

  it('kapanış fiyatı yoksa movers tanımsız (panel "veri yok" der)', () => {
    const model: any = {
      daily: [{ date: '2026-10-29', wealthEUR: 0, gainEUR: 0, totalValueTRY: 0, eurRate: 55, usdRate: 50 }],
      months: [], health: { ok: true },
      lastSnapshot: { date: '2026-10-29', totalValue: 1000, totalInvestment: 1000 },
      foreignCostsAtLast: [], ratesAtLast: { USD: 50, EUR: 55 },
    };
    const g = liveEurGain(model, { holdings: [{ symbol: 'X', asset_type: 'stock', currency: 'TRY', quantity: 1, current_price: 1000, purchase_price: 1000 }], usdNow: 50, eurNow: 55 })!;
    expect(g.movers).toBeUndefined();
  });
});
