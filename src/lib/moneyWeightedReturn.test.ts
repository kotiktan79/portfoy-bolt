import { describe, expect, it } from 'vitest';
import {
  externalFlowsFromLedger,
  flowAdjustedReturn,
  ledgerCashTotals,
  linkedFlowAdjustedReturn,
  modifiedDietz,
  netFlowEUR,
} from './moneyWeightedReturn';

const EUR50 = [{ date: '2026-01-01', rate: 50 }];
const USD40 = [{ date: '2026-01-01', rate: 40 }];

describe('externalFlowsFromLedger', () => {
  it('yalnız yatırma ve çekmeyi, işlemin günündeki kurla euroya çevirir', () => {
    const { flows, unpriced } = externalFlowsFromLedger([
      { created_at: '2026-03-01T10:00:00Z', currency: 'EUR', transaction_type: 'deposit', amount: 1000 },
      { created_at: '2026-03-02T10:00:00Z', currency: 'TRY', transaction_type: 'withdrawal', amount: 5000 },
      { created_at: '2026-03-03T10:00:00Z', currency: 'EUR', transaction_type: 'buy', amount: 99999 },
      { created_at: '2026-03-04T10:00:00Z', currency: 'USD', type: 'deposit', amount: 100 },
    ], { eur: EUR50, usd: USD40 });
    expect(unpriced).toBe(0);
    expect(flows).toHaveLength(3);
    expect(flows[0]).toMatchObject({ kind: 'deposit', amountEUR: 1000 });
    expect(flows[1].kind).toBe('withdrawal');
    expect(flows[1].amountEUR).toBeCloseTo(5000 / 50, 6);
    expect(flows[2].amountEUR).toBeCloseTo((100 * 40) / 50, 6);
    expect(netFlowEUR(flows, '2026-01-01', '2026-12-31')).toBeCloseTo(1000 - 100 + 80, 6);
  });

  it('kuru olmayan kaydı yutmaz, unpriced sayar', () => {
    const { flows, unpriced } = externalFlowsFromLedger([
      { created_at: '2026-03-01T10:00:00Z', currency: 'GBP', transaction_type: 'deposit', amount: 10 },
    ], { eur: EUR50, usd: USD40 });
    expect(flows).toHaveLength(0);
    expect(unpriced).toBe(1);
  });
});

describe('modifiedDietz', () => {
  it('dönem ortası katkı ağırlığı yarım yıla yakındır', () => {
    const begin = '2026-01-01';
    const end = '2027-01-01';
    const mid = '2026-07-02';
    const r = modifiedDietz({
      beginDate: begin,
      endDate: end,
      beginValueEUR: 100_000,
      endValueEUR: 120_000,
      flows: [{ date: mid, kind: 'deposit', amountEUR: 10_000, amountTRY: 0, amountUSD: 0 }],
    });
    expect(r).not.toBeNull();
    expect(r!.dayCount).toBe(365);
    expect(r!.netFlowEUR).toBe(10_000);
    expect(r!.gainEUR).toBe(10_000);
    const w = (365 - 182) / 365;
    expect(r!.dietz).toBeCloseTo(10_000 / (100_000 + 10_000 * w), 6);
    expect(r!.dietzPct).toBeCloseTo(9.523, 2);
  });

  it('başlangıç günündeki akış bakiyenin içindedir, ikinci kez sayılmaz', () => {
    const r = modifiedDietz({
      beginDate: '2026-01-01',
      endDate: '2026-04-01',
      beginValueEUR: 50_000,
      endValueEUR: 51_000,
      flows: [{ date: '2026-01-01', kind: 'deposit', amountEUR: 50_000, amountTRY: 0, amountUSD: 0 }],
    });
    expect(r!.netFlowEUR).toBe(0);
    expect(r!.dietzPct).toBeCloseTo(2, 6);
  });
});

describe('snapshot yatırma sıçraması deftere yenilir', () => {
  // 2026-08-01: total_deposits ₺830.000 → ₺2.260.000, ertesi gün geri.
  // EUR/TRY 50 sabitken bu, defterde olmayan ≈€28.600 sahte akıştır.
  const points = [
    { date: '2026-07-31', value: 100_000 },
    { date: '2026-08-01', value: 100_200 },
    { date: '2026-08-02', value: 100_400 },
  ];
  const eurTry = 50;
  const snapDepositsTRY = [830_000, 2_260_000, 830_000];
  const fakeFlows = [0, 1].map((i) => {
    const deltaTRY = snapDepositsTRY[i + 1] - snapDepositsTRY[i];
    return {
      date: points[i + 1].date,
      kind: 'deposit' as const,
      amountEUR: deltaTRY / eurTry,
      amountTRY: deltaTRY,
      amountUSD: 0,
    };
  });

  it('önce: snapshot farkı iki günde yaklaşık −%7,8 zincirler', () => {
    const linked = linkedFlowAdjustedReturn(points, fakeFlows, (f) => f.amountEUR);
    expect(flowAdjustedReturn(100_000, 100_200, (2_260_000 - 830_000) / 50)).toBeCloseTo(-0.284, 3);
    expect(linked).toBeCloseTo((1 - 0.284) * (1 + 28800 / 100_200) - 1, 3);
    expect(linked!).toBeLessThan(-0.05);
  });

  it('sonra: defterde akış yoksa getiri yaklaşık +%0,40', () => {
    const linked = linkedFlowAdjustedReturn(points, [], (f) => f.amountEUR);
    expect(linked).toBeCloseTo(100_400 / 100_000 - 1, 6);
    const mwr = modifiedDietz({
      beginDate: points[0].date,
      endDate: points[2].date,
      beginValueEUR: points[0].value,
      endValueEUR: points[2].value,
      flows: [],
    });
    expect(mwr!.dietzPct).toBeCloseTo(0.4, 6);
    expect(mwr!.netFlowEUR).toBe(0);
  });

  it('kümülatif snapshot tutarı bugünkü kurla şişmez', () => {
    const { flows } = externalFlowsFromLedger([
      { created_at: '2026-01-15T12:00:00Z', currency: 'EUR', transaction_type: 'deposit', amount: 1000 },
      { created_at: '2026-06-15T12:00:00Z', currency: 'EUR', transaction_type: 'deposit', amount: 500 },
    ], {
      eur: [{ date: '2026-01-01', rate: 50 }, { date: '2026-06-01', rate: 55 }],
      usd: [{ date: '2026-01-01', rate: 40 }, { date: '2026-06-01', rate: 44 }],
    });
    const totals = ledgerCashTotals(flows);
    expect(totals.depositsTRY).toBeCloseTo(1000 * 50 + 500 * 55, 4);
    expect(totals.depositsTRY).not.toBeCloseTo(1500 * 55, 0);
    expect(totals.depositsEUR).toBeCloseTo(1500, 4);
  });
});
