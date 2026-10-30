import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { GununHareketleri } from './GununHareketleri';
import type { LiveGain } from '../lib/eurPnl';

const mv = (symbol: string, eurDelta: number | null, pricePct: number | null = 1, fxEUR: number | null = 0) =>
  ({ symbol, assetType: 'stock', eurDelta, pricePct, fxEUR, valueEUR: 1000, ...(eurDelta === null ? { reason: 'kapanis-yok' as const } : {}) });

const live = (movers: LiveGain['movers'], gainEUR: number): LiveGain =>
  ({ gainEUR, wealthEUR: 150_000, sinceDate: '2026-10-29', totalValueTRY: 0, movers });

describe('Bugün en çok yükselen / düşen paneli', () => {
  it('ilk 3 yükselen ve düşen, toplam, portföy payı, veri yok listesi', () => {
    render(<GununHareketleri baseWealthEUR={150_000} live={live([
      mv('BTC', -151, -2.1), mv('ALTIN', null), mv('ASML', 40, 3.5), mv('TUPRS', -20, 0.4, -25),
      mv('VWCE', 12, 0.8), mv('JNJ', 5, 1.1), mv('IB01', 1, 0.05), mv('BIMAS', -3, 0, -3),
    ], -150)} />);
    const card = screen.getByRole('region', { name: 'Bugün en çok yükselen / düşen' });
    expect(card).toHaveTextContent('29.10 kapanışından beri');
    const rows = within(card).getAllByTestId('mover-row').map(r => r.textContent);
    expect(rows[0]).toMatch(/^ASML/); expect(rows[1]).toMatch(/^VWCE/); expect(rows[2]).toMatch(/^JNJ/);
    expect(rows[3]).toMatch(/^BTC/); expect(rows[4]).toMatch(/^TUPRS/); expect(rows[5]).toMatch(/^BIMAS/);
    expect(rows[3]).toContain('−€151');
    expect(rows[3]).toContain('portföyün −%0,10');
    expect(rows[4]).toContain('kur payı −€25');
    expect(screen.getByTestId('movers-total')).toHaveTextContent('Pozisyonların toplamı: −€116');
    expect(screen.getByTestId('movers-other')).toHaveTextContent('Nakit döviz ve diğer: −€34 · genel toplam −€150');
    expect(screen.getByTestId('movers-nodata')).toHaveTextContent('Veri yok: ALTIN');
    expect(card.textContent).not.toMatch(/₺|TL/);
  });

  it('kapanış fiyatı yoksa "veri yok", rakam basmaz', () => {
    render(<GununHareketleri live={live(undefined, 0)} />);
    expect(screen.getByText('Veri yok: dünkü kapanış fiyatları bulunamadı.')).toBeInTheDocument();
    expect(screen.queryByTestId('mover-row')).toBeNull();
  });

  it('yüklenirken / hatada', () => {
    const { rerender } = render(<GununHareketleri live={null} state="loading" />);
    expect(screen.getByText('Bakılıyor…')).toBeInTheDocument();
    rerender(<GununHareketleri live={null} state="error" />);
    expect(screen.getByText('Veri yok: canlı fiyatlar okunamadı.')).toBeInTheDocument();
  });
});
