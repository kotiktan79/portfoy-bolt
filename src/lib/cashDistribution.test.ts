import { describe, expect, it } from 'vitest';
import type { Holding } from './supabase';
import { computeKasaFx } from '../services/kasaFxService';
import { EUR_CASH_RESERVE, WEEKLY_BUY_EUR } from './buyPlan';
import { buildCashDistribution, euroDripNote, fmtEUR } from './cashDistribution';

function H(o: Partial<Holding> & { symbol: string; asset_type: Holding['asset_type'] }): Holding {
  return {
    id: o.symbol,
    quantity: 0,
    purchase_price: 1,
    current_price: 1,
    currency: 'TRY',
    created_at: '2026-01-01',
    updated_at: '2026-10-27',
    ...o,
  } as Holding;
}

// Bugün: portföy €26.501 + $34.000, kasa $11.606 + ₽500.000, geri kalan 0.
// EUR/TRY 50, USD portföy €30.411 → USD/TRY aynı kur kasa için de €10.381'e yuvarlanır.
const EUR_TRY = 50;
const EUR_QTY = 26_501;
const USD_QTY = 34_000;
const USD_EUR = 30_411;
const USD_KASA = 11_606;
const RUB_QTY = 500_000;
const RUB_EUR = 5_530;
const USD_TRY = EUR_TRY * USD_EUR / USD_QTY;
const RUB_TRY = EUR_TRY * RUB_EUR / RUB_QTY;

const rates = [
  { day: '2026-10-27', from_currency: 'EUR', rate: EUR_TRY },
  { day: '2026-10-27', from_currency: 'USD', rate: USD_TRY },
  { day: '2026-10-27', from_currency: 'RUB', rate: RUB_TRY },
  { day: '2026-10-27', from_currency: 'GBP', rate: 60 },
];

function todayHoldings(): Holding[] {
  return [
    H({ symbol: 'EURO', asset_type: 'currency', quantity: EUR_QTY, current_price: EUR_TRY, currency: 'TRY' }),
    H({ symbol: 'USD', asset_type: 'currency', quantity: USD_QTY, current_price: USD_TRY, currency: 'TRY' }),
    H({ symbol: 'EURO', asset_type: 'currency', quantity: 0, current_price: EUR_TRY, currency: 'TRY' }),
    H({ symbol: 'VWCE', asset_type: 'stock', quantity: 12, current_price: 140, currency: 'EUR' }),
    H({ symbol: 'TRY', asset_type: 'currency', quantity: 38_292, current_price: 1, currency: 'TRY', house_money: true }),
    H({ symbol: 'GPY1PPF', asset_type: 'fund', quantity: 1_000, current_price: 1.5, currency: 'TRY', house_money: true }),
  ];
}

function todayKasa() {
  const fx = computeKasaFx([
    { currency: 'GBP', balance: 0 },
    { currency: 'CHF', balance: 0 },
    { currency: 'RON', balance: 0 },
    { currency: 'TRY', balance: 0 },
    { currency: 'RUB', balance: RUB_QTY },
    { currency: 'EUR', balance: 0 },
    { currency: 'USD', balance: USD_KASA },
  ], rates)!;
  return [
    ...fx.rows.map(r => ({ currency: r.currency, balance: r.balance, eur: r.eurNow })),
    ...fx.missingBalances.map(m => ({ currency: m.currency, balance: m.balance, eur: null })),
  ];
}

describe('nakit dağılımı', () => {
  it('bugünkü nakit ≈ €72,8 bin; ev parası toplama girmez', () => {
    expect(EUR_CASH_RESERVE).toBe(7_000);
    expect(WEEKLY_BUY_EUR).toBe(1_000);
    const model = buildCashDistribution(todayHoldings(), todayKasa(), 'ready');

    expect(model.rows.map(r => `${r.label}|${r.placeLabel}|${r.amountText}|${r.eurText}`)).toEqual([
      'Dolar|Portföy|$34.000|€30.411',
      'Euro|Portföy|€26.501|€26.501',
      'Dolar|Kasa|$11.606|€10.381',
      'Ruble|Kasa|₽500.000|€5.530',
    ]);
    expect(model.totalEUR).toBeCloseTo(EUR_QTY + USD_EUR + (USD_KASA * USD_EUR) / USD_QTY + RUB_EUR, 4);
    expect(model.totalText).toBe('€72.823');
    expect(model.totalLabel).toBe('Toplam');
    expect(model.shareText).toBe('Dolar %56, Euro %36, Ruble %8');
    expect(model.note).toBe('Euro nakitten €7.000 kenarda; kalan ~€19.501 haftada €1.000 VWCE\'ye gidiyor (~20 hafta)');
    expect(model.houseTRY).toBeCloseTo(38_292 + 1_500, 4);
    expect(model.houseEUR).toBeCloseTo((38_292 + 1_500) / EUR_TRY, 4);
    expect(model.houseText).toBe('Ev Parası (Türkiye) ₺39.792 · €796 — toplama dahil değil');
    expect(model.rows.some(r => r.label === 'Lira' || r.label === 'Sterlin')).toBe(false);
    expect(model.warnings).toEqual([]);
    expect(fmtEUR(model.totalEUR)).toBe(model.totalText);
  });

  it('kasa euroyu da haftalık plana katar; sıfır ve ev parası notu şişirmez', () => {
    const model = buildCashDistribution(
      todayHoldings(),
      [...todayKasa(), { currency: 'EUR', balance: 1_000, eur: 1_000 }],
      'ready',
    );
    expect(model.note).toContain('~€20.501');
    expect(model.note).toContain('(~21 hafta)');
    expect(euroDripNote(6_000)).toBe('Euro nakitten €7.000 kenarda; kalan ~€0 haftada €1.000 VWCE\'ye gidiyor (~0 hafta)');
    expect(euroDripNote(7_400)).toContain('1 haftadan az');
  });

  it('kuru olmayan kasa satırı durur ama toplama girmez', () => {
    const model = buildCashDistribution(
      [H({ symbol: 'EURO', asset_type: 'currency', quantity: 1_000, current_price: 50 })],
      [{ currency: 'CHF', balance: 200, eur: null }],
      'ready',
    );
    const chf = model.rows.find(r => r.currency === 'CHF')!;
    expect(chf.placeLabel).toBe('Kasa');
    expect(chf.amountText).toBe('200 Fr');
    expect(chf.eurText).toBe('kur yok');
    expect(model.totalEUR).toBeCloseTo(1_000, 6);
    expect(model.warnings.some(w => w.includes('Frank (kasa)'))).toBe(true);
    expect(model.shareText).toBe('Euro %100');
  });

  it('kasa yüklenirken toplam rakamı bekler', () => {
    const model = buildCashDistribution(todayHoldings(), [], 'loading');
    expect(model.totalText).toBe('…');
    expect(model.totalLabel).toBe('Portföy nakdi');
    expect(model.shareText).toBe('');
    expect(model.rows.some(r => r.placeLabel === 'Portföy')).toBe(true);
    expect(model.warnings).toContain('Kasa ekleniyor.');
  });

  it('kasa okunamazsa toplam yalnız portföyü söyler', () => {
    const model = buildCashDistribution(todayHoldings(), [], 'unavailable');
    expect(model.totalText).toBe('€56.912');
    expect(model.rows.some(r => r.place === 'kasa')).toBe(false);
    expect(model.warnings.join(' ')).toContain('Kasa bakiyesi veya kur yok');
    expect(model.houseText).toContain('toplama dahil değil');
  });

  it('notla işaretli ev parası da nakit tablosunda yok', () => {
    const model = buildCashDistribution([
      H({ symbol: 'EURO', asset_type: 'currency', quantity: 2_000, current_price: 50 }),
      H({ symbol: 'GPY1PPF', asset_type: 'fund', quantity: 10, current_price: 2, price_notes: 'Ev Parası konut' }),
      H({ symbol: 'Ev Parası', asset_type: 'cash', quantity: 100, current_price: 1 }),
    ], [], 'ready');
    expect(model.rows).toHaveLength(1);
    expect(model.totalEUR).toBeCloseTo(2_000, 6);
    expect(model.houseTRY).toBeCloseTo(120, 6);
  });
});
