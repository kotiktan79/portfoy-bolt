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

  it('tüm gelir ≈ €97 bin, yalnız aktif €200 bin; ilerleme portföy + kasa', async () => {
    render(<FireProjection />);
    expect(screen.getByText(/Tüm dış gelirle/)).toBeInTheDocument();
    expect(screen.getByText(/Yalnız aktif gelirle/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Çiftlik (bal, aronya, alıç, APIA)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ev kirası')).toBeInTheDocument();
    expect(screen.getAllByText('€97.143').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€200.000').length).toBeGreaterThan(0);
    expect(screen.getByText(/Dış gelir yokken aynı SWR ile €342\.857/)).toBeInTheDocument();

    const resources = 148_249 + 29_400;
    const allPct = Math.round(resources / (3_400 / 0.035) * 100);
    await waitFor(() => {
      expect(screen.getByText(new RegExp(`ilerleme %${allPct} · \\(12 × €1\\.000 − €8\\.600\\) / %3\\.5 · aktif \\+ beklenen`))).toBeInTheDocument();
    });
  });

  it('seçilen senaryo ilerleme kartını değiştirir ve kaydeder', async () => {
    const user = userEvent.setup();
    render(<FireProjection />);
    await user.click(screen.getByRole('button', { name: /Yalnız aktif gelirle/ }));
    expect(screen.getByText('Reel hedef (yalnız aktif, bugünkü €)')).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem('tandor_fire_external_income_eur') || '{}');
    expect(saved.scenario).toBe('aktif');
  });
});
