import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Holding } from '../lib/supabase';
import { computeKasaFx } from '../services/kasaFxService';
import { CashDistributionCard } from './CashDistributionCard';

vi.mock('../services/kasaFxService', async () => {
  const actual = await vi.importActual<typeof import('../services/kasaFxService')>('../services/kasaFxService');
  return { ...actual, getKasaFx: vi.fn() };
});

import { getKasaFx } from '../services/kasaFxService';

function H(o: Partial<Holding> & { symbol: string; asset_type: Holding['asset_type'] }): Holding {
  return {
    id: o.symbol,
    quantity: 0,
    purchase_price: 1,
    current_price: 1,
    currency: 'TRY',
    created_at: '2026-01-01',
    updated_at: '2026-10-27',
    ...o,
  } as Holding;
}

const EUR_TRY = 50;
const USD_TRY = EUR_TRY * 30_411 / 34_000;
const RUB_TRY = EUR_TRY * 5_530 / 500_000;

const holdings: Holding[] = [
  H({ symbol: 'EURO', asset_type: 'currency', quantity: 26_501, current_price: EUR_TRY }),
  H({ symbol: 'USD', asset_type: 'currency', quantity: 34_000, current_price: USD_TRY }),
  H({ symbol: 'VWCE', asset_type: 'stock', quantity: 8, current_price: 130, currency: 'EUR' }),
  H({ symbol: 'TRY', asset_type: 'currency', quantity: 38_292, current_price: 1, house_money: true }),
  H({ symbol: 'GPY1PPF', asset_type: 'fund', quantity: 1_000, current_price: 1.5, house_money: true }),
];

function kasaNow() {
  return computeKasaFx([
    { currency: 'USD', balance: 11_606 },
    { currency: 'RUB', balance: 500_000 },
    { currency: 'GBP', balance: 0 },
    { currency: 'EUR', balance: 0 },
  ], [
    { day: '2026-10-27', from_currency: 'EUR', rate: EUR_TRY },
    { day: '2026-10-27', from_currency: 'USD', rate: USD_TRY },
    { day: '2026-10-27', from_currency: 'RUB', rate: RUB_TRY },
  ]);
}

describe('Nakit Dağılımı kartı', () => {
  it('panoda para, yer, tutar ve euro karşılığını gösterir', async () => {
    vi.mocked(getKasaFx).mockResolvedValue(kasaNow());
    render(<CashDistributionCard holdings={holdings} />);

    const card = await screen.findByRole('region', { name: 'Nakit Dağılımı' });
    expect(card.className).not.toMatch(/\bhidden\b/);
    expect(screen.getByRole('columnheader', { name: 'Para' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Nerede' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Tutar' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Euro karşılığı' })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('€72.823')).toBeInTheDocument());
    expect(screen.getByText('Dolar %56, Euro %36, Ruble %8')).toBeInTheDocument();
    expect(screen.getByText('Euro nakitten €7.000 kenarda; kalan ~€19.501 haftada €1.000 VWCE\'ye gidiyor (~20 hafta)')).toBeInTheDocument();
    expect(screen.getByText('Ev Parası (Türkiye) ₺39.792 · €796 — toplama dahil değil')).toBeInTheDocument();
    expect(screen.getAllByText('Portföy').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Kasa').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('$34.000')).toBeInTheDocument();
    expect(screen.getByText('₽500.000')).toBeInTheDocument();
    expect(screen.queryByText('GPY1PPF')).not.toBeInTheDocument();
    expect(screen.queryByText('VWCE')).not.toBeInTheDocument();
    expect(screen.queryByText('Sterlin')).not.toBeInTheDocument();
  });

  it('kasa gelmezse uyarı verir, ev parası yine ayrı durur', async () => {
    vi.mocked(getKasaFx).mockResolvedValue(null);
    render(<CashDistributionCard holdings={holdings} />);
    expect(await screen.findByText(/Kasa bakiyesi veya kur yok/)).toBeInTheDocument();
    expect(screen.getByText('€56.912')).toBeInTheDocument();
    expect(screen.getByText(/Ev Parası \(Türkiye\)/)).toBeInTheDocument();
    expect(screen.queryByText('Ruble')).not.toBeInTheDocument();
  });
});
