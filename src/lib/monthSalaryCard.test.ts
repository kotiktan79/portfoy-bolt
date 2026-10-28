import { describe, expect, it } from 'vitest';
import { planSalary } from './salaryPlan';
import { withdrawnMap } from './eurPnl';
import {
  buildMonthSalaryCard,
  formatSalaryEUR,
  salarySourceLine,
  salaryStartPhrase,
  withdrawnThisMonthEUR,
} from './monthSalaryCard';

const oct = {
  poolEUR: 800,
  realGainEUR: 200,
  kasaEUR: 20_000,
  asOfMonth: '2026-10',
  withdrawnThisMonthEUR: 0,
};

describe('Bu ay maaşı cümleleri', () => {
  it('Nisan 2027 öncesi: başlamadı cümlesi ve örnek tutar', () => {
    const plan = planSalary(oct);
    const view = buildMonthSalaryCard(oct);
    expect(view.state).toBe('not_started');
    expect(view.notice).toBe("Maaş Nisan 2027'de başlıyor");
    expect(salaryStartPhrase('2027-04')).toBe("Maaş Nisan 2027'de başlıyor");
    expect(view.primary).toBe(`Şu an başlasaydı: ${formatSalaryEUR(plan.totalEUR)}`);
    expect(view.primary).toBe('Şu an başlasaydı: €700');
    expect(view.sourceLine).toBe('Kârdan €680 + kasadan €20');
    expect(view.plannedFromPoolEUR).toBe(plan.fromPoolEUR);
    expect(view.plannedFromKasaEUR).toBe(plan.fromKasaEUR);
    expect(view.plannedTotalEUR).toBe(plan.totalEUR);
    expect(view.rule).toBe('Sadece bu kadar çek, fazlasını değil.');
    expect(view.primary).not.toContain('çekebileceğin');
  });

  it('başlamadan önceki çekim, örnek tutarı ve cümleyi değiştirmez', () => {
    const view = buildMonthSalaryCard({ ...oct, withdrawnThisMonthEUR: 700 });
    expect(view.state).toBe('not_started');
    expect(view.primary).toBe('Şu an başlasaydı: €700');
    expect(view.sourceLine).toBe('Kârdan €680 + kasadan €20');
  });

  it('maaş başladıysa büyük satır çekilebilecek tutardır', () => {
    const view = buildMonthSalaryCard({ ...oct, asOfMonth: '2027-04' });
    const plan = planSalary({ ...oct, asOfMonth: '2027-04' });
    expect(plan.preview).toBe(false);
    expect(view.state).toBe('open');
    expect(view.notice).toBeNull();
    expect(view.primary).toBe('Bu ay çekebileceğin maaş: €700');
    expect(view.sourceLine).toBe('Kârdan €680 + kasadan €20');
    expect(view.shownEUR).toBe(plan.totalEUR);
  });

  it('sıfır parçayı yazmaz', () => {
    const onlyPool = buildMonthSalaryCard({
      poolEUR: 2_000,
      realGainEUR: 1_200,
      kasaEUR: 29_400,
      asOfMonth: '2027-05',
    });
    expect(onlyPool.primary).toBe('Bu ay çekebileceğin maaş: €1.000');
    expect(onlyPool.sourceLine).toBe('Kârdan €1.000');
    expect(onlyPool.sourceLine).not.toContain('kasadan');

    const onlyKasa = buildMonthSalaryCard({
      poolEUR: 0,
      realGainEUR: -100,
      kasaEUR: 15_700,
      asOfMonth: '2027-05',
    });
    expect(onlyKasa.primary).toBe('Bu ay çekebileceğin maaş: €700');
    expect(onlyKasa.sourceLine).toBe('Kasadan €700');
    expect(onlyKasa.sourceLine).not.toContain('Kârdan');

    const none = buildMonthSalaryCard({
      poolEUR: 0,
      realGainEUR: 0,
      kasaEUR: 15_600,
      asOfMonth: '2027-05',
    });
    expect(none.primary).toBe('Bu ay çekebileceğin maaş: €0');
    expect(none.sourceLine).toBeNull();
    expect(salarySourceLine(0, 0)).toBeNull();
  });

  it('bu ayın maaşı çekildiyse çekildi cümlesi', () => {
    const view = buildMonthSalaryCard({
      ...oct,
      asOfMonth: '2027-05',
      withdrawnThisMonthEUR: 700,
    });
    expect(view.state).toBe('withdrawn');
    expect(view.primary).toBe('✅ Bu ayın maaşı çekildi (€700)');
    expect(view.sourceLine).toBeNull();
    expect(view.notice).toBeNull();
  });

  it('kısmi çekimde kalan tutarı ve kalan kaynağı yazar', () => {
    const poolPart = buildMonthSalaryCard({
      poolEUR: 2_000,
      realGainEUR: 1_200,
      kasaEUR: 29_400,
      asOfMonth: '2027-05',
      withdrawnThisMonthEUR: 400,
    });
    expect(poolPart.state).toBe('open');
    expect(poolPart.primary).toBe('Bu ay çekebileceğin maaş: €600');
    expect(poolPart.sourceLine).toBe('Kârdan €600');

    const kasaLeft = buildMonthSalaryCard({
      ...oct,
      asOfMonth: '2027-05',
      withdrawnThisMonthEUR: 680,
    });
    expect(kasaLeft.primary).toBe('Bu ay çekebileceğin maaş: €20');
    expect(kasaLeft.sourceLine).toBe('Kasadan €20');
  });

  it('ayardaki taban ve başlangıç ayı aynı hesaba gider', () => {
    const view = buildMonthSalaryCard({
      poolEUR: 800,
      realGainEUR: 200,
      kasaEUR: 20_000,
      asOfMonth: '2027-06',
      floorEUR: 800,
      salaryStartMonth: '2028-06',
    });
    const plan = planSalary({
      poolEUR: 800,
      realGainEUR: 200,
      kasaEUR: 20_000,
      asOfMonth: '2027-06',
      floorEUR: 800,
      salaryStartMonth: '2028-06',
    });
    expect(view.state).toBe('not_started');
    expect(view.notice).toBe("Maaş Haziran 2028'de başlıyor");
    expect(view.primary).toBe(`Şu an başlasaydı: ${formatSalaryEUR(plan.totalEUR)}`);
    expect(view.sourceLine).toBe('Kârdan €680 + kasadan €120');
    expect(view.plannedTotalEUR).toBe(800);
  });

  it('bu ay çekilen, withdrawnMap ile aynı aydır', () => {
    const rows = [
      { withdrawn_at: '2027-05-02T08:00:00Z', amount_eur: 400, amount_usd: 999 },
      { withdrawn_at: '2027-04-28T08:00:00Z', amount_eur: 100, amount_usd: 1 },
      { withdrawn_at: '2027-05-10T08:00:00Z', amount_usd: 50 },
    ];
    const eur = [{ recorded_at: '2027-05-01', rate: 50 }];
    const usd = [{ recorded_at: '2027-05-01', rate: 40 }];
    expect(withdrawnThisMonthEUR(rows, '2027-05', eur, usd)).toBe(withdrawnMap(rows, eur, usd).get('2027-05'));
    expect(withdrawnThisMonthEUR(rows, '2027-05', eur, usd)).toBeCloseTo(400 + 50 * 40 / 50, 6);
    expect(withdrawnThisMonthEUR(rows, '2027-04', eur, usd)).toBe(100);
  });
});
