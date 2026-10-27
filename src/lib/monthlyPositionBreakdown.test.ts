import { describe, expect, it } from 'vitest';
import { heldPriceMove } from './attributionQty';
import {
  APPROX_NOTE,
  amountToEur,
  bookFromRows,
  buildPositionLines,
  closePrice,
  rateOn,
  sumPositionGains,
  type BreakdownHolding,
  type BreakdownPrice,
  type BreakdownTx,
  type FxBook,
  type MonthlyBreakdownInput,
} from './monthlyPositionBreakdown';

const START = '2026-09-30T18:00:00.000Z';
const END = '2026-10-27T23:59:59.999Z';

function fxFlat(rate = 50): FxBook {
  return {
    eur: [
      { day: '2026-09-30', rate },
      { day: '2026-10-14', rate },
      { day: '2026-10-27', rate },
    ],
    usd: [],
    rub: [],
    ron: [],
  };
}

function base(over: Partial<MonthlyBreakdownInput> = {}): MonthlyBreakdownInput {
  return {
    holdings: [],
    prices: [],
    transactions: [],
    startDay: '2026-09-30',
    startAt: START,
    endDay: '2026-10-27',
    endAt: END,
    endMode: 'latest',
    fx: fxFlat(),
    ...over,
  };
}

function holding(partial: Partial<BreakdownHolding> & Pick<BreakdownHolding, 'id' | 'symbol'>): BreakdownHolding {
  return {
    asset_type: 'stock',
    currency: 'TRY',
    quantity: 0,
    ...partial,
  };
}

describe('aylık pozisyon dökümü', () => {
  it('kapanış fiyatı, aynı günün geç yazılan fiyatını ezmez', () => {
    const points = [
      { price: 100, recorded_at: '2026-09-30T18:00:00.000Z' },
      { price: 130, recorded_at: '2026-09-30T22:00:00.000Z' },
    ];
    expect(closePrice(points, '2026-09-30')).toBe(100);
  });

  it('ay başı, 30 Eylül kapanışıdır; gece fiyatı taban olmaz', () => {
    const lines = buildPositionLines(base({
      holdings: [holding({ id: 'a', symbol: 'AKSEN', currency: 'EUR', quantity: 10 })],
      prices: [
        { holding_id: 'a', price: 100, recorded_at: '2026-09-30T18:00:00.000Z' },
        { holding_id: 'a', price: 130, recorded_at: '2026-09-30T22:00:00.000Z' },
        { holding_id: 'a', price: 90, recorded_at: '2026-10-27T18:00:00.000Z' },
      ],
      fx: { eur: [], usd: [], rub: [], ron: [] },
    }));
    expect(lines).toHaveLength(1);
    expect(lines[0].gainEUR).toBeCloseTo(10 * (90 - 100), 6);
    expect(lines[0].gainEUR).not.toBeCloseTo(10 * (90 - 130), 6);
  });

  it('satıştan sonraki düşüş yazılmaz (TOASO)', () => {
    const qty = 100;
    const lines = buildPositionLines(base({
      holdings: [holding({ id: 't', symbol: 'TOASO', quantity: 0 })],
      prices: [
        { holding_id: 't', price: 280, recorded_at: '2026-09-30T18:00:00.000Z' },
        { holding_id: 't', price: 219, recorded_at: '2026-10-27T16:00:00.000Z' },
      ],
      transactions: [{
        holding_id: 't',
        transaction_date: '2026-10-14T11:00:00.000Z',
        transaction_type: 'sell',
        quantity: qty,
        price: 254,
        total_amount: 254 * qty,
        currency: 'TRY',
      }],
    }));
    const startEUR = (qty * 280) / 50;
    const proceeds = (qty * 254) / 50;
    const markedToToday = heldPriceMove(qty, 280 / 50, 219 / 50);
    expect(lines.map(l => l.symbol)).toEqual(['TOASO']);
    expect(lines[0].sold).toBe(true);
    expect(lines[0].qtyStart).toBe(qty);
    expect(lines[0].qtyEnd).toBe(0);
    expect(lines[0].gainEUR).toBeCloseTo(proceeds - startEUR, 6);
    expect(lines[0].gainEUR).toBeGreaterThan(markedToToday);
    expect(lines[0].gainEUR).not.toBeCloseTo(markedToToday, 0);
  });

  it('kapanıştan sonraki akşam satışı, ertesi fiyatla zarar yazmaz', () => {
    const lines = buildPositionLines(base({
      holdings: [holding({ id: 't', symbol: 'THYAO', currency: 'EUR', quantity: 0 })],
      prices: [
        { holding_id: 't', price: 10, recorded_at: '2026-09-30T18:00:00.000Z' },
        { holding_id: 't', price: 6, recorded_at: '2026-10-27T16:00:00.000Z' },
      ],
      transactions: [{
        holding_id: 't',
        transaction_date: '2026-09-30T22:00:00.000Z',
        transaction_type: 'sell',
        quantity: 100,
        price: 10,
        total_amount: 1000,
        currency: 'EUR',
      }],
      fx: { eur: [], usd: [], rub: [], ron: [] },
    }));
    expect(lines[0].gainEUR).toBeCloseTo(0, 6);
    expect(lines[0].sold).toBe(true);
  });

  it('satış hasılatı işlem gününün kurunu kullanır', () => {
    const lines = buildPositionLines(base({
      holdings: [holding({ id: 't', symbol: 'TOASO', quantity: 0 })],
      prices: [{ holding_id: 't', price: 280, recorded_at: '2026-09-30T18:00:00.000Z' }],
      transactions: [{
        holding_id: 't',
        transaction_date: '2026-10-14T11:00:00.000Z',
        transaction_type: 'sell',
        quantity: 100,
        price: 254,
        total_amount: 25400,
        currency: 'TRY',
      }],
      fx: {
        eur: [
          { day: '2026-09-30', rate: 50 },
          { day: '2026-10-14', rate: 40 },
          { day: '2026-10-27', rate: 55 },
        ],
        usd: [], rub: [], ron: [],
      },
    }));
    expect(lines[0].gainEUR).toBeCloseTo(25400 / 40 - (100 * 280) / 50, 6);
  });

  it('alış maliyeti düşülür, pozisyonlar arası nakit toplamda sıfırlanır', () => {
    const lines = buildPositionLines(base({
      holdings: [
        holding({ id: 'a', symbol: 'AKSEN', currency: 'EUR', quantity: 0 }),
        holding({ id: 'b', symbol: 'ALTIN', currency: 'EUR', quantity: 100 }),
      ],
      prices: [
        { holding_id: 'a', price: 9, recorded_at: '2026-09-30T18:00:00.000Z' },
        { holding_id: 'b', price: 10, recorded_at: '2026-10-27T18:00:00.000Z' },
      ],
      transactions: [
        {
          holding_id: 'a', transaction_date: '2026-10-10T10:00:00.000Z', transaction_type: 'sell',
          quantity: 100, price: 10, total_amount: 1000, currency: 'EUR',
        },
        {
          holding_id: 'b', transaction_date: '2026-10-10T10:05:00.000Z', transaction_type: 'buy',
          quantity: 100, price: 10, total_amount: 1000, currency: 'EUR',
        },
      ],
      fx: { eur: [], usd: [], rub: [], ron: [] },
    }));
    const a = lines.find(l => l.symbol === 'AKSEN')!;
    const b = lines.find(l => l.symbol === 'ALTIN')!;
    expect(a.gainEUR).toBeCloseTo(100, 6);
    expect(b.gainEUR).toBeCloseTo(0, 6);
    expect(sumPositionGains(lines)).toBeCloseTo(100, 6);
  });

  it('kısmi satış, kalan adedi bugünkü fiyatla tutar', () => {
    const lines = buildPositionLines(base({
      holdings: [holding({ id: 'p', symbol: 'SISE', currency: 'EUR', quantity: 40 })],
      prices: [
        { holding_id: 'p', price: 10, recorded_at: '2026-09-30T18:00:00.000Z' },
        { holding_id: 'p', price: 11, recorded_at: '2026-10-27T18:00:00.000Z' },
      ],
      transactions: [{
        holding_id: 'p', transaction_date: '2026-10-08T10:00:00.000Z', transaction_type: 'sell',
        quantity: 60, price: 12, total_amount: 720, currency: 'EUR',
      }],
      fx: { eur: [], usd: [], rub: [], ron: [] },
    }));
    expect(lines[0].sold).toBe(false);
    expect(lines[0].gainEUR).toBeCloseTo(40 * 1 + 60 * 2, 6);
  });

  it('komisyon satış hasılatından düşer', () => {
    const lines = buildPositionLines(base({
      holdings: [holding({ id: 't', symbol: 'TOASO', currency: 'EUR', quantity: 0 })],
      prices: [{ holding_id: 't', price: 100, recorded_at: '2026-09-30T18:00:00.000Z' }],
      transactions: [{
        holding_id: 't', transaction_date: '2026-10-14T11:00:00.000Z', transaction_type: 'sell',
        quantity: 10, price: 100, total_amount: 1000, fee: 10, currency: 'EUR',
      }],
      fx: { eur: [], usd: [], rub: [], ron: [] },
    }));
    expect(lines[0].gainEUR).toBeCloseTo(-10, 6);
  });

  it('aydan önce kapanmış pozisyon listeye girmez', () => {
    const lines = buildPositionLines(base({
      holdings: [holding({ id: 'old', symbol: 'EKGYO', currency: 'EUR', quantity: 0 })],
      prices: [
        { holding_id: 'old', price: 10, recorded_at: '2026-09-30T18:00:00.000Z' },
        { holding_id: 'old', price: 4, recorded_at: '2026-10-27T18:00:00.000Z' },
      ],
      transactions: [{
        holding_id: 'old', transaction_date: '2026-08-02T10:00:00.000Z', transaction_type: 'sell',
        quantity: 50, price: 8, total_amount: 400, currency: 'EUR',
      }],
      fx: { eur: [], usd: [], rub: [], ron: [] },
    }));
    expect(lines).toEqual([]);
  });

  it('tutarı bilinmeyen satış satırı uydurmaz', () => {
    const lines = buildPositionLines(base({
      holdings: [holding({ id: 't', symbol: 'TOASO', currency: 'EUR', quantity: 0 })],
      prices: [
        { holding_id: 't', price: 10, recorded_at: '2026-09-30T18:00:00.000Z' },
        { holding_id: 't', price: 4, recorded_at: '2026-10-27T18:00:00.000Z' },
      ],
      transactions: [{
        holding_id: 't', transaction_date: '2026-10-14T11:00:00.000Z', transaction_type: 'sell',
        quantity: 10, price: 0, total_amount: 0, currency: 'EUR',
      }],
      fx: { eur: [], usd: [], rub: [], ron: [] },
    }));
    expect(lines).toEqual([]);
  });

  it('tüm satırlar büyük kazançtan büyük zarara sıralanır ve toplamları Pozisyon Hareketi olur', () => {
    const prices: BreakdownPrice[] = [];
    const holdings: BreakdownHolding[] = [];
    const gains = [30, 12, -4, -9, -15, -2, -7, -11];
    gains.forEach((end, i) => {
      const id = `h${i}`;
      holdings.push(holding({ id, symbol: `S${i}`, currency: 'EUR', quantity: 1 }));
      prices.push(
        { holding_id: id, price: 100, recorded_at: '2026-09-30T18:00:00.000Z' },
        { holding_id: id, price: 100 + end, recorded_at: '2026-10-27T18:00:00.000Z' },
      );
    });
    const sold = holding({ id: 'sold', symbol: 'THYAO', currency: 'EUR', quantity: 0 });
    holdings.push(sold);
    prices.push({ holding_id: 'sold', price: 100, recorded_at: '2026-09-30T18:00:00.000Z' });
    prices.push({ holding_id: 'sold', price: 50, recorded_at: '2026-10-27T18:00:00.000Z' });
    const transactions: BreakdownTx[] = [{
      holding_id: 'sold', transaction_date: '2026-10-14T11:00:00.000Z', transaction_type: 'sell',
      quantity: 1, price: 97, total_amount: 97, currency: 'EUR',
    }];
    const lines = buildPositionLines(base({
      holdings, prices, transactions, fx: { eur: [], usd: [], rub: [], ron: [] },
    }));
    expect(lines).toHaveLength(gains.length + 1);
    const euros = lines.map(l => l.gainEUR);
    const sorted = [...euros].sort((a, b) => b - a);
    expect(euros).toEqual(sorted);
    expect(lines.some(l => l.symbol === 'THYAO' && l.sold)).toBe(true);
    expect(sumPositionGains(lines)).toBeCloseTo(gains.reduce((s, g) => s + g, 0) + (97 - 100), 6);
    expect(lines.filter(l => l.gainEUR < 0).length).toBeGreaterThan(5);
  });

  it('kur günü boşsa bir önceki günün kuru durur', () => {
    const book = bookFromRows([
      { day: '2026-10-01', rate: '50', from_currency: 'EUR' },
      { day: '2026-10-01', rate: '51', from_currency: 'EUR' },
      { day: '2026-10-03', rate: 53, from_currency: 'eur' },
    ]);
    expect(rateOn(book.eur, '2026-10-02')).toBe(51);
    expect(rateOn(book.eur, '2026-10-03')).toBe(53);
    expect(amountToEur(100, 'TRY', { eur: 50, usd: 40, rub: 0, ron: 0 })).toBe(2);
  });

  it('not, resmi ay kârını işaret eder', () => {
    expect(APPROX_NOTE).toMatch(/yaklaşık/);
    expect(APPROX_NOTE).toContain('Kar/Zarar Geçmişi');
    expect(APPROX_NOTE).toContain('resmi ay kârı');
  });
});
