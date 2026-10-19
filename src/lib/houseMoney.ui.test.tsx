import { describe, expect, it } from 'vitest';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
import { render, screen } from '@testing-library/react';
import { AssetAllocationPage } from '../components/AssetAllocationPage';
import { RebalancePlan } from '../components/RebalancePlan';
import type { Holding } from './supabase';

function H(o: Partial<Holding> & { symbol: string; asset_type: Holding['asset_type'] }): Holding {
  return {
    id: o.symbol,
    quantity: 1,
    purchase_price: 1,
    current_price: 1,
    currency: 'TRY',
    created_at: '2026-01-01',
    updated_at: '2026-10-19',
    ...o,
  } as Holding;
}

const holdings: Holding[] = [
  H({ symbol: 'EURO', asset_type: 'currency', quantity: 1, current_price: 50 }),
  H({ symbol: 'GPA', asset_type: 'fund', quantity: 100, current_price: 90 }),
  H({ symbol: 'GPY1PPF', asset_type: 'fund', quantity: 1000, current_price: 0.142216, price_notes: 'Ev Parası' }),
  H({ symbol: 'Ev Parası', asset_type: 'cash', quantity: 10_000, current_price: 1 }),
];

describe('Ev Parası ekranda ayrı durur', () => {
  it('dağılım sayfası GPA fonunu tutar, Ev Parası tutarını ayrı yazar', () => {
    render(<AssetAllocationPage holdings={holdings} onBack={() => {}} />);
    expect(screen.getByText(/Ev Parası ₺10\.142 · €203 — hedef ve dengeleme dışı/)).toBeInTheDocument();
    expect(screen.getByText('Toplam değer (TL, kasa ve Ev Parası hariç)')).toBeInTheDocument();
    expect(screen.getAllByText('₺9.050').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fon').length).toBeGreaterThan(0);
    expect(screen.queryByText('GPY1PPF')).not.toBeInTheDocument();
  });

  it('dengeleme kartı Ev Parası tutarını hedef paydasının dışında gösterir', () => {
    render(<RebalancePlan holdings={holdings} totalCashValue={0} />);
    expect(screen.getByText(/kasa ve Ev Parası hariç/)).toBeInTheDocument();
    expect(screen.getByText(/Ev Parası €203 ayrıdır/)).toBeInTheDocument();
  });
});
