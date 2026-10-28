import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuAyMaasCard } from './BuAyMaasCard';
import type { MonthSalaryInputs } from '../lib/monthSalaryCard';

const base: MonthSalaryInputs = {
  poolEUR: 800,
  realGainEUR: 200,
  kasaEUR: 20_000,
  asOfMonth: '2026-10',
  withdrawnThisMonthEUR: 0,
};

function renderCard(inputs: MonthSalaryInputs) {
  return render(<BuAyMaasCard inputs={inputs} />);
}

describe('Bu Ay Maaşın kartı', () => {
  it('henüz başlamadıysa örnek tutarı ve kuralı yazar', () => {
    renderCard(base);
    const card = screen.getByRole('region', { name: 'Bu Ay Maaşın' });
    expect(card).toHaveTextContent("Maaş Nisan 2027'de başlıyor");
    expect(card).toHaveTextContent('Şu an başlasaydı: €700');
    expect(card).toHaveTextContent('Kârdan €680 + kasadan €20');
    expect(card).toHaveTextContent('Sadece bu kadar çek, fazlasını değil.');
    expect(screen.getByRole('link', { name: 'Detay' })).toHaveAttribute('href', '#kar-cuzdani');
    expect(card).not.toHaveTextContent('çekebileceğin');
    expect(card.textContent).not.toMatch(/floor|tavan|havuz|policy/i);
  });

  it('başlayınca çekilebilecek maaşı yazar', () => {
    renderCard({ ...base, asOfMonth: '2027-04' });
    expect(screen.getByText('Bu ay çekebileceğin maaş: €700')).toBeInTheDocument();
    expect(screen.getByText('Kârdan €680 + kasadan €20')).toBeInTheDocument();
    expect(screen.queryByText(/başlıyor/)).not.toBeInTheDocument();
  });

  it('yalnız kârdan ya da yalnız kasadan satırı', () => {
    const { rerender } = renderCard({
      poolEUR: 2_000,
      realGainEUR: 1_200,
      kasaEUR: 29_400,
      asOfMonth: '2027-05',
    });
    expect(screen.getByText('Bu ay çekebileceğin maaş: €1.000')).toBeInTheDocument();
    expect(screen.getByText('Kârdan €1.000')).toBeInTheDocument();
    expect(screen.queryByText(/kasadan/)).not.toBeInTheDocument();

    rerender(
      <BuAyMaasCard inputs={{
        poolEUR: 0,
        realGainEUR: 0,
        kasaEUR: 15_700,
        asOfMonth: '2027-05',
      }} />,
    );
    expect(screen.getByText('Bu ay çekebileceğin maaş: €700')).toBeInTheDocument();
    expect(screen.getByText('Kasadan €700')).toBeInTheDocument();
    expect(screen.queryByText(/Kârdan/)).not.toBeInTheDocument();
  });

  it('çekildiyse onay cümlesi', () => {
    renderCard({ ...base, asOfMonth: '2027-05', withdrawnThisMonthEUR: 700 });
    const card = screen.getByRole('region', { name: 'Bu Ay Maaşın' });
    expect(card).toHaveTextContent('✅ Bu ayın maaşı çekildi (€700)');
    expect(card).not.toHaveTextContent('çekebileceğin');
    expect(card).not.toHaveTextContent('Kârdan');
    expect(card).toHaveTextContent('Sadece bu kadar çek, fazlasını değil.');
  });

  it('sıfır maaşı kaynak satırı olmadan yazar', () => {
    renderCard({
      poolEUR: 0,
      realGainEUR: 0,
      kasaEUR: 15_600,
      asOfMonth: '2027-05',
    });
    expect(screen.getByText('Bu ay çekebileceğin maaş: €0')).toBeInTheDocument();
    expect(screen.queryByText(/Kârdan|Kasadan|kasadan/)).not.toBeInTheDocument();
  });
});
