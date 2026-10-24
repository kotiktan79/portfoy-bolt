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
import FireProjection from './FireProjection';

describe('Hedef dış gelir senaryoları', () => {
  beforeEach(() => {
    localStorage.removeItem('tandor_fire_external_income_eur');
    localStorage.removeItem('tandor_fire_inputs_eur');
  });

  it('birincil hedef portföy €300 bin; dış gelir kapalı ve beklenen', async () => {
    render(<FireProjection />);
    expect(screen.getByLabelText(/Güvenli çekim \(SWR\)/)).toHaveValue(4);
    expect(screen.getByText('Reel hedef (portföy, bugünkü €)')).toBeInTheDocument();
    expect(screen.getAllByText('€300.000').length).toBeGreaterThan(0);
    const details = screen.getByText(/Dış gelir \(beklenen, hedefe dahil değil\)/).closest('details');
    expect(details).toBeTruthy();
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByDisplayValue('Çiftlik (bal, aronya, alıç, APIA)').closest('details')).toBe(details);

    const salary = Math.round((148_249 + 29_400) * 0.04 / 12);
    await waitFor(() => {
      expect(screen.getByText(`Bugünkü sermaye ile sürdürülebilir maaş: €${salary.toLocaleString('de-DE')}/ay`)).toBeInTheDocument();
    });
  });

  it('çiftlik aktif olunca hedef düşer; bölüm açılınca düzenlenir', async () => {
    const user = userEvent.setup();
    render(<FireProjection />);
    await user.click(screen.getByText(/Dış gelir \(beklenen, hedefe dahil değil\)/));
    expect(screen.getByDisplayValue('Çiftlik (bal, aronya, alıç, APIA)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ev kirası')).toBeInTheDocument();
    const statuses = screen.getAllByRole('combobox').filter(el => (el as HTMLSelectElement).value === 'beklenen');
    expect(statuses).toHaveLength(2);
    await user.selectOptions(statuses[0], 'aktif');
    expect(screen.getByText('Reel hedef (yalnız aktif, bugünkü €)')).toBeInTheDocument();
    expect(screen.getAllByText('€175.000').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Tüm dış gelirle/ }));
    expect(screen.getByText('Reel hedef (tüm dış gelir, bugünkü €)')).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem('tandor_fire_external_income_eur') || '{}');
    expect(saved.scenario).toBe('tumu');
    expect(saved.sources.find((s: { id: string }) => s.id === 'ciftlik').status).toBe('aktif');
    expect(saved.sources.find((s: { id: string }) => s.id === 'kira').status).toBe('beklenen');
  });

  it('SWR değişince sermaye yenilenir ve tarayıcı kaydına yazılır', () => {
    render(<FireProjection />);
    fireEvent.change(screen.getByLabelText(/Güvenli çekim \(SWR\)/), { target: { value: '5' } });
    expect(screen.getAllByText('€240.000').length).toBeGreaterThan(0);
    const saved = JSON.parse(localStorage.getItem('tandor_fire_inputs_eur') || '{}');
    expect(saved.safeWithdrawalRatePct).toBe(5);
    expect(saved.annualInflationPct).toBeUndefined();
  });
});
