import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Holding } from '../lib/supabase';
import { BuyPlanCard } from './BuyPlanCard';
import { DailyActionPlan } from './DailyActionPlan';

vi.mock('../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../lib/supabase')>('../lib/supabase');
  return {
    ...actual,
    supabase: {
      auth: { getSession: async () => ({ data: { session: null } }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    },
  };
});

function H(o: Partial<Holding> & { symbol: string; asset_type: Holding['asset_type'] }): Holding {
  return {
    id: o.symbol,
    quantity: 1,
    purchase_price: 1,
    current_price: 1,
    currency: 'TRY',
    created_at: '2026-01-01',
    updated_at: '2026-10-27',
    ...o,
  } as Holding;
}

// EUR nakit 20.000 − 7.000 = 13.000 → 13 hafta. VWCE €125 → €1.000 ≈ 8 adet.
// XEON payı güvenli tarafı %14 üstünde tutar; bu hafta VWCE.
const holdings: Holding[] = [
  H({ symbol: 'EURO', asset_type: 'currency', currency: 'TRY', quantity: 20_000, current_price: 50 }),
  H({ symbol: 'VWCE', asset_type: 'stock', currency: 'EUR', quantity: 10, current_price: 125 }),
  H({ symbol: 'XEON', asset_type: 'money_market', currency: 'EUR', quantity: 30, current_price: 150 }),
];

describe('haftalık plan her iki ekranda aynı', () => {
  it('Plan sekmesi €1.000 VWCE, adet, kalan nakit ve haftayı yazar', () => {
    render(<BuyPlanCard holdings={holdings} />);
    expect(screen.getByText(/Bu hafta €1\.000, tamamı VWCE/)).toBeTruthy();
    expect(screen.getByText(/yaklaşık 8 adet/)).toBeTruthy();
    expect(screen.getByText(/€7\.000 kenarda kalır/)).toBeTruthy();
    expect(screen.getByText(/Yatırılacak €13\.000/)).toBeTruthy();
    expect(screen.getByText(/yaklaşık 13 hafta/)).toBeTruthy();
    expect(screen.queryByText(/%76/)).toBeNull();
    expect(screen.queryByText(/31 Mart 2027/)).toBeNull();
  });

  it('Günaydın kartı aynı rakamları yazar', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, headers: { get: () => '' } })));
    render(
      <MemoryRouter>
        <DailyActionPlan holdings={holdings} totalValue={0} totalInvestment={0} totalProfitLoss={0} totalProfitLossPercent={0} totalCashValue={0} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Haftalık €1\.000 · tamamı VWCE · €7\.000 EUR nakit kenarda/)).toBeTruthy();
    expect(screen.getByText(/Bu hafta €1\.000, tamamı VWCE/)).toBeTruthy();
    expect(screen.getByText(/yaklaşık 8 adet/)).toBeTruthy();
    expect(screen.getByText(/Yatırılacak €13\.000/)).toBeTruthy();
    expect(screen.queryByText(/V3YL %16/)).toBeNull();
  });
});
