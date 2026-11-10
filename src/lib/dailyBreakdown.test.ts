import { describe, it, expect } from 'vitest';
import { dailyBreakdown, topWithOthers, closePricesAt } from './dailyBreakdown';
import type { Holding } from './supabase';
const H = (id: string, symbol: string, currency: string, asset_type: string, quantity: number, current_price: number) =>
  ({ id, symbol, currency, asset_type, quantity, current_price, purchase_price: 1 } as unknown as Holding);
const hs = [
  H('e', 'EURO', 'TRY', 'currency', 1000, 56.4), H('u', 'USD', 'TRY', 'currency', 100, 50.1),
  H('a', 'ALTIN', 'TRY', 'commodity', 10, 6600), H('v', 'VWCE', 'EUR', 'stock', 10, 170), H('j', 'JNJ', 'USD', 'stock', 2, 275),
  H('x', 'XEON', 'EUR', 'stock', 1, 150),
];
const prev = { e: 56.2, u: 50, a: 6540, v: 169, j: 274 }; // XEON kapanışı yok
const prevTRY = 1000 * 56.2 + 100 * 50 + 10 * 6540 + 10 * 169 * 56.2 + 2 * 274 * 50 + 150 * 56.2;
describe('dailyBreakdown', () => {
  it('satırlar + kur + fark = toplam; kayıt birebir ise fark 0', () => {
    const b = dailyBreakdown(hs, prev, prevTRY)!;
    const sum = b.rows.reduce((s, r) => s + r.eur, 0) + b.fxEUR + b.gapEUR;
    expect(sum).toBeCloseTo(b.totalEUR, 8);
    expect(b.gapEUR).toBeCloseTo(0, 8);
    expect(b.rows[0].symbol).toBe('ALTIN');             // 10×60 TL = en büyük
    expect(b.rows.find(r => r.symbol === 'ALTIN')!.eur).toBeCloseTo(600 / 56.4, 6);
    expect(b.rows.find(r => r.symbol === 'VWCE')!.eur).toBeCloseTo(10, 6); // 10×1 €
    expect(b.rows.find(r => r.symbol === 'XEON')).toMatchObject({ eur: 0, noPrev: true });
    expect(b.fxEUR).toBeCloseTo((prevTRY + 10 * 169 * 0.2 + 150 * 0.2 + 2 * 274 * 0.1) / 56.4 - prevTRY / 56.2, 6);
  });
  it('snapshot farklıysa fark satırı görünür', () => {
    const b = dailyBreakdown(hs, prev, prevTRY - 564)!;
    expect(b.gapEUR).toBeCloseTo(564 / 56.2, 6);
    expect(b.rows.reduce((s, r) => s + r.eur, 0) + b.fxEUR + b.gapEUR).toBeCloseTo(b.totalEUR, 8);
  });
  it('kur/snapshot yoksa null', () => { expect(dailyBreakdown(hs, prev, 0)).toBeNull(); });
  it('ilk 5 + diğerleri', () => {
    const rows = [5, -9, 1, 3, -2, 7, 0.5].map((eur, i) => ({ id: String(i), symbol: 'S' + i, eur }));
    const t = topWithOthers(rows, 5);
    expect(t.top).toHaveLength(5); expect(t.othersCount).toBe(2); expect(t.othersEUR).toBeCloseTo(7.5);
  });
  it('snapshot anına en yakın fiyat, 30 dk dışı yok', () => {
    const p = closePricesAt([
      { holding_id: 'a', price: 1, recorded_at: '2026-11-04T17:40:00Z' },
      { holding_id: 'a', price: 2, recorded_at: '2026-11-04T18:00:50Z' },
      { holding_id: 'b', price: 3, recorded_at: '2026-11-04T19:00:00Z' },
    ], '2026-11-04T18:00:57Z');
    expect(p).toEqual({ a: 2 });
  });
});
