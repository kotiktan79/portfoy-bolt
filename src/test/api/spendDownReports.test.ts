import { describe, expect, it } from 'vitest';
import { buildDailyEmail, buildMonthlyEmail, type DailySnapshot, type MonthlySnapshot } from '../../../api/lib/email';
import { buildDailyTelegram, buildMonthlyTelegram } from '../../../api/lib/telegram';
const daily: DailySnapshot = {
  spendDown: true, date: '2028-01-10', asOf: '2028-01-10', wealthEUR: 100000, wealthTRY: 5000000, eurRate: 50,
  dayGainEUR: -372.87, dayGainPct: -.37, weekGainEUR: 0, weekGainPct: 0, mtdGainEUR: 0, mtdInflationEUR: 0,
  mtdRealEUR: 0, carryInEUR: 0, salaryEUR: 400, salaryMonthLabel: 'Ocak 2028', salaryBasisLabel: 'Ara 2027',
  projectedSalaryEUR: 400, nextMonthLabel: 'Şubat 2028', healthOk: true, topPick: '', portfolioDiagnosis: '', marketOutlook: '', actions: [],
};
const monthly: MonthlySnapshot = {
  spendDown: true, monthLabel: 'Ara 2027', salaryMonthLabel: 'Ocak 2028', salaryEUR: 400,
  startWealthEUR: 100000, endWealthEUR: 100000, gainEUR: 0, inflationEUR: 0, realGainEUR: 0, carryInEUR: 0,
  withdrawableEUR: 0, carryOutEUR: 0, realizedIncomeEUR: 0, monthIncomeBreakdown: [], topGainersThisMonth: [],
  yearRows: [{ month: 'Ara 2027', gainEUR: 0, salaryEUR: 0 }], diagnosisAi: '', healthOk: true,
};
describe('harca-bitir rapor dili', () => {
  it('günlük e-posta ve Telegram aynı yıllık maaşı, eski tavan olmadan gösterir', () => {
    for (const text of [buildDailyEmail(daily).html, buildDailyTelegram(daily)]) {
      expect(text).toContain('€400'); expect(text).not.toMatch(/× 0,85|tavan €1.000/);
    }
  });
  it('aylık e-posta ve Telegram eski kâr maaşını güncel maaş gibi sunmaz', () => {
    for (const text of [buildMonthlyEmail(monthly).html, buildMonthlyTelegram(monthly)]) {
      expect(text).toContain('€400'); expect(text).not.toMatch(/× 0,85|tavan €1.000|maaş €0/);
    }
  });
});
