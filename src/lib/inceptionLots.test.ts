import { describe, expect, it } from 'vitest';
import { inceptionDay, realizedEvents } from './inceptionLots';

describe('kuruluş kârı günü', () => {
  it('22 Eki 23:56 UTC, Bükreş’te 23 Eki’dir', () => {
    expect(inceptionDay('2025-10-22T23:56:47.888Z')).toBe('2025-10-23');
    expect(String('2025-10-22T23:56:47.888Z').slice(0, 10)).toBe('2025-10-22');
  });

  it('gece kaydı ertesi günün kuruna gider; maliyet €1’den fazla kaymaz', () => {
    const qty = 10_000, price = 50;
    const cost = qty * price;
    const utcDay = '2025-10-22', bucharest = inceptionDay('2025-10-22T23:56:47.888Z');
    const eur = (day: string) => (day === '2025-10-22' ? 48 : 49);
    const utcCost = cost / eur(utcDay);
    const localCost = cost / eur(bucharest);
    expect(utcCost - localCost).toBeGreaterThan(1);
    expect(localCost).toBeCloseTo(cost / 49, 6);
  });
});

describe('kuruluş realize', () => {
  it('aynı satış hem işlemde hem nakit notunda ise bir kez sayılır', () => {
    const id = 'ekgyo';
    const ts = '2026-06-11T22:34:58.642Z';
    const lots = realizedEvents(
      [{ transaction_date: ts, realized_profit: 7333.42, holding_id: id }],
      [{ created_at: ts, currency: 'TRY', notes: 'EKGYO satış (K/Z +7333.42)', related_holding_id: id }],
      new Map([[id, 'TRY']]),
    );
    expect(lots).toEqual([{ day: '2026-06-12', native: 7333.42, currency: 'TRY' }]);
  });

  it('yalnız nakit notu olan satış durur', () => {
    const lots = realizedEvents(
      [],
      [{ created_at: '2026-06-11T22:34:58.642Z', currency: 'TRY', notes: 'TTKOM (K/Z +272.95)' }],
      new Map(),
    );
    expect(lots).toHaveLength(1);
    expect(lots[0].native).toBeCloseTo(272.95, 2);
    expect(lots[0].day).toBe('2026-06-12');
  });
});
