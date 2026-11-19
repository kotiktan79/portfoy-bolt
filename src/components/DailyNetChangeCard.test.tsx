import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { DailyNetChangeCard } from './DailyNetAndSchedule';
import { dailyBreakdown } from '../lib/dailyBreakdown';
import { salaryHoldings } from '../test/helpers/salaryFixture';

vi.mock('../services/eurPnlService', () => ({ getDailyBreakdownFlowEUR: vi.fn().mockResolvedValue(0) }));
import { getDailyBreakdownFlowEUR } from '../services/eurPnlService';

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
  it.each([1000, -1000, 1, -1, 0.99, -0.99, 0])('akış satırı yalnız |flowEUR| ≥ 1 ise görünür: %s', async flow => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T10:00:00Z'));
    vi.mocked(loadDailyChangeBasis).mockResolvedValue({ ...basis, report: null });
    vi.mocked(getDailyBreakdownFlowEUR).mockResolvedValueOnce(flow);
    render(<DailyNetChangeCard holdings={salaryHoldings} />);
    await screen.findByText('Nereden geldi? (canlı)');
    const label = screen.queryByText('Yeni alım / kasadan aktarım (kâr değil)');
    if (Math.abs(flow) >= 1) {
      expect(label).toBeInTheDocument();
      expect(label?.parentElement?.textContent).toContain(`${flow >= 0 ? '+' : '−'}€${Math.abs(flow).toLocaleString('tr-TR')}`);
    } else expect(label).toBeNull();
    expect(screen.queryByText(/defter uyuşmuyor/i)).toBeNull();
  });
  it.each(['null', 'error'] as const)('akış %s olduğunda döküm ve eski fark korunur', async outcome => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T10:00:00Z'));
    vi.mocked(loadDailyChangeBasis).mockResolvedValue({ ...basis, report: null });
    if (outcome === 'null') vi.mocked(getDailyBreakdownFlowEUR).mockResolvedValueOnce(null);
    else vi.mocked(getDailyBreakdownFlowEUR).mockRejectedValueOnce(new Error('offline'));
    render(<DailyNetChangeCard holdings={salaryHoldings} />);
    expect(await screen.findByText('Nereden geldi? (canlı)')).toBeInTheDocument();
    expect(screen.queryByText('Yeni alım / kasadan aktarım (kâr değil)')).toBeNull();
    const old = dailyBreakdown(salaryHoldings, {}, basis.snap.v, basis.snap.eurRate)!;
    const formatted = (value: number) => `${value >= 0 ? '+' : '−'}€${Math.round(Math.abs(value)).toLocaleString('tr-TR')}`;
    expect(screen.getByText('Fark (kayıt/fiyat zamanı)').parentElement?.textContent).toContain(formatted(old.gapEUR));
    expect(screen.getByText('Toplam').parentElement?.textContent).toContain(formatted(old.totalEUR));
  });
  it('resmi kapanışta da snapshot varsa akışı hesaplar ve dökümü gösterir', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-09T19:00:00Z'));
    vi.mocked(loadDailyChangeBasis).mockResolvedValue(basis);
    vi.mocked(getDailyBreakdownFlowEUR).mockClear().mockResolvedValueOnce(1000);
    render(<DailyNetChangeCard holdings={salaryHoldings} />);
    expect(await screen.findByText('Yeni alım / kasadan aktarım (kâr değil)')).toBeInTheDocument();
    expect(getDailyBreakdownFlowEUR).toHaveBeenCalledWith(salaryHoldings, basis.snap.at);
    expect(screen.getByText('Nereden geldi? (canlı)')).toBeInTheDocument();
    expect(screen.getByText('−€372,87')).toBeInTheDocument();
  });
  it('dakikalık yenileme beklerken veya hata verince önceki tutar ve DOM korunur', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-09T19:00:00Z'));
    let resolve!: (value: typeof basis) => void;
    const pending = new Promise<typeof basis>(r => { resolve = r; });
    vi.mocked(loadDailyChangeBasis).mockReset().mockResolvedValueOnce(basis).mockReturnValueOnce(pending).mockRejectedValueOnce(new Error('offline'));
    const { rerender } = render(<DailyNetChangeCard holdings={salaryHoldings} />);
    await act(async () => {});
    const amount = screen.getByText('−€372,87');
    rerender(<DailyNetChangeCard holdings={salaryHoldings.map(h => ({ ...h, current_price: h.current_price + 1 }))} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
    expect(loadDailyChangeBasis).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText('−€372,87')).toBe(amount);
    expect(screen.queryByText('hesaplanıyor…')).toBeNull();
    await act(async () => { resolve(structuredClone(basis)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByText('−€372,87')).toBe(amount);
    expect(screen.queryByText('Günlük değişim okunamadı.')).toBeNull();
  });

});
