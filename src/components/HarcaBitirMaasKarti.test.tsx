import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HarcaBitirMaasKarti from './HarcaBitirMaasKarti';
import { parseSalaryRule, planSpendDown, expectedPath, pathMilestones } from '../lib/spendDownSalary';
import { buildMonthSalaryCard } from '../lib/monthSalaryCard';

const cfg = { ...parseSalaryRule({}), mode: 'spend_down' as const };
const plan = planSpendDown({ year: 2027, portfolioEUR: 137_142, kasaEUR: 16_000, config: cfg });
const path = pathMilestones(expectedPath({ startYear: 2027, portfolioEUR: 137_142, config: cfg }));

describe('HarcaBitirMaasKarti', () => {
  it('bu yılın maaşını, açıklamayı ve beklenen yolu gösterir', () => {
    render(<HarcaBitirMaasKarti mode="spend_down" config={cfg} plan={plan} path={path} preview startLabel="Nisan 2027"
      canFix={false} busy={false} message={null} onSwitchMode={() => {}} onFixYear={() => {}} />);
    expect(screen.getByText(/Ön izleme: maaş Nisan 2027/)).toBeTruthy();
    expect(screen.getByTestId('harca-bitir').textContent).toContain('€484');
    const ac = screen.getByTestId('harca-bitir-aciklama').textContent!;
    expect(ac).toContain('Kalan para: €137.142');
    expect(ac).toContain('Kalan yıl: 41');
    expect(ac).toContain('Hedef');
    const rows = screen.getByTestId('harca-bitir-yol').querySelectorAll('tbody tr');
    expect(rows.length).toBe(path.length);
    expect(rows[rows.length - 1].textContent).toContain('90');
    expect(rows[rows.length - 1].textContent).toContain('€30.000');
  });
  it('kâr modunda yalnız geçiş düğmesi ve karşılaştırma; tıklama üst bileşene gider', () => {
    const sw = vi.fn();
    render(<HarcaBitirMaasKarti mode="profit" config={{ ...cfg, mode: 'profit' }} plan={plan} path={path} preview startLabel="Nisan 2027"
      canFix={false} busy={false} message={null} onSwitchMode={sw} onFixYear={() => {}} />);
    expect(screen.queryByTestId('harca-bitir-yol')).toBeNull();
    expect(screen.getByText(/maaşın/).textContent).toContain('€484');
    fireEvent.click(screen.getByText('Harca-bitir kuralı'));
    expect(sw).toHaveBeenCalledWith('spend_down');
  });
});

describe('Bu Ay Maaşın — harca-bitir', () => {
  const base = { poolEUR: 0, realGainEUR: 0, kasaEUR: 16_000, salaryStartMonth: '2027-04' };
  it('başlamadan önce ön izleme', () => {
    const v = buildMonthSalaryCard({ ...base, asOfMonth: '2026-11', spendDown: { year: 2027, monthlyEUR: 484, fromPortfolioEUR: 484, fromKasaEUR: 0, fixed: false } });
    expect(v.state).toBe('not_started');
    expect(v.primary).toContain('€484');
    expect(v.rule).toContain('Harca-bitir');
  });
  it('başladıktan sonra çekilen düşülür; kasa parçası ayrı', () => {
    const v = buildMonthSalaryCard({ ...base, asOfMonth: '2031-05', withdrawnThisMonthEUR: 100, spendDown: { year: 2031, monthlyEUR: 400, fromPortfolioEUR: 350, fromKasaEUR: 50, fixed: true } });
    expect(v.state).toBe('open');
    expect(v.shownEUR).toBe(300);
    expect(v.sourceLine).toBe('Portföyden €250 + kasadan €50');
  });
});
