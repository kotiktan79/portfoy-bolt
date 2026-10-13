import { describe, expect, it } from 'vitest';
import { assetName, transactionAssetLabel } from './assetNames';
import { isClosedHolding, salesForHolding, sumRealizedEUR } from './closedPositions';
import { holdingPriceDay, isPriceStale, isResearchStale, previousWeekday, RESEARCH_STALE_DAYS } from './freshness';
import { incomeViews } from './incomeDisplay';
import { letterGrade } from '../services/xrayService';
import { analyzeXRay } from '../services/xrayService';
import type { Holding } from './supabase';
import { translations } from './i18n';

describe('kapalı pozisyon', () => {
  it('adet 0 ayrı listeye girer, açık listeye girmez', () => {
    const rows = [
      { id: 'a', quantity: 10 },
      { id: 'b', quantity: 0 },
      { id: 'c', quantity: '0' },
    ];
    expect(rows.filter(r => !isClosedHolding(r)).map(r => r.id)).toEqual(['a']);
    expect(rows.filter(isClosedHolding).map(r => r.id)).toEqual(['b', 'c']);
  });

  it('itfa etmiş tahvilin realize kârı satış günü kuruyla eurodur', () => {
    const sales = salesForHolding(
      { id: 'cj', currency: 'TRY', total_realized_pnl: 1 },
      [{ holding_id: 'cj', transaction_type: 'sell', realized_profit: 18881, transaction_date: '2026-09-28T06:00:00Z' }],
    );
    expect(sales).toEqual([{ day: '2026-09-28', native: 18881, currency: 'TRY' }]);
    const eur = sumRealizedEUR(sales, (ccy) => (ccy === 'EUR' ? 55.72 : 48.95));
    expect(eur).toBeCloseTo(18881 / 55.72, 2);
  });
});

describe('bayat fiyat ve araştırma', () => {
  it('salı günü cuma fiyatı bayat, pazartesi taze', () => {
    expect(previousWeekday('2026-10-13')).toBe('2026-10-12');
    expect(isPriceStale('2026-10-09', '2026-10-13')).toBe(true);
    expect(isPriceStale('2026-10-12', '2026-10-13')).toBe(false);
    expect(isPriceStale('2026-10-13', '2026-10-13')).toBe(false);
  });

  it('pazartesi, cuma taze; perşembe bayat', () => {
    expect(previousWeekday('2026-10-12')).toBe('2026-10-09');
    expect(isPriceStale('2026-10-09', '2026-10-12')).toBe(false);
    expect(isPriceStale('2026-10-08', '2026-10-12')).toBe(true);
  });

  it('araştırma X günden eskiyse rozet', () => {
    expect(RESEARCH_STALE_DAYS).toBe(7);
    expect(isResearchStale('2026-10-06', '2026-10-13')).toBe(false);
    expect(isResearchStale('2026-10-05', '2026-10-13')).toBe(true);
    expect(isResearchStale(null, '2026-10-13')).toBe(false);
  });

  it('manuel fiyat kendi gününü kullanır', () => {
    expect(holdingPriceDay({ manual_price: true, manual_price_updated_at: '2026-07-01T10:00:00Z', updated_at: '2026-10-12' }, '2026-10-12')).toBe('2026-07-01');
  });
});

describe('varlık adı', () => {
  it('sembolün Türkçe adını verir, kimlik basmaz', () => {
    expect(assetName('ASELS')).toBe('Aselsan');
    expect(assetName('US900123CJ75')).toContain('eurobond');
    const label = transactionAssetLabel(null);
    expect(label.name).toBe('Kapanmış pozisyon');
    expect(label.name).not.toMatch(/[0-9a-f]{8}-/);
    expect(transactionAssetLabel({ symbol: 'TUPRS' }).name).toBe('Tüpraş');
  });
});

describe('gelir listesi', () => {
  it('üç kuponu gelir olarak gösterir, kâr cetveline yazmaz', () => {
    const rows = incomeViews([
      { id: '1', income_date: '2025-10-14', income_type: 'coupon', source_symbol: 'US900123CJ75', amount: 42.5, currency: 'USD', amount_try: 1777, destination: null, is_projected: false },
      { id: '2', income_date: '2026-04-14', income_type: 'coupon', source_symbol: 'US900123CJ75', amount: 42.5, currency: 'USD', amount_try: 1900, destination: null, is_projected: false },
      { id: '3', income_date: '2026-09-25', income_type: 'coupon', source_symbol: 'US900123CL22', amount: 60, currency: 'USD', amount_try: 2933, destination: null, is_projected: false },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.date)).toEqual(['2026-09-25', '2026-04-14', '2025-10-14']);
    expect(rows.every(r => r.label === 'Kupon' && r.inProfitEngine === false)).toBe(true);
  });

  it('kasaya geçen temettü cetvele dahildir', () => {
    const [row] = incomeViews([
      { id: 'd', income_date: '2026-06-01', income_type: 'dividend', source_symbol: 'TUPRS', amount: 100, currency: 'TRY', amount_try: 100, destination: 'kasa', is_projected: false },
    ]);
    expect(row.inProfitEngine).toBe(true);
  });
});

describe('X-Ray notu', () => {
  it('yüksek uyarı varken A verilmez', () => {
    expect(letterGrade(92, []).grade).toBe('A+');
    expect(letterGrade(92, [{ severity: 'high' }])).toEqual({ grade: 'B+', capped: true });
    expect(letterGrade(70, [{ severity: 'high' }]).grade).toBe('B+');
  });

  it('yüksek atıl nakit canlıya benzer portföyde A bırakmaz', () => {
    const H = (o: Partial<Holding> & { symbol: string; asset_type: Holding['asset_type'] }): Holding => ({
      id: o.symbol, name: o.symbol, quantity: 1, purchase_price: 1, current_price: 1, currency: 'TRY',
      created_at: '2025-10-22', updated_at: '2026-10-12', ...o,
    } as Holding);
    const x = analyzeXRay([
      H({ symbol: 'USD', asset_type: 'currency', quantity: 34000, current_price: 49 }),
      H({ symbol: 'EURO', asset_type: 'currency', quantity: 30000, current_price: 55 }),
      H({ symbol: 'TUPRS', asset_type: 'stock', quantity: 10, current_price: 200 }),
    ]);
    expect(x.findings.some(f => f.id === 'dead-money' && f.severity === 'high')).toBe(true);
    const g = letterGrade(x.healthScore, x.findings);
    expect(g.grade === 'A' || g.grade === 'A+').toBe(false);
  });
});

describe('Türkçe etiketler', () => {
  it('Türkçe sözlükte İngilizce kalıntı yok', () => {
    const banned = /\b(Rebalance|Backup|Restore|Cache|Dollar Cost|PnL|WebSocket|Rebalancing)\b/;
    for (const [key, row] of Object.entries(translations)) {
      expect(row.tr, key).not.toMatch(banned);
    }
  });
});
