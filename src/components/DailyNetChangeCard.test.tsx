import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DailyNetChangeCard } from './DailyNetAndSchedule';
import { salaryHoldings } from '../test/helpers/salaryFixture';

vi.mock('../services/dailyNetChangeService', () => ({ loadDailyChangeBasis: vi.fn() }));
import { loadDailyChangeBasis } from '../services/dailyNetChangeService';
const basis = { report: { report_date: '2026-11-09', pnl_eur_day: -372.87, wealth_eur: 10000 },
  snap: { v: 500000, d: '2026-11-08', at: '2026-11-08T18:00:00Z', eurRate: 50 }, prevPrices: [] };
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('günlük net değişim kaynağı', () => {
  it('kapanmış günde fiyat/kur farkı yerine resmi -372,87 gösterir', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-09T19:00:00Z'));
    vi.mocked(loadDailyChangeBasis).mockResolvedValue(basis);
    render(<DailyNetChangeCard holdings={salaryHoldings.map(h => h.symbol === 'EURO' ? { ...h, current_price: 53 } : h)} />);
    expect(await screen.findByText('−€372,87')).toBeInTheDocument();
    expect(screen.getByText(/resmi kapanış/)).toBeInTheDocument();
    expect(screen.queryByText(/Tahmini/)).toBeNull();
  });
  it('açık günde kendi günlerinin kuru kullanılır ve tahmini etiketi vardır', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T10:00:00Z'));
    vi.mocked(loadDailyChangeBasis).mockResolvedValue({ ...basis, report: null });
    const holdings = [{ ...salaryHoldings[0], quantity: 10000, current_price: 53 }];
    render(<DailyNetChangeCard holdings={holdings} />);
    expect(await screen.findByText('+€0,00')).toBeInTheDocument();
    expect(screen.getByText(/Tahmini/)).toBeInTheDocument();
  });
});
