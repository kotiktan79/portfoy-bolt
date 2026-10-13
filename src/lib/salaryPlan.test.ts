import { describe, it, expect } from 'vitest';
import { planSalary, kasaOutstandingEUR, SALARY_FLOOR_EUR, KASA_MIN_EUR, KASA_START_EUR } from './salaryPlan';
import { entitlementEUR } from './eurPnl';

describe('planSalary — taban €700, kasa €15.000', () => {
  it('havuz katkısı tabanın altındayken farkı kasadan tamamlar ve %85 kuralını bozmaz', () => {
    // havuz 800 → %85 = 680 < 700 → kasadan €20
    const p = planSalary({ poolEUR: 800, realGainEUR: 200, kasaEUR: 20_000 });
    expect(p.fromPoolEUR).toBeCloseTo(entitlementEUR(800), 2);
    expect(p.fromPoolEUR).toBeCloseTo(680, 2);
    expect(p.fromPoolEUR).toBeLessThan(SALARY_FLOOR_EUR);
    expect(p.fromKasaEUR).toBeCloseTo(20, 2);
    expect(p.totalEUR).toBeCloseTo(700, 2);
    expect(p.topUpBlocked).toBe(false);
    expect(p.distanceToFloorEUR).toBeCloseTo(5_000, 2);
  });

  it('havuz €0 iken kasa sınırı korunuyorsa tabanın tamamı kasadan önerilir', () => {
    const p = planSalary({ poolEUR: 0, realGainEUR: -100, kasaEUR: 15_700 });
    expect(p.fromPoolEUR).toBe(0);
    expect(p.fromKasaEUR).toBe(700);
    expect(p.totalEUR).toBe(700);
    expect(15_700 - 700).toBeGreaterThanOrEqual(KASA_MIN_EUR);
  });

  it('kasa €15.000 altına inecekse tamamlama önermez', () => {
    const blocked = planSalary({ poolEUR: 0, realGainEUR: 0, kasaEUR: 15_600 });
    expect(blocked.fromKasaEUR).toBe(0);
    expect(blocked.totalEUR).toBe(0);
    expect(blocked.topUpBlocked).toBe(true);
    expect(15_600 - 700).toBeLessThan(KASA_MIN_EUR);

    const alreadyUnder = planSalary({ poolEUR: 100, realGainEUR: 0, kasaEUR: 14_000 });
    expect(alreadyUnder.fromPoolEUR).toBeCloseTo(85, 2);
    expect(alreadyUnder.fromKasaEUR).toBe(0);
    expect(alreadyUnder.topUpBlocked).toBe(true);
    expect(alreadyUnder.distanceToFloorEUR).toBeCloseTo(-1_000, 2);
  });

  it('kısmi fark sınırı deliyorsa da önermez; sınır tutuyorsa yalnız farkı önerir', () => {
    const no = planSalary({ poolEUR: 650 / 0.85, realGainEUR: 0, kasaEUR: 15_040 });
    expect(no.fromPoolEUR).toBeCloseTo(650, 1);
    expect(no.fromKasaEUR).toBe(0);
    expect(no.topUpBlocked).toBe(true);

    const yes = planSalary({ poolEUR: 650 / 0.85, realGainEUR: 0, kasaEUR: 15_050 });
    expect(yes.fromKasaEUR).toBeCloseTo(50, 1);
    expect(yes.totalEUR).toBeCloseTo(700, 1);
  });

  it('havuzdan gelen tutar tabanı geçince kasaya dokunulmaz; aylık tavan €1.000 durur', () => {
    const p = planSalary({ poolEUR: 2_000, realGainEUR: 1_200, kasaEUR: 29_400 });
    expect(p.fromPoolEUR).toBe(1_000);          // 0,85 × 2.000 = 1.700 → tavan
    expect(p.fromKasaEUR).toBe(0);
    expect(p.topUpBlocked).toBe(false);
    expect(p.totalEUR).toBe(1_000);
  });

  it('eksi havuzda maaş havuzdan €0; kasa yeterse taban yine önerilir', () => {
    const p = planSalary({ poolEUR: -400, realGainEUR: -400, kasaEUR: 20_000 });
    expect(p.fromPoolEUR).toBe(0);
    expect(p.fromKasaEUR).toBe(700);
  });
});

describe('planSalary — iyi ayda kasa doldurma', () => {
  it('tavan aşıldıktan sonra kalan reel kârın %50\'si, alınan tutar ve €29.400 odası ile sınırlı', () => {
    const p = planSalary({
      poolEUR: 5_000,
      realGainEUR: 3_000,          // maaş 1.000, kalan reel 2.000 × %50 = 1.000
      kasaEUR: 20_000,
      kasaDrawnOutstandingEUR: 2_000,
    });
    expect(p.fromPoolEUR).toBe(1_000);
    expect(p.refillEUR).toBe(1_000);
    expect(KASA_START_EUR - 20_000).toBeGreaterThan(p.refillEUR);
  });

  it('kasadan alınmış borç yoksa doldurma önermez', () => {
    const p = planSalary({ poolEUR: 5_000, realGainEUR: 3_000, kasaEUR: 20_000, kasaDrawnOutstandingEUR: 0 });
    expect(p.refillEUR).toBe(0);
  });

  it('kasa başlangıç değerine ulaştıysa doldurma durur', () => {
    const p = planSalary({ poolEUR: 5_000, realGainEUR: 3_000, kasaEUR: 29_400, kasaDrawnOutstandingEUR: 500 });
    expect(p.refillEUR).toBe(0);
  });

  it('tavan dolmadan (zayıf ay) reel kâr kasaya gitmez', () => {
    const p = planSalary({ poolEUR: 500, realGainEUR: 4_000, kasaEUR: 18_000, kasaDrawnOutstandingEUR: 1_000 });
    expect(p.fromPoolEUR).toBeCloseTo(425, 2);
    expect(p.fromPoolEUR).toBeLessThan(1_000);
    expect(p.refillEUR).toBe(0);
  });

  it('doldurma, odaya ve borca sığmayan kısmı keser', () => {
    const p = planSalary({
      poolEUR: 5_000,
      realGainEUR: 5_000,          // kalan 4.000 × %50 = 2.000
      kasaEUR: 29_000,             // oda yalnız €400
      kasaDrawnOutstandingEUR: 800,
    });
    expect(p.refillEUR).toBe(400);
  });
});

describe('planSalary — ön izleme ve defter', () => {
  it('Nisan 2027 öncesi ön izleme, o ay ve sonrası değil', () => {
    expect(planSalary({ poolEUR: 0, realGainEUR: 0, kasaEUR: 20_000, asOfMonth: '2026-10' }).preview).toBe(true);
    expect(planSalary({ poolEUR: 0, realGainEUR: 0, kasaEUR: 20_000, asOfMonth: '2027-03' }).preview).toBe(true);
    expect(planSalary({ poolEUR: 0, realGainEUR: 0, kasaEUR: 20_000, asOfMonth: '2027-04' }).preview).toBe(false);
  });

  it('kasa defteri topup eksi refill', () => {
    expect(kasaOutstandingEUR([
      { kind: 'topup', amount_eur: 300 },
      { kind: 'topup', amount_eur: 200 },
      { kind: 'refill', amount_eur: 150 },
    ])).toBe(350);
    expect(kasaOutstandingEUR([{ kind: 'refill', amount_eur: 50 }])).toBe(0);
  });
});
