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
    expect(screen.queryByRole('heading', { name: 'Romanya Ev Tadilatı' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Romanya ev tadilat toplamı' })).not.toBeInTheDocument();
    expect(screen.queryByText('≈ €32.470')).not.toBeInTheDocument();
    expect(screen.getAllByText('₺9.050').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fon').length).toBeGreaterThan(0);
    expect(screen.queryByText('GPY1PPF')).not.toBeInTheDocument();
  });

  it('adet 0 ve eski cost_basis dağılım toplamına girmez', () => {
    const rows = [
      ...holdings,
      H({ symbol: 'EKGYO', asset_type: 'stock', quantity: 0, purchase_price: 14, current_price: 20, cost_basis: 60_000 }),
      H({ symbol: 'US900123CJ75', asset_type: 'eurobond', quantity: 0, purchase_price: 37_500, current_price: 42_000, cost_basis: 75_000 }),
    ];
    render(<AssetAllocationPage holdings={rows} onBack={() => {}} />);
    expect(screen.queryByText('EKGYO')).not.toBeInTheDocument();
    expect(screen.queryByText('US900123CJ75')).not.toBeInTheDocument();
    expect(screen.queryByText('₺75.000')).not.toBeInTheDocument();
    expect(screen.queryByText('₺60.000')).not.toBeInTheDocument();
    expect(screen.getAllByText('₺9.050').length).toBeGreaterThan(0);
  });

  it('dengeleme kartı Ev Parası tutarını hedef paydasının dışında gösterir', () => {
    render(<RebalancePlan holdings={holdings} totalCashValue={0} />);
    expect(screen.getByText(/kasa ve Ev Parası hariç/)).toBeInTheDocument();
    expect(screen.getByText(/Ev Parası €203 ayrıdır/)).toBeInTheDocument();
  });
});
