import { beforeEach, describe, expect, it, vi } from 'vitest';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock('../services/eurPnlService', () => ({
  getEurDaily: () => Promise.resolve([{ date: '2026-10-23', wealthEUR: 148_249 }]),
}));

vi.mock('../services/kasaFxService', () => ({
  getKasaFx: () => Promise.resolve({ totalEurNow: 29_400 }),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MONTHLY_CAP_EUR } from '../lib/eurPnl';
import { SALARY_FLOOR_EUR } from '../lib/salaryPlan';
import { fixedRealWithdrawalYears, PLANNED_NOMINAL_RETURN_PCT, PLANNED_WITHDRAWAL_PCT, roughYearsPhrase, salaryProgressPct } from '../lib/salaryGoal';
import FireProjection from './FireProjection';

const RESOURCES = 148_249 + 29_400;
const eur = (n: number) => `€${Math.round(n).toLocaleString('de-DE')}`;

describe('Hedef aylık maaş', () => {
  beforeEach(() => {
    localStorage.removeItem('tandor_fire_external_income_eur');
    localStorage.removeItem('tandor_fire_inputs_eur');
  });

  it('birincil hedef €700 maaş; çekim %5 planlanan, €1.000 iyi yıl', async () => {
    render(<FireProjection />);
    expect(PLANNED_WITHDRAWAL_PCT).toBe(5);
    expect(SALARY_FLOOR_EUR).toBe(700);
    expect(MONTHLY_CAP_EUR).toBe(1_000);
    expect(screen.getByLabelText(/Aylık maaş hedefi/)).toHaveValue(700);
    expect(screen.getByLabelText(/İyi yıl tavanı/)).toHaveValue(1_000);
    expect(screen.getByLabelText(/Güvenli çekim \(SWR\)/)).toHaveValue(5);
    expect(screen.getByLabelText(/^Yıllık getiri/)).toHaveValue(PLANNED_NOMINAL_RETURN_PCT);
    expect(screen.getByRole('button', { name: 'Planlanan %5', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Muhafazakâr %4', pressed: false })).toBeInTheDocument();
    expect(screen.getAllByText('Sermaye hedefi (portföy, bugünkü €)').length).toBeGreaterThan(0);
    expect(screen.getByText('€700 için gerekli sermaye')).toBeInTheDocument();
    expect(screen.getByText('€1.000 iyi yıl için gerekli sermaye')).toBeInTheDocument();
    expect(screen.getAllByText('€168.000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€240.000').length).toBeGreaterThan(0);
    expect(screen.queryByText('€300.000')).not.toBeInTheDocument();

    const details = screen.getByText(/Dış gelir \(beklenen, hedefe dahil değil\)/).closest('details');
    expect(details).toBeTruthy();
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByDisplayValue('Çiftlik (bal, aronya, alıç, APIA)').closest('details')).toBe(details);

    const sustainable = Math.round(RESOURCES * 0.05 / 12);
    expect(sustainable).toBe(740);
    const progress = Math.max(0, salaryProgressPct(RESOURCES * 0.05 / 12, 700)).toFixed(0);
    expect(progress).toBe('106');
    const years = fixedRealWithdrawalYears(RESOURCES, 1_000, PLANNED_NOMINAL_RETURN_PCT - 3);
    expect(roughYearsPhrase(years)).toBe('yaklaşık 20,7 yıl');

    await waitFor(() => {
      expect(screen.getByText(`Bugünkü sermaye ile sürdürülebilir maaş: ${eur(sustainable)}/ay`)).toBeInTheDocument();
      expect(screen.getByText('€700 maaş sürdürülebilir')).toBeInTheDocument();
      expect(screen.getByText('€700 hedefine ilerleme %106')).toBeInTheDocument();
      expect(screen.getByText(/Portföy €148\.249 \+ kasa €29\.400/, { selector: 'p' })).toBeInTheDocument();
      expect(screen.getByText(/Sabit €1\.000\/ay, bugünkü sermayeden \(portföy \+ kasa\) yaklaşık 20,7 yıl sürer/, { selector: 'p' })).toBeInTheDocument();
      expect(screen.getByText(/yıllık getiri %6,5 − enflasyon %3 = reel %3,5/, { selector: 'p' })).toBeInTheDocument();
      expect(screen.getByText('Portföy + kasa yetiyor. Grafik yalnız portföyü büyütür.')).toBeInTheDocument();
    });
  });

  it('çiftlik aktif olunca grafik düşer; maaş kartı €168 bin olarak kalır', async () => {
    const user = userEvent.setup();
    render(<FireProjection />);
    await user.click(screen.getByText(/Dış gelir \(beklenen, hedefe dahil değil\)/));
    expect(screen.getByDisplayValue('Çiftlik (bal, aronya, alıç, APIA)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ev kirası')).toBeInTheDocument();
    const statuses = screen.getAllByRole('combobox').filter(el => (el as HTMLSelectElement).value === 'beklenen');
    expect(statuses).toHaveLength(2);
    await user.selectOptions(statuses[0], 'aktif');
    expect(screen.getByText('Sermaye hedefi (yalnız aktif, bugünkü €)')).toBeInTheDocument();
    expect(screen.getAllByText('€68.000').length).toBeGreaterThan(0);
    expect(screen.getByText('€700 için gerekli sermaye')).toBeInTheDocument();
    expect(screen.getAllByText('€168.000').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Tüm dış gelirle/ }));
    expect(screen.getByText('Sermaye hedefi (tüm dış gelir, bugünkü €)')).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem('tandor_fire_external_income_eur') || '{}');
    expect(saved.scenario).toBe('tumu');
    expect(saved.sources.find((s: { id: string }) => s.id === 'ciftlik').status).toBe('aktif');
    expect(saved.sources.find((s: { id: string }) => s.id === 'kira').status).toBe('beklenen');
  });

  it('muhafazakâr %4 sermayeyi yeniler ve tarayıcı kaydına yazılır', async () => {
    const user = userEvent.setup();
    render(<FireProjection />);
    await user.click(screen.getByRole('button', { name: 'Muhafazakâr %4' }));
    expect(screen.getByLabelText(/Güvenli çekim \(SWR\)/)).toHaveValue(4);
    expect(screen.getAllByText('€210.000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€300.000').length).toBeGreaterThan(0);
    const saved = JSON.parse(localStorage.getItem('tandor_fire_inputs_eur') || '{}');
    expect(saved.safeWithdrawalRatePct).toBe(4);
    expect(saved.targetMonthlyIncome).toBe(700);
    expect(saved.goodYearMonthlyEUR).toBe(1_000);
    expect(saved.annualReturnPct).toBe(PLANNED_NOMINAL_RETURN_PCT);
    expect(saved.inputsVersion).toBe(3);
    expect(saved.annualInflationPct).toBeUndefined();

    await waitFor(() => {
      expect(screen.getByText('€700 maaş kısa geliyor')).toBeInTheDocument();
    });
  });

  it('iyi yıl 0 ise tavan ve süre notu gizlenir', () => {
    render(<FireProjection />);
    fireEvent.change(screen.getByLabelText(/İyi yıl tavanı/), { target: { value: '0' } });
    expect(screen.queryByText(/iyi yıl için gerekli sermaye/)).not.toBeInTheDocument();
    expect(screen.queryByText(/yaklaşık \d/)).not.toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem('tandor_fire_inputs_eur') || '{}');
    expect(saved.goodYearMonthlyEUR).toBe(0);
  });

  it('getiri değişince süre notunun varsayımı değişir', async () => {
    render(<FireProjection />);
    fireEvent.change(screen.getByLabelText(/^Yıllık getiri/), { target: { value: '8' } });
    await waitFor(() => {
      expect(screen.getByText(/yıllık getiri %8 − enflasyon %3 = reel %5/, { selector: 'p' })).toBeInTheDocument();
    });
    expect(screen.queryByText(/yıllık getiri %6,5/)).not.toBeInTheDocument();
  });

  it('eski varsayılan €1.000 ve %4 bir kez tabana ve %5e alınır', async () => {
    localStorage.setItem('tandor_fire_inputs_eur', JSON.stringify({
      monthlyContribution: 0,
      annualReturnPct: 6,
      targetMonthlyIncome: 1_000,
      safeWithdrawalRatePct: 4,
    }));
    render(<FireProjection />);
    expect(screen.getByLabelText(/Aylık maaş hedefi/)).toHaveValue(700);
    expect(screen.getByLabelText(/Güvenli çekim \(SWR\)/)).toHaveValue(5);
    expect(screen.getByLabelText(/İyi yıl tavanı/)).toHaveValue(1_000);
    expect(screen.getByLabelText(/^Yıllık getiri/)).toHaveValue(6);
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('tandor_fire_inputs_eur') || '{}');
      expect(saved.inputsVersion).toBe(3);
      expect(saved.targetMonthlyIncome).toBe(700);
      expect(saved.safeWithdrawalRatePct).toBe(5);
      expect(saved.annualReturnPct).toBe(6);
      expect(saved.annualInflationPct).toBeUndefined();
    });
  });

  it('eski varsayılan getiri %4 plana çekilir; başka getiri ve sürüm 3 durur', async () => {
    localStorage.setItem('tandor_fire_inputs_eur', JSON.stringify({
      targetMonthlyIncome: 850,
      safeWithdrawalRatePct: 3.5,
      annualReturnPct: 4,
      monthlyContribution: 0,
    }));
    const first = render(<FireProjection />);
    expect(screen.getByLabelText(/Aylık maaş hedefi/)).toHaveValue(850);
    expect(screen.getByLabelText(/Güvenli çekim \(SWR\)/)).toHaveValue(3.5);
    expect(screen.getByLabelText(/^Yıllık getiri/)).toHaveValue(6.5);
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('tandor_fire_inputs_eur') || '{}');
      expect(saved.inputsVersion).toBe(3);
      expect(saved.annualReturnPct).toBe(6.5);
      expect(saved.targetMonthlyIncome).toBe(850);
      expect(saved.safeWithdrawalRatePct).toBe(3.5);
    });
    first.unmount();

    localStorage.setItem('tandor_fire_inputs_eur', JSON.stringify({
      inputsVersion: 2,
      targetMonthlyIncome: 1_000,
      goodYearMonthlyEUR: 1_200,
      safeWithdrawalRatePct: 4,
      annualReturnPct: 8,
      monthlyContribution: 0,
    }));
    const second = render(<FireProjection />);
    expect(screen.getByLabelText(/Aylık maaş hedefi/)).toHaveValue(1_000);
    expect(screen.getByLabelText(/İyi yıl tavanı/)).toHaveValue(1_200);
    expect(screen.getByLabelText(/Güvenli çekim \(SWR\)/)).toHaveValue(4);
    expect(screen.getByLabelText(/^Yıllık getiri/)).toHaveValue(8);
    second.unmount();

    localStorage.setItem('tandor_fire_inputs_eur', JSON.stringify({
      inputsVersion: 2,
      targetMonthlyIncome: 1_000,
      goodYearMonthlyEUR: 1_200,
      safeWithdrawalRatePct: 4,
      annualReturnPct: 4,
      monthlyContribution: 0,
    }));
    const third = render(<FireProjection />);
    expect(screen.getByLabelText(/Aylık maaş hedefi/)).toHaveValue(1_000);
    expect(screen.getByLabelText(/Güvenli çekim \(SWR\)/)).toHaveValue(4);
    expect(screen.getByLabelText(/^Yıllık getiri/)).toHaveValue(6.5);
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('tandor_fire_inputs_eur') || '{}');
      expect(saved.inputsVersion).toBe(3);
      expect(saved.annualReturnPct).toBe(6.5);
      expect(saved.targetMonthlyIncome).toBe(1_000);
      expect(saved.safeWithdrawalRatePct).toBe(4);
    });
    third.unmount();

    localStorage.setItem('tandor_fire_inputs_eur', JSON.stringify({
      inputsVersion: 3,
      targetMonthlyIncome: 1_000,
      goodYearMonthlyEUR: 1_200,
      safeWithdrawalRatePct: 4,
      annualReturnPct: 4,
      monthlyContribution: 0,
    }));
    render(<FireProjection />);
    expect(screen.getByLabelText(/^Yıllık getiri/)).toHaveValue(4);
    expect(screen.getByLabelText(/Aylık maaş hedefi/)).toHaveValue(1_000);
    expect(screen.getByLabelText(/Güvenli çekim \(SWR\)/)).toHaveValue(4);
  });
});
