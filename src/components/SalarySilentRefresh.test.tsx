import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuAyMaasCard } from './BuAyMaasCard';
import KarCuzdani from './KarCuzdani';
import { loadMonthSalaryInputs } from '../services/monthSalaryCardService';
import { loadWalletView } from '../services/walletViewService';
import { salaryHoldings, salaryRule } from '../test/helpers/salaryFixture';
import { parseSalaryRule, planSpendDown } from '../lib/spendDownSalary';

vi.mock('../services/monthSalaryCardService', () => ({ loadMonthSalaryInputs: vi.fn() }));
vi.mock('../services/walletViewService', () => ({ loadWalletView: vi.fn() }));
const config = parseSalaryRule({ salary_rule: salaryRule });
const plan = planSpendDown({ year: 2028, portfolioEUR: 100000, kasaEUR: 16000, config });
const inputs = { asOfMonth: '2028-01', poolEUR: 0, realGainEUR: 0, kasaEUR: 16000, spendDown: plan };
const wallet = {
  salary: { spendDown: plan, salaryRule: config, entitlementEUR: 400, month: '2028-01', monthLabel: 'Ocak 2028',
    profitEUR: 0, inflationEUR: 0, realGainEUR: 0, carryInEUR: 0, withdrawableEUR: 0, salaryEUR: 400, startWealthEUR: 100000, endWealthEUR: 100000 }, accrual: null, mtd: null,
  withdrawals: [], policy: { salaryStartMonth: '2027-04' }, ruleCfg: config, inflationAnnual: .03,
  kasaMoves: [], eurRates: [{ day: '2028-01-10', rate: 50 }], usdRates: [{ day: '2028-01-10', rate: 45 }], kasa: null,
} as Awaited<ReturnType<typeof loadWalletView>>;
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2028-01-10T12:00:00Z')); vi.resetAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('maaş ekranları sessiz yenilenir', () => {
  it('ay kartı holdings değişince veya 60 saniye tick sırasında tutarı gizlemez', async () => {
    const next = pending<typeof inputs>();
    vi.mocked(loadMonthSalaryInputs).mockResolvedValueOnce(inputs).mockReturnValueOnce(next.promise);
    const { rerender } = render(<BuAyMaasCard holdings={salaryHoldings} />);
    await act(async () => {});
    const amount = screen.getByText('2028 maaşı: €400/ay');
    rerender(<BuAyMaasCard holdings={salaryHoldings.map(h => ({ ...h, current_price: h.current_price + 1 }))} />);
    expect(loadMonthSalaryInputs).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(loadMonthSalaryInputs).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Maaş bakılıyor…')).toBeNull();
    expect(screen.getByText('2028 maaşı: €400/ay')).toBe(amount);
    await act(async () => { next.resolve({ ...inputs, spendDown: { ...plan, monthlyEUR: 450, fromPortfolioEUR: 450, fromKasaEUR: 0 } }); });
    expect(screen.getByText('2028 maaşı: €450/ay')).toBe(amount);
  });

  it('cüzdan yeniden yüklenirken aynı form, odak ve girilmiş tutar ekranda kalır; hata veriyi silmez', async () => {
    const next = pending<typeof wallet>();
    vi.mocked(loadWalletView).mockResolvedValueOnce(wallet).mockReturnValueOnce(next.promise).mockRejectedValueOnce(new Error('offline'));
    const { rerender } = render(<KarCuzdani holdings={salaryHoldings} />);
    await act(async () => {});
    const rule = screen.getByTestId('harca-bitir');
    const amount = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(amount, { target: { value: '123' } }); amount.focus();
    const inflation = screen.getByRole('textbox');
    fireEvent.change(inflation, { target: { value: '4' } });
    rerender(<KarCuzdani holdings={salaryHoldings.map(h => ({ ...h, updated_at: '2028-01-10T12:00:30Z' }))} />);
    expect(loadWalletView).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.queryByText('Cüzdan yükleniyor...')).toBeNull();
    expect(screen.getByTestId('harca-bitir')).toBe(rule);
    expect(amount).toHaveValue(123); expect(amount).toHaveFocus();
    await act(async () => { next.resolve(structuredClone(wallet)); });
    expect(screen.getByRole('spinbutton')).toBe(amount);
    expect(inflation).toHaveValue('4');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.queryByText('Maaş verisi yüklenemedi')).toBeNull();
    expect(within(rule).getAllByText(/€400/).length).toBeGreaterThan(0);
    expect(amount).toHaveValue(123);
  });
});
