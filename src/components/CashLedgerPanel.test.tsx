import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CashBalance } from '../lib/supabase';
import { CashLedgerPanel } from './CashLedgerPanel';

vi.mock('../services/cashConversionService', () => ({
  convertCash: vi.fn(),
  readCashLedger: vi.fn(),
}));

afterEach(cleanup);

const balances: CashBalance[] = [
  { id: 'EUR', user_id: 'fixture', currency: 'EUR', balance: 1000, total_deposits: 1200, total_withdrawals: 200, realized_profit: 0, updated_at: '' },
  // Defterde fark var; kullanıcıya yalnız bakiye gösterilmeli.
  { id: 'USD', user_id: 'fixture', currency: 'USD', balance: 850, total_deposits: 1000, total_withdrawals: 100, realized_profit: 0, updated_at: '' },
];

describe('CashLedgerPanel görünümü', () => {
  it('defter farkı olan dövizde de bakiyeyi gösterir, fark uyarısını göstermez', () => {
    render(<CashLedgerPanel initialBalances={balances} />);
    expect(screen.getByText('EUR: 1.000')).toBeInTheDocument();
    expect(screen.getByText('USD: 850')).toBeInTheDocument();
    expect(screen.queryByText(/defter uyuşmuyor|fark -50/i)).not.toBeInTheDocument();
  });

  it('Döviz çevir formu açılır ve mevcut alanları korunur', () => {
    render(<CashLedgerPanel initialBalances={balances} />);
    fireEvent.click(screen.getByText('Döviz çevir'));
    expect(screen.getByText('Döviz çevir').closest('details')).toHaveAttribute('open');
    expect(screen.getByLabelText('Çıkış dövizi')).toBeInTheDocument();
    expect(screen.getByLabelText('Çıkış tutarı')).toBeInTheDocument();
    expect(screen.getByLabelText('Giriş dövizi')).toBeInTheDocument();
    expect(screen.getByLabelText('Alınan tutar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Çevirmeyi kaydet' })).toBeEnabled();
  });
});
