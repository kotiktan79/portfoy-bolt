import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RomaniaRenovationCard } from './RomaniaRenovationCard';
import { buildRenovationSummary } from '../lib/romaniaRenovation';

describe('Romanya ev tadilat kartı', () => {
  it('satırları, yıl alt toplamlarını ve kalın toplamı yazar', () => {
    render(<RomaniaRenovationCard summary={buildRenovationSummary({})} />);
    expect(screen.getByRole('heading', { name: 'Harcamalar' })).toBeInTheDocument();
    expect(screen.getByText('1 Eylül 2025')).toBeInTheDocument();
    expect(screen.getByText('Ev tadilatı')).toBeInTheDocument();
    expect(screen.getByText('uygulama öncesi, sadece bilgi')).toBeInTheDocument();
    expect(screen.getAllByText('€20.000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3 Temmuz 2026')).toHaveLength(3);
    expect(screen.getByText('Ev tadilatı/remont harcaması')).toBeInTheDocument();
    expect(screen.getByText('Ev remontu harcaması')).toBeInTheDocument();
    expect(screen.getByText('Ev tadilatı harcaması')).toBeInTheDocument();
    expect(screen.getAllByText('€3.500').length).toBeGreaterThan(0);
    expect(screen.getAllByText('€4.050').length).toBeGreaterThan(0);
    expect(screen.getByText('25.000 RON')).toBeInTheDocument();
    expect(screen.getByText('≈ €4.920')).toBeInTheDocument();
    expect(screen.getByText('Sabit yedek kur — kur serisinde karşılık yok')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Yıl alt toplamları' })).toBeInTheDocument();
    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getByText('€12.470')).toBeInTheDocument();
    const total = screen.getByText('≈ €32.470');
    expect(total.className).toContain('font-bold');
    expect(screen.getByText(/Portföy toplamına, kâr ve zarara, Kâr Cüzdanına, performansa, anlık görüntülere, maaşa ve nakit dağılımına girmez/)).toBeInTheDocument();
  });

  it('kur serisi RON satırının euro karşılığını değiştirir ve güncel kuru söyler', () => {
    const summary = buildRenovationSummary({
      cashRows: [
        { at: '2026-07-03T10:00:00+03:00', currency: 'EUR', amount: 3500 },
        { at: '2026-07-03T10:00:00+03:00', currency: 'EUR', amount: 4050 },
        { at: '2026-07-03T10:00:00+03:00', currency: 'RON', amount: 25000 },
      ],
      ronTry: 10,
      eurTry: 50,
    });
    render(<RomaniaRenovationCard summary={summary} />);
    expect(screen.getByText('≈ €5.000')).toBeInTheDocument();
    expect(screen.getByText('≈ €32.550')).toBeInTheDocument();
    expect(screen.getByText('Güncel kur — harcama gününün kuru yok')).toBeInTheDocument();
  });
});
