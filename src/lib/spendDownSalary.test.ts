import { describe, it, expect } from 'vitest';
import {
  annuityTargetMonthlyEUR, yearsLeft, parseSalaryRule, withSalaryRule, planSpendDown, fixYear,
  expectedPath, approvedIndexFor, explainSpendDown, SALARY_RULE_KEY, type SalaryRuleConfig,
} from './spendDownSalary';
import { mergeKeepingExtras, parseInflationDecisions, addInflationDecision } from './inflationDecision';

const cfg = (over: Partial<SalaryRuleConfig> = {}): SalaryRuleConfig => ({ ...parseSalaryRule({}), mode: 'spend_down', ...over });

describe('harca-bitir hedefi', () => {
  it('backtest ile aynı formül: €148,5k, 42 yıl → €521/ay (flex.py başlangıcı)', () => {
    expect(annuityTargetMonthlyEUR(148_500, 42, 0.035, 30_000)).toBeCloseTo(521.4, 0);
  });
  it('kasa hariç €132,5k, 42 yıl → ~€462/ay', () => {
    expect(annuityTargetMonthlyEUR(132_500, 42, 0.035, 30_000)).toBeCloseTo(462.5, 0);
  });
  it('kalan yıl 2068 sonu: 2027 → 41, 2068 → 0', () => {
    expect(yearsLeft(2027, 2068)).toBe(41);
    expect(yearsLeft(2068, 2068)).toBe(0);
    expect(annuityTargetMonthlyEUR(100_000, 0, 0.035, 30_000)).toBe(0);
  });
  it('%3,5 sabit getiride 90 yaşta tam €30.000 kalır (harca-bitir sonu)', () => {
    const rows = expectedPath({ startYear: 2027, portfolioEUR: 137_000, config: cfg() });
    const last = rows[rows.length - 1];
    expect(last.year).toBe(2068);
    expect(last.age).toBe(90);
    expect(last.startEUR).toBeCloseTo(30_000, -1);
    // sabit getiride hedef her yıl aynı → maaş sabit
    expect(rows[0].monthlyEUR).toBeCloseTo(rows[20].monthlyEUR, 1);
  });
  it('para tamponun altındaysa hedef 0', () => {
    expect(annuityTargetMonthlyEUR(10_000, 20, 0.035, 30_000)).toBe(0);
  });
});

describe('yumuşatma ve taban', () => {
  it('ilk yıl maaş = hedef', () => {
    const p = planSpendDown({ year: 2027, portfolioEUR: 137_000, kasaEUR: 16_000, config: cfg() });
    expect(p.firstYear).toBe(true);
    expect(p.monthlyEUR).toBeCloseTo(p.targetEUR, 2);
    expect(p.fromKasaEUR).toBe(0);
  });
  it('geçen yıl + ½ × (hedef − geçen yıl)', () => {
    const c = cfg({ years: { '2027': { monthlyEUR: 500, targetEUR: 500, portfolioEUR: 0, yearsLeft: 41, indexApplied: 1, fixedAt: '' } } });
    const p = planSpendDown({ year: 2028, portfolioEUR: 200_000, kasaEUR: 0, config: c });
    expect(p.prevEUR).toBe(500);
    expect(p.ruleEUR).toBeCloseTo(500 + 0.5 * (p.targetEUR - 500), 2);
    expect(p.monthlyEUR).toBeCloseTo(p.ruleEUR, 2);
  });
  it('kötü yılda taban €400, farkı kasadan (kasa yeterse)', () => {
    const c = cfg({ years: { '2030': { monthlyEUR: 420, targetEUR: 420, portfolioEUR: 0, yearsLeft: 38, indexApplied: 1, fixedAt: '' } } });
    const p = planSpendDown({ year: 2031, portfolioEUR: 60_000, kasaEUR: 16_000, config: c });
    expect(p.ruleEUR).toBeLessThan(400);
    expect(p.monthlyEUR).toBe(400);
    expect(p.floorApplied).toBe(true);
    expect(p.fromKasaEUR).toBeCloseTo(400 - p.ruleEUR, 1);
    expect(p.fromPortfolioEUR + p.fromKasaEUR).toBeCloseTo(400, 2);
  });
  it('kasa boşsa taban yine €400, hepsi portföyden', () => {
    const p = planSpendDown({ year: 2040, portfolioEUR: 20_000, kasaEUR: 0, config: cfg() });
    expect(p.monthlyEUR).toBe(400);
    expect(p.fromKasaEUR).toBe(0);
    expect(p.fromPortfolioEUR).toBe(400);
  });
  it('tavan yok; config tavanı verilirse uygulanır', () => {
    const big = planSpendDown({ year: 2027, portfolioEUR: 1_000_000, kasaEUR: 0, config: cfg() });
    expect(big.monthlyEUR).toBeGreaterThan(3000);
    const capped = planSpendDown({ year: 2027, portfolioEUR: 1_000_000, kasaEUR: 0, config: cfg({ capEUR: 2000 }) });
    expect(capped.monthlyEUR).toBe(2000);
    expect(capped.capApplied).toBe(true);
  });
  it('kasa varsayılan olarak hesaba girmez; includeKasa ile girer', () => {
    const a = planSpendDown({ year: 2027, portfolioEUR: 132_500, kasaEUR: 16_000, config: cfg() });
    const b = planSpendDown({ year: 2027, portfolioEUR: 132_500, kasaEUR: 16_000, config: cfg({ includeKasa: true }) });
    expect(a.baseEUR).toBe(132_500);
    expect(b.baseEUR).toBe(148_500);
    expect(b.monthlyEUR).toBeGreaterThan(a.monthlyEUR);
  });
});

describe('enflasyon yalnız onayla', () => {
  const rec = { '2027': { monthlyEUR: 500, targetEUR: 500, portfolioEUR: 0, yearsLeft: 41, indexApplied: 1, fixedAt: '' } };
  it('karar yoksa / reddedildiyse büyütülmez', () => {
    expect(approvedIndexFor(2027, {})).toBe(1);
    const declined = parseInflationDecisions({ '2027': { year: 2027, decision: 'declined', rate: 0.03, amountEUR: 0, decidedAt: 'x' } });
    expect(approvedIndexFor(2027, declined)).toBe(1);
    const p = planSpendDown({ year: 2028, portfolioEUR: 137_000, kasaEUR: 0, config: cfg({ years: rec }), inflationDecisions: declined });
    expect(p.prevEUR).toBe(500);
  });
  it('onaylıysa geçen yılın maaşı oranla büyür', () => {
    const ok = parseInflationDecisions({ '2027': { year: 2027, decision: 'approved', rate: 0.02, amountEUR: 100, decidedAt: 'x' } });
    const p = planSpendDown({ year: 2028, portfolioEUR: 137_000, kasaEUR: 0, config: cfg({ years: rec }), inflationDecisions: ok });
    expect(p.prevEUR).toBeCloseTo(510, 2);
    expect(p.indexApplied).toBeCloseTo(1.02, 6);
  });
});

describe('kayıt (mevcut jsonb, yeni sütun yok)', () => {
  it('varsayılan mod kâr kuralı; kasa geri doldurma kapalı', () => {
    const c = parseSalaryRule({});
    expect(c.mode).toBe('profit');
    expect(c.kasaRefill).toBe(false);
    expect(c.floorEUR).toBe(400);
    expect(c.endYear).toBe(2068);
  });
  it('kural yazılırken yıl kararları korunur; enflasyon kararı yazılırken kural korunur', () => {
    const yearDec = { '2026': { year: 2026, decision: 'approved', rate: 0.03, amountEUR: 50, decidedAt: 'x' } };
    const withRule = withSalaryRule(yearDec, cfg());
    expect(withRule['2026']).toEqual(yearDec['2026']);
    expect(parseSalaryRule(withRule).mode).toBe('spend_down');
    // enflasyon kartı yalnız yıl anahtarlarını okur → yazarken kural silinmemeli
    const parsed = parseInflationDecisions(withRule);
    expect(Object.keys(parsed)).toEqual(['2026']);
    const next = addInflationDecision(parsed, { year: 2027, decision: 'declined', rate: 0.03, amountEUR: 0 })!;
    const written = mergeKeepingExtras(withRule, next);
    expect(written[SALARY_RULE_KEY]).toBeTruthy();
    expect(parseSalaryRule(written).mode).toBe('spend_down');
    expect(Object.keys(parseInflationDecisions(written)).sort()).toEqual(['2026', '2027']);
  });
  it('yılın maaşı bir kez sabitlenir; sonra piyasa oynasa da değişmez', () => {
    const c = cfg();
    const p = planSpendDown({ year: 2027, portfolioEUR: 137_000, kasaEUR: 0, config: c });
    const fixed = fixYear(c, p, new Date('2027-01-05T00:00:00Z'))!;
    expect(fixed.years['2027'].monthlyEUR).toBe(p.monthlyEUR);
    expect(fixYear(fixed, p)).toBeNull();
    const later = planSpendDown({ year: 2027, portfolioEUR: 90_000, kasaEUR: 0, config: fixed });
    expect(later.fixed).toBe(true);
    expect(later.monthlyEUR).toBe(p.monthlyEUR);
  });
  it('bozuk değerler varsayılana döner', () => {
    const c = parseSalaryRule({ [SALARY_RULE_KEY]: { mode: 'x', realRate: 'abc', smoothing: 5, floorEUR: -3, years: { abc: {}, '2027': { monthlyEUR: 'y' } } } });
    expect(c.mode).toBe('profit');
    expect(c.realRate).toBe(0.035);
    expect(c.smoothing).toBe(0.5);
    expect(c.floorEUR).toBe(0);
    expect(c.years).toEqual({});
  });
});

describe('açıklama', () => {
  it('kalan para, kalan yıl, hedef satırları', () => {
    const c = cfg();
    const lines = explainSpendDown(planSpendDown({ year: 2027, portfolioEUR: 137_142, kasaEUR: 0, config: c }), c);
    expect(lines[0]).toContain('Kalan para: €137.142');
    expect(lines[0]).toContain('kasa ve Ev Parası hariç');
    expect(lines[1]).toContain('Kalan yıl: 41');
    expect(lines[2]).toContain('€484/ay');
  });
});
