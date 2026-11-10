import { describe, expect, it } from 'vitest';
import { parseSalaryRule, planSpendDown, fixYear, explainSpendDown, salaryPlanForMonth, expectedPath, type SalaryRuleConfig } from './spendDownSalary';

const cfg = () => ({ ...parseSalaryRule({}), mode: 'spend_down' as const, realRate: .025, bufferEUR: 40000,
  years: { '2027': { monthlyEUR: 400, portfolioEUR: 200000, targetEUR: 400, yearsLeft: 41, indexApplied: 1, fixedAt: '' } } });
describe('maaş düzeltmeleri', () => {
  it('çekimler sonrası kayıplı yılda hedef yükselse bile reel zam yok; onaylı enflasyon uygulanır', () => {
    const c = cfg();
    const p = planSpendDown({ year: 2028, portfolioEUR: 190000, kasaEUR: 15000, config: c,
      withdrawnSinceLastFixEUR: 4800, inflationDecisions: { '2027': { year: 2027, amountEUR: 0, decision: 'approved', rate: .02, decidedAt: '' } } });
    expect(p.targetEUR).toBeGreaterThan(408);
    expect(p.monthlyEUR).toBe(408);
    expect(p.noRealRaise).toBe(true);
    expect(explainSpendDown(p, c)).toContain('Geçen yıl portföy düştü, bu yıl reel artış yok');
  });
  it('yalnız maaş kadar düşüş zarar değildir; iyi yılda yumuşatılmış artış olabilir', () => {
    for (const portfolioEUR of [195200, 210000]) {
      const p = planSpendDown({ year: 2028, portfolioEUR, kasaEUR: 0, config: cfg(), withdrawnSinceLastFixEUR: 4800 });
      expect(p.noRealRaise).toBe(false);
      expect(p.monthlyEUR).toBeGreaterThan(400);
    }
  });
  it('zararlı yılda maaş düşebilir, taban korunur', () => {
    const c = cfg(); c.years['2027'].monthlyEUR = 600;
    const p = planSpendDown({ year: 2028, portfolioEUR: 30000, kasaEUR: 15000, config: c, withdrawnSinceLastFixEUR: 7200 });
    expect(p.noRealRaise).toBe(true); expect(p.monthlyEUR).toBe(400); expect(p.fromKasaEUR).toBeGreaterThan(0);
  });
  it.each([80000, 100000, 100000.123])('sabitleme maaşı ve kasa payını değiştirmez: %s', portfolioEUR => {
    const c = cfg(); c.years['2027'].portfolioEUR = 0; c.years['2027'].monthlyEUR = 420;
    const input = { year: 2028, portfolioEUR, kasaEUR: 16000, config: c };
    const before = planSpendDown(input);
    const fixed = fixYear(c, before)!;
    const after = planSpendDown({ ...input, config: fixed });
    expect([after.monthlyEUR, after.fromKasaEUR, after.fromPortfolioEUR]).toEqual([before.monthlyEUR, before.fromKasaEUR, before.fromPortfolioEUR]);
    const legacy = structuredClone(fixed); delete legacy.years['2028'].ruleEUR;
    expect(planSpendDown({ ...input, config: legacy }).fromKasaEUR).toBe(before.fromKasaEUR);
  });
  it('aktif modda sıfır sermaye eski kâr hesabına dönmez; başlangıç yılı tüm girişlerde aynı', () => {
    const p = salaryPlanForMonth({ month: '2026-11', portfolioEUR: 0, kasaEUR: 5000, inflationDecisions: { salary_rule: cfg() } });
    expect(p?.year).toBe(2027); expect(p?.monthlyEUR).toBe(400);
  });
  it('beklenen yol yıllık gerçek sabitleme geçişleriyle aynıdır', () => {
    let c: SalaryRuleConfig = { ...cfg(), years: {} };
    let portfolioEUR = 120000;
    const expected = expectedPath({ startYear: 2027, portfolioEUR, config: c });
    for (let i = 0; i < 5; i++) {
      const p = planSpendDown({ year: 2027 + i, portfolioEUR, kasaEUR: 0, config: c });
      expect(expected[i].monthlyEUR).toBe(p.monthlyEUR);
      c = fixYear(c, p)!;
      portfolioEUR = Math.max(0, (portfolioEUR - 12 * p.monthlyEUR) * 1.025);
    }
  });
});
