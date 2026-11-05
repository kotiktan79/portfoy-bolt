import { describe, it, expect } from 'vitest';
import { investmentSchedule } from './investmentSchedule';
const buys = [{ date: '2026-10-22', amountEUR: 1000 }, { date: '2026-10-26', amountEUR: 1000 }, { date: '2026-11-02', amountEUR: 1000 }, { date: '2026-10-14', amountEUR: 129 }];
describe('investmentSchedule', () => {
  it('bugünkü durum', () => {
    const s = investmentSchedule(25500.998, buys, '2026-11-05');
    expect(s.deployedEUR).toBe(3000);
    expect(s.remainingEUR).toBeCloseTo(18500.998, 2);
    expect(s.pct).toBeCloseTo(13.95, 1);
    expect(s.weeksLeft).toBe(19);
    expect(s.finishDate).toBe('2027-03-15');
  });
  it('yedeğin altında kalan yok', () => {
    const s = investmentSchedule(6000, [], '2026-11-05');
    expect(s.remainingEUR).toBe(0); expect(s.finishDate).toBeNull();
  });
  it('alım aksarsa bitiş bugünden ileri kayar', () => {
    const s = investmentSchedule(9000, [{ date: '2026-10-22', amountEUR: 1000 }], '2026-12-01');
    expect(s.finishDate).toBe('2026-12-08');
  });
});
