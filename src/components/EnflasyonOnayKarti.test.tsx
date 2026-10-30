import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EnflasyonOnayView } from './EnflasyonOnayKarti';
import { inflationAmountForRate } from '../lib/inflationDecision';

const pending = { year: 2026, month: '2026-12', baseEUR: 1_450_000, defaultAmountEUR: inflationAmountForRate(1_450_000, 0.03) };

describe('Enflasyon onay kartı', () => {
  it('yılı, oranı ve tutarı gösterir; özel oranla tutar yeniden hesaplanır', () => {
    const onDecide = vi.fn();
    render(<EnflasyonOnayView pending={pending} defaultRate={0.03} onDecide={onDecide} />);
    expect(screen.getByText('2026 enflasyon payı: onayın gerekiyor')).toBeInTheDocument();
    const def = Math.round(pending.defaultAmountEUR).toLocaleString('de-DE');
    expect(screen.getByTestId('enf-tutar')).toHaveTextContent(`€${def}`);
    fireEvent.change(screen.getByLabelText(/Gerçekleşen enflasyon/), { target: { value: '2,2' } });
    const custom = inflationAmountForRate(pending.baseEUR, 0.022);
    expect(screen.getByTestId('enf-tutar')).toHaveTextContent(`€${Math.round(custom).toLocaleString('de-DE')}`);
    fireEvent.click(screen.getByRole('button', { name: 'Onayla ve düş' }));
    const arg = onDecide.mock.calls[0][0];
    expect(arg.year).toBe(2026); expect(arg.decision).toBe('approved');
    expect(arg.rate).toBeCloseTo(0.022, 10); expect(arg.amountEUR).toBeCloseTo(custom, 6);
  });

  it('"Bu yıl düşme" sıfır tutarla reddeder', () => {
    const onDecide = vi.fn();
    render(<EnflasyonOnayView pending={pending} defaultRate={0.03} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bu yıl düşme' }));
    expect(onDecide).toHaveBeenCalledWith({ year: 2026, decision: 'declined', rate: 0.03, amountEUR: 0 });
  });
});
