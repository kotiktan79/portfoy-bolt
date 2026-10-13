import { describe, expect, it } from 'vitest';
import { buildMonthlyEmail, type MonthlySnapshot } from '../../../api/lib/email';
import { INFLATION_EUR } from '../../lib/eurPnl';

const snap: MonthlySnapshot = {
  monthLabel: 'Eyl 2026',
  salaryMonthLabel: 'Eki 2026',
  startWealthEUR: 136159,
  endWealthEUR: 148068,
  gainEUR: 200.87,
  inflationEUR: 335.8,
  realGainEUR: -134.93,
  carryInEUR: 0,
  withdrawableEUR: 0,
  carryOutEUR: -134.93,
  salaryEUR: 0,
  realizedIncomeEUR: 0,
  monthIncomeBreakdown: [],
  topGainersThisMonth: [],
  yearRows: [],
  diagnosisAi: '',
  healthOk: true,
};

describe('aylık e-posta enflasyon yazısı', () => {
  it('başlık varsayılan euro enflasyonunu söyler, %2 kalmaz', () => {
    const { html } = buildMonthlyEmail(snap);
    expect(INFLATION_EUR).toBe(0.03);
    expect(html).toContain('enflasyon %3/yıl');
    expect(html).not.toContain('enflasyon %2/yıl');
  });
});
