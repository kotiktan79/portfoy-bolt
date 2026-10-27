import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { fmtSignedEUR0 } from '../lib/chartTheme';
import { sumPositionGains } from '../lib/monthlyPositionBreakdown';
import { PositionContributionList } from './MonthlyAttribution';
import type { PositionLine } from '../lib/monthlyPositionBreakdown';

function line(partial: Partial<PositionLine> & Pick<PositionLine, 'id' | 'symbol' | 'gainEUR'>): PositionLine {
  return {
    type: 'stock',
    currency: 'TRY',
    qtyStart: 1,
    qtyEnd: 1,
    pct: partial.gainEUR,
    sold: false,
    ...partial,
  };
}

const rows: PositionLine[] = [
  line({ id: '1', symbol: 'AKSEN', gainEUR: 400, pct: 4 }),
  line({ id: '2', symbol: 'GARAN', gainEUR: 120, pct: 1.5 }),
  line({ id: '3', symbol: 'SISE', gainEUR: 40, pct: 0.4 }),
  line({ id: '4', symbol: 'BIMAS', gainEUR: 15, pct: 0.2 }),
  line({ id: '5', symbol: 'TUPRS', gainEUR: 8, pct: 0.1 }),
  line({ id: '6', symbol: 'EREGL', gainEUR: -6, pct: -0.3 }),
  line({ id: '7', symbol: 'TOASO', gainEUR: -45, pct: -2.1, sold: true, qtyEnd: 0 }),
  line({ id: '8', symbol: 'THYAO', gainEUR: -80, pct: -3, sold: true, qtyEnd: 0 }),
  line({ id: '9', symbol: 'ASELS', gainEUR: -210, pct: -8 }),
];

describe('tüm pozisyon listesi', () => {
  it('ilk beşi değil, her pozisyonu ve satılanları büyükten küçüğe yazar', () => {
    render(<PositionContributionList rows={rows} totalEUR={sumPositionGains(rows)} officialEUR={-692} />);
    for (const row of rows) {
      expect(screen.getByText(row.symbol)).toBeInTheDocument();
    }
    expect(screen.getAllByText('satıldı')).toHaveLength(2);
    const names = rows.map(r => r.symbol);
    const text = document.body.textContent || '';
    const indexes = names.map(name => text.indexOf(name));
    const sorted = [...rows].sort((a, b) => b.gainEUR - a.gainEUR).map(r => r.symbol);
    const seen = sorted.map(name => text.indexOf(name));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(indexes.every(i => i >= 0)).toBe(true);
    expect(screen.getByText(fmtSignedEUR0(sumPositionGains(rows)))).toBeInTheDocument();
    expect(screen.getByText(/Pozisyon Hareketi/)).toBeInTheDocument();
    expect(screen.getByText(/Bu döküm yaklaşıktır/)).toBeInTheDocument();
    expect(screen.getByText(/Kar\/Zarar Geçmişi/)).toBeInTheDocument();
    expect(screen.getByText(fmtSignedEUR0(-692))).toBeInTheDocument();
  });

  it('liste gizlenince satırlar kalkar, toplamın kaynağı durur', () => {
    render(<PositionContributionList rows={rows} totalEUR={sumPositionGains(rows)} officialEUR={-692} />);
    fireEvent.click(screen.getByRole('button', { name: 'Listeyi gizle' }));
    expect(screen.queryByText('TOASO')).not.toBeInTheDocument();
    expect(screen.queryByText('Toplam')).not.toBeInTheDocument();
    expect(screen.getByText(/resmi ay kârı/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tümünü göster (9)' }));
    expect(screen.getByText('THYAO')).toBeInTheDocument();
    expect(screen.getByText('Toplam')).toBeInTheDocument();
  });
});
