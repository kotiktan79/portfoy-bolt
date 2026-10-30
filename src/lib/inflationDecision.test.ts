import { describe, it, expect } from 'vitest';
import { monthlyRows } from './eurPnl';
import {
  addInflationDecision, inflationAmountForRate, inflationStatusText, monthlyInflationRate,
  parseInflationDecisions, parseRatePercent, pendingInflationYears, type InflationDecisions,
} from './inflationDecision';

// Yıl sonu enflasyon payı yalnız sahibin onayıyla düşülür (2026-10-30)
const year = [
  { date: '2026-10-01', gainEUR: 0, wealthEUR: 120_000 },
  { date: '2026-10-31', gainEUR: 1_000, wealthEUR: 121_000 },
  { date: '2026-11-30', gainEUR: 500, wealthEUR: 121_500 },
  { date: '2026-12-31', gainEUR: 800, wealthEUR: 122_300 },
  { date: '2027-01-31', gainEUR: 200, wealthEUR: 122_500 },
];
const opts = { carryResetFrom: null } as const;
const sumDed = (rows: { inflationEUR: number }[]) => rows.reduce((s, r) => s + r.inflationEUR, 0);

describe('yıl sonu enflasyon onayı', () => {
  it('karar yoksa hiçbir şey düşülmez, Aralık "onay bekliyor" der', () => {
    const rows = monthlyRows(year, 0.03, opts);
    const dec = rows.find(r => r.month === '2026-12')!;
    expect(sumDed(rows)).toBe(0);
    expect(dec.inflationDecision).toBe('pending');
    expect(dec.realGainEUR).toBe(800);
    expect(dec.carryOutEUR).toBeCloseTo(1_000 + 500 + 800, 6);   // havuzdan pay düşülmedi
    expect(dec.inflationAwaitingApprovalEUR!).toBeGreaterThan(0);
    expect(inflationStatusText(dec)).toMatch(/^Enflasyon payı onay bekliyor: ~€/);
    const p = pendingInflationYears(rows);
    expect(p).toHaveLength(1);
    expect(p[0].year).toBe(2026);
    expect(p[0].defaultAmountEUR).toBeCloseTo(dec.inflationAwaitingApprovalEUR!, 6);
    // yıl içinde (Ekim, Kasım) onay kartı yok
    expect(rows.filter(r => r.month < '2026-12').every(r => r.inflationDecision === undefined)).toBe(true);
  });

  it('onaylanırsa onaylanan tutar yalnız yılın son ayında bir kez düşülür', () => {
    const pending = pendingInflationYears(monthlyRows(year, 0.03, opts))[0];
    const decisions = addInflationDecision({}, { year: 2026, decision: 'approved', rate: 0.03, amountEUR: pending.defaultAmountEUR }, new Date('2026-12-31T12:00:00Z'))!;
    const rows = monthlyRows(year, 0.03, { ...opts, inflationDecisions: decisions });
    const ded = rows.filter(r => r.inflationEUR > 0);
    expect(ded.map(r => r.month)).toEqual(['2026-12']);
    expect(ded[0].inflationEUR).toBe(decisions['2026'].amountEUR);
    expect(ded[0].inflationDecision).toBe('approved');
    expect(ded[0].realGainEUR).toBeCloseTo(800 - decisions['2026'].amountEUR, 6);
    expect(rows.find(r => r.month === '2027-01')!.inflationEUR).toBe(0);
    expect(pendingInflationYears(rows)).toHaveLength(0);
    // ikinci karar aynı yıl için reddedilir (yılda tek karar)
    expect(addInflationDecision(decisions, { year: 2026, decision: 'declined', rate: 0.03, amountEUR: 0 })).toBeNull();
  });

  it('özel oran girilirse tutar o oranla yeniden hesaplanır ve o tutar düşülür', () => {
    const pending = pendingInflationYears(monthlyRows(year, 0.03, opts))[0];
    const rate = parseRatePercent('2,2')!;
    expect(rate).toBeCloseTo(0.022, 10);
    const amt = inflationAmountForRate(pending.baseEUR, rate);
    expect(amt).toBeCloseTo(pending.baseEUR * monthlyInflationRate(0.022), 6);
    expect(amt).toBeLessThan(pending.defaultAmountEUR);
    expect(inflationAmountForRate(pending.baseEUR, 0.03)).toBeCloseTo(pending.defaultAmountEUR, 6);
    const decisions = addInflationDecision({}, { year: 2026, decision: 'approved', rate, amountEUR: amt })!;
    const dec = monthlyRows(year, 0.03, { ...opts, inflationDecisions: decisions }).find(r => r.month === '2026-12')!;
    expect(dec.inflationEUR).toBeCloseTo(amt, 2);
    expect(parseRatePercent('abc')).toBeNull();
    expect(parseRatePercent('40')).toBeNull();
  });

  it('"Bu yıl düşme" seçilirse hiçbir şey düşülmez', () => {
    const decisions = addInflationDecision({}, { year: 2026, decision: 'declined', rate: 0.03, amountEUR: 999 })!;
    expect(decisions['2026'].amountEUR).toBe(0);
    const rows = monthlyRows(year, 0.03, { ...opts, inflationDecisions: decisions });
    const dec = rows.find(r => r.month === '2026-12')!;
    expect(sumDed(rows)).toBe(0);
    expect(dec.inflationDecision).toBe('declined');
    expect(dec.inflationAwaitingApprovalEUR ?? 0).toBe(0);
    expect(inflationStatusText(dec)).toBe('Bu yıl enflasyon payı düşülmedi (senin kararın)');
    expect(pendingInflationYears(rows)).toHaveLength(0);
  });

  it('jsonb kayıtları doğrulanır; bozuk kayıt yok sayılır (düşülmez)', () => {
    const raw = { '2026': { decision: 'approved', rate: 0.03, amountEUR: 100, decidedAt: 'x' }, '2025': { decision: 'maybe' }, abc: {} };
    const d: InflationDecisions = parseInflationDecisions(JSON.stringify(raw));
    expect(Object.keys(d)).toEqual(['2026']);
    expect(parseInflationDecisions(null)).toEqual({});
  });
});
