import { describe, expect, it } from 'vitest';
import { chainFromPrevReport } from '../../../api/lib/reportChain';

// 25 Kasım raporu: motor dünü €147.660,74 (24 Kasım snapshot / tik kur 55.6359) aldı;
// düzeltilmiş 24 Kasım satırı €147.983,11, ay −€1.574,56.
const engine = {
  asOf: '2026-11-25',
  wealthEUR: 147048.24,
  prevWealthEUR: 147660.74,
  dayGainEUR: 147048.24 - 147660.74,
  mtdGainEUR: -1936.13 + (147048.24 - 147660.74),
};

describe('chainFromPrevReport', () => {
  it('düzeltilmiş dünkü satırdan zincirler (25 Kasım)', () => {
    const c = chainFromPrevReport(engine, { report_date: '2026-11-24', wealth_eur: '147983.11', pnl_eur_mtd: '-1574.56' });
    expect(c.dayGainEUR).toBeCloseTo(-934.87, 2);
    expect(c.mtdGainEUR).toBeCloseTo(-2509.43, 2);
    expect(c.prevWealthEUR).toBe(147983.11);
    expect(c.note).toMatch(/Zincir/);
  });

  it('akış (yatırma) kâr sayılmaz, motorunkiyle aynı düşülür', () => {
    const c = chainFromPrevReport(
      { asOf: '2026-11-25', wealthEUR: 151000, prevWealthEUR: 149000, dayGainEUR: 1000, mtdGainEUR: 500 },
      { report_date: '2026-11-24', wealth_eur: 149500, pnl_eur_mtd: -400 },
    );
    // akış = 151000 − 149000 − 1000 = 1000
    expect(c.dayGainEUR).toBeCloseTo(500, 6);
    expect(c.mtdGainEUR).toBeCloseTo(100, 6);
  });

  it('ay başında ay = gün', () => {
    const c = chainFromPrevReport(
      { asOf: '2026-12-01', wealthEUR: 148000, prevWealthEUR: 147900, dayGainEUR: 100, mtdGainEUR: 100 },
      { report_date: '2026-11-30', wealth_eur: 147800, pnl_eur_mtd: -2000 },
    );
    expect(c.dayGainEUR).toBeCloseTo(200, 6);
    expect(c.mtdGainEUR).toBeCloseTo(200, 6);
  });

  it('dünkü satır yoksa veya boşsa motor rakamı aynen kalır', () => {
    expect(chainFromPrevReport(engine, null).dayGainEUR).toBe(engine.dayGainEUR);
    const c = chainFromPrevReport(engine, { report_date: '2026-11-24', wealth_eur: null, pnl_eur_mtd: null });
    expect(c.dayGainEUR).toBe(engine.dayGainEUR);
    expect(c.mtdGainEUR).toBe(engine.mtdGainEUR);
    expect(c.note).toBeNull();
  });

  it('dünkü satır motorla aynıysa not yok', () => {
    const c = chainFromPrevReport(engine, { report_date: '2026-11-24', wealth_eur: 147660.74, pnl_eur_mtd: -1936.13 });
    expect(c.note).toBeNull();
    expect(c.dayGainEUR).toBeCloseTo(engine.dayGainEUR, 6);
  });
});
