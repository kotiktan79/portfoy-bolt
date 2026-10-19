import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildEurModel, liveEurGain, priceAtSnapshot, type EurModelInput } from './eurPnl';
import { allocationClassFor, isHouseMoney } from '../config/portfolioPolicy';
import { policySnapshot } from './policyAllocation';
import { holdingValueTRY } from './fx';
import { isEtfQuoteHolding, ETF_YAHOO } from './etfQuote';
import { isManualEurValue } from './manualPrice';
import { analyzeXRay } from '../services/xrayService';
import { calculateRebalance } from '../services/analyticsService';
import type { Holding } from './supabase';

const base = (over: Partial<EurModelInput>): EurModelInput => ({
  snapshots: [],
  eurRates: [],
  usdRates: [],
  transactions: [],
  cashSells: [],
  holdings: [],
  usdNow: 40,
  reliableFrom: '2026-08-01',
  annualInflation: 0,
  ...over,
});

describe('snapshot-time FX, not the 22:35 UTC close', () => {
  const created = '2026-08-02T18:00:00.000Z';
  const snaps = [
    { snapshot_date: '2026-08-01', total_value: 100_000, total_investment: 80_000, created_at: '2026-08-01T18:00:00.000Z' },
    { snapshot_date: '2026-08-02', total_value: 100_000, total_investment: 80_000, created_at: created },
  ];
  // Servet her iki günde de snapshot kuru 50 ile kurulmuş (100.000 / 50 = €2.000). Gün sonu kuru farklı.
  const eurRates = [
    { recorded_at: '2026-08-01', rate: 52 },
    { recorded_at: '2026-08-02', rate: 51 },
  ];
  const usdRates = [
    { recorded_at: '2026-08-01', rate: 48 },
    { recorded_at: '2026-08-02', rate: 47 },
  ];

  it('priceAtSnapshot: +5 dk kazanır, +11 dk ve 22:35 dışarıda kalır', () => {
    const rows = [
      { symbol: 'EURO', price: 49, recorded_at: '2026-08-02T17:00:00.000Z' },
      { symbol: 'EURO', price: 50.4, recorded_at: '2026-08-02T18:05:00.000Z' },
      { symbol: 'EURO', price: 99, recorded_at: '2026-08-02T18:11:00.000Z' },
      { symbol: 'EURO', price: 52, recorded_at: '2026-08-02T22:35:00.000Z' },
      { symbol: 'USD', price: 1, recorded_at: '2026-08-02T18:05:00.000Z' },
    ];
    expect(priceAtSnapshot(rows, ['EURO', 'EUR'], '2026-08-02', created)).toBe(50.4);
    expect(priceAtSnapshot(rows, ['USD'], '2026-08-02', created)).toBeNull();
    expect(priceAtSnapshot(rows, ['EURO'], '2026-08-02', null)).toBe(50.4);
  });

  it('buildEurModel ve liveEurGain o günün EURO/USD fiyatını kullanır', () => {
    const bare = buildEurModel(base({ snapshots: snaps, eurRates, usdRates }));
    expect(bare.daily[1].eurRate).toBe(51);
    expect(bare.daily[1].gainEUR).not.toBeCloseTo(0, 4);

    const fxCloses = [
      { symbol: 'EURO', price: 50, recorded_at: '2026-08-01T18:00:30.000Z' },
      { symbol: 'EURO', price: 49, recorded_at: '2026-08-02T17:00:00.000Z' },
      { symbol: 'EURO', price: 50, recorded_at: '2026-08-02T18:05:00.000Z' },
      { symbol: 'euro', price: 99, recorded_at: '2026-08-02T18:11:00.000Z' },
      { symbol: 'EURO', price: 51, recorded_at: '2026-08-02T22:35:00.000Z' },
      { symbol: 'USD', price: 41, recorded_at: '2026-08-01T18:00:30.000Z' },
      { symbol: 'USD', price: 40, recorded_at: '2026-08-02T18:05:00.000Z' },
      { symbol: 'USD', price: 47, recorded_at: '2026-08-02T22:35:00.000Z' },
    ];
    const model = buildEurModel(base({ snapshots: snaps, eurRates, usdRates, fxCloses }));
    expect(model.daily[0].eurRate).toBe(50);
    expect(model.daily[1].eurRate).toBe(50);
    expect(model.daily[1].usdRate).toBe(40);
    expect(model.daily[1].gainEUR).toBeCloseTo(0, 6);

    const book = [{ symbol: 'X', currency: 'TRY', quantity: 1, current_price: 100_000, purchase_price: 80_000 }];
    const live = liveEurGain(model, { holdings: book, usdNow: 40, eurNow: 50 })!;
    expect(live.gainEUR).toBeCloseTo(0, 6);
    const drifted = liveEurGain(bare, { holdings: book, usdNow: 40, eurNow: 50 })!;
    expect(drifted.gainEUR).toBeCloseTo(100_000 / 50 - 100_000 / 51, 6);
  });

  it('pencerede fiyat yoksa exchange_rates_daily durur', () => {
    const model = buildEurModel(base({
      snapshots: snaps,
      eurRates,
      usdRates,
      fxCloses: [{ symbol: 'EURO', price: 50, recorded_at: '2026-08-02T22:35:00.000Z' }],
    }));
    expect(model.daily[1].eurRate).toBe(51);
  });
});

function H(o: Partial<Holding> & { symbol: string; asset_type: Holding['asset_type'] }): Holding {
  return {
    id: o.symbol,
    name: o.symbol,
    quantity: 1,
    purchase_price: 1,
    current_price: 1,
    currency: 'TRY',
    created_at: '2026-01-01',
    updated_at: '2026-10-19',
    ...o,
  } as Holding;
}

describe('Ev Parası allocation dışıdır', () => {
  it('not, sembol ve house_money işareti tanınır; sıradan fon ve kasa kalır', () => {
    expect(isHouseMoney({ symbol: 'GPY1PPF', asset_type: 'fund', price_notes: 'Ev Parası konut' })).toBe(true);
    expect(isHouseMoney({ symbol: 'GPY1PPF', asset_type: 'fund', price_notes: '  ev parasi' })).toBe(true);
    expect(isHouseMoney({ symbol: 'GPY1PPF', asset_type: 'fund', price_notes: 'GPA benzeri' })).toBe(false);
    expect(isHouseMoney({ symbol: 'Ev Parası', asset_type: 'cash', currency: 'TRY' })).toBe(true);
    expect(isHouseMoney({ symbol: 'Ev Parasi', asset_type: 'cash', currency: 'TRY' })).toBe(true);
    expect(isHouseMoney({ symbol: 'EV PARASI', asset_type: 'cash', currency: 'TRY', price_notes: '' })).toBe(true);
    expect(isHouseMoney({ symbol: 'KASA', asset_type: 'cash', currency: 'TRY' })).toBe(false);
    expect(isHouseMoney({ symbol: 'ALT', asset_type: 'stock', house_money: true })).toBe(true);
    expect(allocationClassFor({ symbol: 'GPY1PPF', asset_type: 'fund', price_notes: 'Ev Parası' })).toBeNull();
    expect(allocationClassFor({ symbol: 'GPA', asset_type: 'fund' })).toBe('fund');
    expect(allocationClassFor({ symbol: 'KASA', asset_type: 'cash' })).toBeNull();
  });

  it('policySnapshot Ev Parası paydasını ayırır, GPA fonda kalır', () => {
    const holdings = [
      H({ symbol: 'EURO', asset_type: 'currency', quantity: 1, current_price: 50, currency: 'TRY' }),
      H({ symbol: 'V3YL', asset_type: 'stock', quantity: 10, current_price: 100, currency: 'EUR' }),
      H({ symbol: 'GPA', asset_type: 'fund', quantity: 100, current_price: 90, currency: 'TRY' }),
      H({ symbol: 'GPY1PPF', asset_type: 'fund', quantity: 1000, current_price: 0.142216, price_notes: 'Ev Parası', currency: 'TRY' }),
      H({ symbol: 'Ev Parası', asset_type: 'cash', quantity: 10_000, current_price: 1, currency: 'TRY' }),
      H({ symbol: 'KASA', asset_type: 'cash', quantity: 5_000, current_price: 1, currency: 'TRY' }),
      H({ symbol: 'BAYRAK', asset_type: 'stock', quantity: 1, current_price: 5_000, house_money: true, currency: 'TRY' }),
    ];
    const snap = policySnapshot(holdings, new Date('2026-10-19T12:00:00Z'));
    expect(snap.houseMoneyTRY).toBeCloseTo(1000 * 0.142216 + 10_000 + 5_000, 4);
    expect(snap.houseMoneyEUR).toBeCloseTo(snap.houseMoneyTRY / 50, 4);
    expect(snap.totalTRY).toBeCloseTo(10 * 100 * 50 + 100 * 90 + 50, 4);
    expect(snap.rows.find(r => r.key === 'fund')!.valueEUR).toBeCloseTo(180, 4);
    expect(snap.rows.find(r => r.key === 'stock')!.valueEUR).toBeCloseTo(1000, 4);
    expect(snap.rows.find(r => r.key === 'currency')!.valueEUR).toBeCloseTo(1, 4);

    const reb = calculateRebalance(holdings, { stock: 62, fund: 4 });
    expect(reb.map(r => r.symbol)).not.toContain('GPY1PPF');
    expect(reb.map(r => r.symbol)).not.toContain('Ev Parası');
    expect(reb.map(r => r.symbol)).toContain('GPA');

    const x = analyzeXRay(holdings.filter(h => h.symbol !== 'KASA'));
    const fund = x.allocationDrift.find(d => d.asset_type === 'fund');
    const houseInXray = 1000 * 0.142216 + 5_000;
    const allocBase = x.totalValue - houseInXray;
    expect(fund?.value ?? 0).toBeCloseTo(9_000, 2);
    expect(fund?.currentPct ?? 0).toBeCloseTo((9_000 / allocBase) * 100, 2);
    expect(fund?.currentPct ?? 0).toBeGreaterThan((9_000 / x.totalValue) * 100);
  });
});

describe('XEON / IB01 kotasyon yönlendirmesi ve REVOLUT EUR', () => {
  it('money_market ve treasury_etf günlük kotasyon işine girer', () => {
    expect(isEtfQuoteHolding('money_market', 'XEON')).toBe(true);
    expect(isEtfQuoteHolding('treasury_etf', 'IB01')).toBe(true);
    expect(ETF_YAHOO.XEON).toBe('XEON.DE');
    expect(ETF_YAHOO.IB01).toBe('IB01.L');
    expect(isEtfQuoteHolding('stock', 'V3YL')).toBe(false);
    expect(isEtfQuoteHolding('fund', 'GPY1PPF')).toBe(false);
    const cron = readFileSync(resolve(process.cwd(), 'api/cron/daily-snapshot.ts'), 'utf8');
    const client = readFileSync(resolve(process.cwd(), 'src/contexts/PortfolioContext.tsx'), 'utf8');
    expect(cron).toContain('isEtfQuoteHolding');
    expect(cron).toContain('isManualEurValue');
    expect(cron).not.toContain('byType.eurobond');
    expect(cron).not.toContain('EUROBOND_ETF_YAHOO');
    expect(client).toContain('isEtfQuoteHolding');
    expect(client).toContain('isManualEurValue');
  });

  it('REVOLUT-ROBO manuel EUR değeri bir kez EUR/TRY ile çarpılır', () => {
    expect(isManualEurValue(' REVOLUT-ROBO ')).toBe(true);
    expect(isManualEurValue('VWCE')).toBe(false);
    const qty = 1.29;
    const eur = 55.6;
    const price = Math.round((8762 / qty) * 1e8) / 1e8;
    const tryValue = holdingValueTRY({ current_price: price, quantity: qty, currency: 'EUR' }, { usd: 48, eur });
    expect(tryValue / eur).toBeCloseTo(8762, 4);
  });
});
