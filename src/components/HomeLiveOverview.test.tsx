import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeLiveOverview } from './HomeLiveOverview';
import { getDynamicSalary, type DynamicSalary } from '../services/salaryService';
import { getLiveEurGain, getEurDaily } from '../services/eurPnlService';
import { salaryHoldings } from '../test/helpers/salaryFixture';
import type { Holding } from '../lib/supabase';

vi.mock('./HeroDashboard', () => ({ default: ({ dynamicSafeMaxUSD }: { dynamicSafeMaxUSD?: number }) => <output data-testid="salary">{dynamicSafeMaxUSD ?? 'yükleniyor'}</output> }));
vi.mock('./GununHareketleri', () => ({ default: () => null }));
vi.mock('./DailyNetAndSchedule', () => ({ DailyNetChangeCard: () => null, InvestmentScheduleCard: () => null }));
vi.mock('../services/salaryService', () => ({ getDynamicSalary: vi.fn() }));
vi.mock('../services/eurPnlService', () => ({ getLiveEurGain: vi.fn(), getEurDaily: vi.fn() }));
const dynamic = (value: number) => ({ entitlementEUR: value, monthLabel: 'Ocak', poolOutEUR: 0 } as DynamicSalary);
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Home yerel arka plan okumaları', () => {
  it('maaş/live tick Home parentını render etmez; sık prop değişimi 60 saniye sınırını aşmaz', async () => {
    let resolve!: (v: DynamicSalary) => void;
    const pending = new Promise<DynamicSalary>(r => { resolve = r; });
    vi.mocked(getDynamicSalary).mockResolvedValueOnce(dynamic(400)).mockReturnValueOnce(pending);
    vi.mocked(getLiveEurGain).mockResolvedValue({ gainEUR: 0, wealthEUR: 100000, totalValueTRY: 5000000, sinceDate: '2028-01-10' });
    vi.mocked(getEurDaily).mockResolvedValue([]);
    const parentRendered = vi.fn();
    function HomeHarness({ holdings }: { holdings: Holding[] }) { parentRendered(); return <HomeLiveOverview holdings={holdings} totalCashValue={0} />; }
    const { rerender } = render(<HomeHarness holdings={salaryHoldings} />);
    await act(async () => {});
    const amount = screen.getByTestId('salary');
    expect(amount).toHaveTextContent('400');
    const latest = salaryHoldings.map(h => ({ ...h, current_price: h.current_price + 1 }));
    rerender(<HomeHarness holdings={latest} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
    expect(getDynamicSalary).toHaveBeenCalledTimes(1);
    expect(getLiveEurGain).toHaveBeenCalledTimes(1);
    const parentCount = parentRendered.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(getLiveEurGain).toHaveBeenCalledTimes(2);
    expect(getDynamicSalary).toHaveBeenLastCalledWith(latest);
    expect(screen.getByTestId('salary')).toBe(amount);
    expect(amount).toHaveTextContent('400');
    await act(async () => { resolve(dynamic(450)); });
    expect(amount).toHaveTextContent('450');
    expect(parentRendered).toHaveBeenCalledTimes(parentCount);
  });
});
