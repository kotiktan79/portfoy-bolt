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

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FireProjection from './FireProjection';

describe('Hedef dış gelir senaryoları', () => {
  beforeEach(() => {
    localStorage.removeItem('tandor_fire_external_income_eur');
    localStorage.removeItem('tandor_fire_inputs_eur');
  });

  it('birincil senaryo yalnız aktif €200 bin; tüm gelir €97 bin karşılaştırmadır', async () => {
    render(<FireProjection />);
    expect(screen.getByText('Reel hedef (yalnız aktif, bugünkü €)')).toBeInTheDocument();
    expect(screen.getByText(/Yalnız aktif gelirle/)).toBeInTheDocument();
    expect(screen.getByText(/Tüm dış gelirle/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Çiftlik (bal, aronya, alıç, APIA)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ev kirası')).toBeInTheDocument();
    expect(screen.getAllByText('€97.143').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€200.000').length).toBeGreaterThan(0);
    expect(screen.getByText(/Dış gelir yokken aynı SWR ile €342\.857/)).toBeInTheDocument();

    const resources = 148_249 + 29_400;
    const activePct = Math.round(resources / (7_000 / 0.035) * 100);
    await waitFor(() => {
      expect(screen.getByText(new RegExp(`ilerleme %${activePct} · \\(12 × €1\\.000 − €5\\.000\\) / %3\\.5 · birincil`))).toBeInTheDocument();
    });
  });

  it('kira aktif olunca birincil senaryo onu da sayar; tüm gelir seçilince kaydedilir', async () => {
    const user = userEvent.setup();
    render(<FireProjection />);
    const statuses = screen.getAllByRole('combobox').filter(el => (el as HTMLSelectElement).value === 'beklenen' || (el as HTMLSelectElement).value === 'aktif');
    const rentStatus = statuses.find(el => (el as HTMLSelectElement).value === 'beklenen');
    expect(rentStatus).toBeTruthy();
    await user.selectOptions(rentStatus!, 'aktif');
    expect(screen.getAllByText('€97.143').length).toBeGreaterThan(1);
    expect(screen.queryByText('€200.000')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Tüm dış gelirle/ }));
    expect(screen.getByText('Reel hedef (tüm dış gelir, bugünkü €)')).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem('tandor_fire_external_income_eur') || '{}');
    expect(saved.scenario).toBe('tumu');
    expect(saved.sources.find((s: { id: string }) => s.id === 'kira').status).toBe('aktif');
  });
});
