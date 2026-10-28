import { describe, expect, it } from 'vitest';
import { withdrawalEUR } from '../lib/eurPnl';
import { kasaOutstandingEUR } from '../lib/salaryPlan';
import { assembleMonthSalaryInputs, salaryRateSeries } from './monthSalaryCardService';

describe('maaş kartı okuma birleştirmesi', () => {
  it('Kâr Cüzdanı alanlarını aynen taşır', () => {
    const moves = [
      { kind: 'topup', amount_eur: 300 },
      { kind: 'refill', amount_eur: 50 },
    ];
    const withdrawals = [
      { withdrawn_at: '2026-10-03T12:00:00Z', amount_eur: 10, amount_usd: 1 },
    ];
    const eur = [{ recorded_at: '2026-10-01', rate: 50 }];
    const usd = [{ recorded_at: '2026-10-01', rate: 40 }];
    const inp = assembleMonthSalaryInputs({
      asOfMonth: '2026-10',
      poolEUR: 800,
      realGainEUR: 120,
      kasaEUR: 18_000,
      policy: {
        floor_eur: 750,
        cap_eur: 900,
        kasa_floor_eur: 14_000,
        kasa_refill_ratio: 0.25,
        kasa_start_eur: 20_000,
        salary_start_month: '2027-04',
      },
      moves,
      withdrawals,
      eurRates: eur,
      usdRates: usd,
    });
    expect(inp.poolEUR).toBe(800);
    expect(inp.realGainEUR).toBe(120);
    expect(inp.kasaEUR).toBe(18_000);
    expect(inp.kasaDrawnOutstandingEUR).toBe(kasaOutstandingEUR(moves));
    expect(inp.floorEUR).toBe(750);
    expect(inp.capEUR).toBe(900);
    expect(inp.kasaMinEUR).toBe(14_000);
    expect(inp.refillRatio).toBe(0.25);
    expect(inp.kasaStartEUR).toBe(20_000);
    expect(inp.salaryStartMonth).toBe('2027-04');
    expect(inp.withdrawnThisMonthEUR).toBe(10);
  });

  it('boş ayar ve boş maaş satırı varsayılanı bozmaz', () => {
    const inp = assembleMonthSalaryInputs({
      asOfMonth: '2026-10',
      poolEUR: 0,
      realGainEUR: 0,
      kasaEUR: 15_700,
      policy: null,
      moves: [],
      withdrawals: [],
      eurRates: [],
      usdRates: [],
    });
    expect(inp.floorEUR).toBeUndefined();
    expect(inp.salaryStartMonth).toBeUndefined();
    expect(inp.poolEUR).toBe(0);
    expect(inp.withdrawnThisMonthEUR).toBe(0);
  });

  it('eski USD çekimini cüzdanın kuruyla çevirir', () => {
    const day = '2026-10-04';
    const rows = [{ day, rate: 50 }, { day: '2026-09-01', rate: 48 }];
    const usdRows = [{ day, rate: 40 }];
    const series = salaryRateSeries(rows);
    const usdSeries = salaryRateSeries(usdRows);
    const w = { withdrawn_at: '2026-10-04T09:00:00Z', amount_usd: 80, amount_eur: null };
    const inp = assembleMonthSalaryInputs({
      asOfMonth: '2026-10',
      poolEUR: 0,
      realGainEUR: 0,
      kasaEUR: 1,
      policy: null,
      moves: [],
      withdrawals: [w],
      eurRates: rows.map(r => ({ recorded_at: r.day, rate: r.rate })),
      usdRates: usdRows.map(r => ({ recorded_at: r.day, rate: r.rate })),
    });
    expect(inp.withdrawnThisMonthEUR).toBeCloseTo(withdrawalEUR(w, series.rateAt('2026-10-04'), usdSeries.rateAt('2026-10-04')), 6);
    expect(inp.withdrawnThisMonthEUR).toBeCloseTo(64, 6);
  });
});
