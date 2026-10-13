import { describe, expect, it } from 'vitest';
import {
  INFLATION_EUR, buildEurModel, entitlementEUR, monthlyRows, normalizeInflation,
  remainingEntitlementEUR, withdrawalEUR, withdrawnMap,
} from './eurPnl';
import { balanceGap, ledgerFromTransactions } from './cashLedger';
import { displayCurrency, nativeUnrealized } from './holdingPnl';
import { heldPriceMove, qtyAsOf } from './attributionQty';

const base = { reliableFrom: '2026-04-06', annualInflation: 0.02, usdNow: 44 };

function snap(date: string, value: number, inv: number, createdAt?: string) {
  return { snapshot_date: date, total_value: value, total_investment: inv, created_at: createdAt ?? `${date}T18:00:00Z` };
}

describe('denetim düzeltmeleri', () => {
  it('1 — adedi sıfır satır durursa 10.000 dolarlık kur kârı +€800 kalır', () => {
    const eurRates = [{ recorded_at: '2026-09-01', rate: 50 }, { recorded_at: '2026-09-02', rate: 50 }];
    const usdRates = [{ recorded_at: '2026-09-01', rate: 40 }, { recorded_at: '2026-09-02', rate: 44 }];
    const snapshots = [snap('2026-09-01', 400_000, 400_000), snap('2026-09-02', 440_000, 440_000)];
    const kept = buildEurModel({
      ...base, snapshots, eurRates, usdRates, cashSells: [],
      holdings: [{ id: 'b1', currency: 'USD', quantity: 0, purchase_price: 1, created_at: '2026-08-01T00:00:00Z' }],
      transactions: [{
        transaction_date: '2026-09-03T10:00:00Z', transaction_type: 'sell', quantity: 10000,
        total_amount: 10000, realized_profit: 0, holding_id: 'b1', currency: 'USD',
      }],
    });
    expect(kept.daily.find(d => d.date === '2026-09-02')?.gainEUR).toBeCloseTo(800, 4);

    const gone = buildEurModel({
      ...base, snapshots, eurRates, usdRates, transactions: [], cashSells: [], holdings: [],
    });
    expect(gone.daily.find(d => d.date === '2026-09-02')?.gainEUR).toBeCloseTo(0, 4);
  });

  it('1 — pozisyon yoksa işlemdeki USD, TL sanılmaz', () => {
    const m = buildEurModel({
      ...base,
      usdNow: 43,
      snapshots: [snap('2026-09-01', 100_000, 100_000), snap('2026-09-02', 100_000, 100_000)],
      eurRates: [{ recorded_at: '2026-09-01', rate: 50 }, { recorded_at: '2026-09-02', rate: 50 }],
      usdRates: [{ recorded_at: '2026-09-01', rate: 43 }, { recorded_at: '2026-09-02', rate: 43 }],
      cashSells: [], holdings: [],
      transactions: [{
        transaction_date: '2026-09-02T10:00:00Z', transaction_type: 'sell', quantity: 1,
        total_amount: 200, realized_profit: 200, holding_id: 'gone', currency: 'USD',
      }],
    });
    const gain = m.daily.find(d => d.date === '2026-09-02')?.gainEUR ?? 0;
    expect(gain).toBeCloseTo(172, 4);
    expect(gain).not.toBeCloseTo(4, 0);
  });

  it('2 — 21:00 sonrası Bükreş satışı ertesi snapshot gününe gider', () => {
    const m = buildEurModel({
      ...base,
      snapshots: [
        snap('2026-09-30', 500_000, 500_000, '2026-09-30T18:00:00Z'),
        snap('2026-10-01', 490_000, 480_000, '2026-10-01T18:00:00Z'),
      ],
      eurRates: [{ recorded_at: '2026-09-30', rate: 50 }, { recorded_at: '2026-10-01', rate: 50 }],
      usdRates: [{ recorded_at: '2026-09-30', rate: 43 }, { recorded_at: '2026-10-01', rate: 43 }],
      cashSells: [],
      holdings: [{ id: 't', currency: 'TRY', quantity: 1, purchase_price: 1, created_at: '2026-08-01T00:00:00Z' }],
      transactions: [{
        transaction_date: '2026-09-30T19:30:00Z', transaction_type: 'sell',
        quantity: 1, total_amount: 1000, realized_profit: 1000, holding_id: 't', currency: 'TRY',
      }],
    });
    expect(m.daily.find(d => d.date === '2026-10-01')?.gainEUR).toBeCloseTo(220, 4);
  });

  it('2 — 2026-06-11 22:34 UTC satışı 12 Haziran Bükreş günüdür', () => {
    const days = ['2026-06-10', '2026-06-11', '2026-06-12'];
    const m = buildEurModel({
      ...base,
      snapshots: days.map(d => snap(d, 100_000, 100_000)),
      eurRates: days.map(d => ({ recorded_at: d, rate: 50 })),
      usdRates: days.map(d => ({ recorded_at: d, rate: 43 })),
      cashSells: [],
      holdings: [{ id: 'e', currency: 'TRY', quantity: 1, purchase_price: 1, created_at: '2026-06-01T00:00:00Z' }],
      transactions: [{
        transaction_date: '2026-06-11T22:34:58Z', transaction_type: 'sell',
        quantity: 1, total_amount: 1000, realized_profit: 1000, holding_id: 'e', currency: 'TRY',
      }],
    });
    expect(m.daily.find(d => d.date === '2026-06-11')?.gainEUR).toBeCloseTo(0, 4);
    expect(m.daily.find(d => d.date === '2026-06-12')?.gainEUR).toBeCloseTo(20, 4);
  });

  it('3 — ay içi alış, ay başı adedinin fiyat farkını yazmaz', () => {
    const txs = [{ date: '2026-10-15', type: 'buy', quantity: 100 }];
    expect(qtyAsOf(200, txs, '2026-09-30')).toBe(100);
    expect(heldPriceMove(100, 10, 12)).toBe(200);
    expect(heldPriceMove(200, 10, 12)).toBe(400);
  });

  it('4 — kalan hak çekim günündeki euroyu kullanır, 1,15 yok', () => {
    expect(remainingEntitlementEUR(600, 0)).toBeCloseTo(entitlementEUR(600), 6);
    expect(remainingEntitlementEUR(600, 0)).toBeCloseTo(510, 6);
    const map = withdrawnMap(
      [{ withdrawn_at: '2026-09-15T10:00:00Z', amount_usd: 1162.79 }],
      [{ recorded_at: '2026-09-15', rate: 50 }, { recorded_at: '2026-10-13', rate: 52 }],
      [{ recorded_at: '2026-09-15', rate: 43 }, { recorded_at: '2026-10-13', rate: 44 }],
    );
    expect(map.get('2026-09')).toBeCloseTo(1162.79 * 43 / 50, 2);
    const today = withdrawalEUR({ amount_usd: 1162.79 }, 52, 44);
    expect(today).toBeCloseTo(1162.79 * 44 / 52, 2);
    expect(map.get('2026-09')).not.toBeCloseTo(today, 0);
    expect(map.get('2026-09')).not.toBeCloseTo(1162.79 / 1.15, 0);
    expect(withdrawalEUR({ amount_eur: 1000, amount_usd: 1162.79 }, 52, 44)).toBe(1000);
  });

  it('5 — açık ayın enflasyonu gün oranındadır', () => {
    const daily = [
      { date: '2026-10-01', gainEUR: 0, wealthEUR: 180_000 },
      { date: '2026-10-02', gainEUR: 50, wealthEUR: 180_050 },
    ];
    const mRate = Math.pow(1.02, 1 / 12) - 1;
    const full = 180_000 * mRate;
    const open = monthlyRows(daily, 0.02, { today: '2026-10-02', carryResetFrom: null })[0];
    expect(open.openMonth).toBe(true);
    expect(open.inflationEUR).toBeCloseTo(full * (2 / 31), 4);
    expect(open.realGainEUR).toBeCloseTo(50 - full * (2 / 31), 4);
    const closed = monthlyRows(daily, 0.02, { carryResetFrom: null })[0];
    expect(closed.inflationEUR).toBeCloseTo(full, 4);
    expect(closed.openMonth).toBe(false);
  });

  it('6 — snapshot olmayan ay enflasyon alır ve uyarı taşır', () => {
    const m = buildEurModel({
      ...base,
      asOf: '2026-08-15',
      snapshots: [snap('2026-06-30', 180_000 * 50, 180_000 * 50), snap('2026-08-01', 180_000 * 50, 180_000 * 50)],
      eurRates: [{ recorded_at: '2026-06-30', rate: 50 }, { recorded_at: '2026-08-01', rate: 50 }],
      usdRates: [{ recorded_at: '2026-06-30', rate: 43 }, { recorded_at: '2026-08-01', rate: 43 }],
      transactions: [], cashSells: [], holdings: [],
    });
    const july = m.months.find(x => x.month === '2026-07');
    expect(july?.gapFilled).toBe(true);
    expect(july?.gainEUR).toBe(0);
    expect(july?.maxHoleDays).toBe(31);
    const mRate = Math.pow(1.02, 1 / 12) - 1;
    expect(july?.inflationEUR).toBeCloseTo(180_000 * mRate, 2);
  });

  it('7 — boş euro serisi usd ile çarpılmaz', () => {
    const m = buildEurModel({
      ...base,
      usdNow: 44,
      snapshots: [snap('2026-10-01', 100_000, 100_000), snap('2026-10-02', 100_000, 100_000)],
      eurRates: [],
      usdRates: [{ recorded_at: '2026-10-01', rate: 44 }, { recorded_at: '2026-10-02', rate: 44 }],
      transactions: [], cashSells: [], holdings: [],
    });
    expect(m.health.missingEurRate).toBe(true);
    expect(m.health.ok).toBe(false);
    expect(Number.isNaN(m.daily[1].eurRate)).toBe(true);
    expect(m.daily[1].eurRate).not.toBeCloseTo(44 * 1.15, 1);
  });

  it('8 — kısmi USD satış notu ikinci kez sayılmaz', () => {
    const m = buildEurModel({
      ...base,
      usdNow: 43,
      snapshots: [snap('2026-09-01', 100_000, 100_000), snap('2026-09-02', 100_000, 100_000)],
      eurRates: [{ recorded_at: '2026-09-01', rate: 50 }, { recorded_at: '2026-09-02', rate: 50 }],
      usdRates: [{ recorded_at: '2026-09-01', rate: 43 }, { recorded_at: '2026-09-02', rate: 43 }],
      holdings: [{ id: 'u', currency: 'USD', quantity: 10, purchase_price: 10, created_at: '2026-08-01T00:00:00Z' }],
      transactions: [{
        transaction_date: '2026-09-02T12:00:00Z', transaction_type: 'sell',
        quantity: 1, total_amount: 200, realized_profit: 200, holding_id: 'u', currency: 'USD',
      }],
      cashSells: [{ created_at: '2026-09-02T12:00:01Z', currency: 'TRY', notes: 'K/Z +200', related_holding_id: 'u' }],
    });
    expect(m.health.duplicateAdjustments).toBe(1);
    expect(m.daily.find(d => d.date === '2026-09-02')?.gainEUR).toBeCloseTo(172, 4);
  });

  it('9 — varsayılan enflasyon %3, ayar 0–%25 dışında varsayılana döner', () => {
    expect(INFLATION_EUR).toBe(0.03);
    expect(normalizeInflation(undefined)).toBe(0.03);
    expect(normalizeInflation(0.02)).toBe(0.02);
    expect(normalizeInflation(9)).toBe(0.03);
  });

  it('10 — görünen kâr fiyat çarpı adet eksi maliyettir; ASML eurodur', () => {
    const pnl = nativeUnrealized({ symbol: 'ASML', currency: 'EUR', quantity: 2, purchase_price: 600, current_price: 679.285 });
    expect(pnl.pnl).toBeCloseTo(158.57, 2);
    expect(pnl.currency).toBe('EUR');
    expect(displayCurrency({ symbol: 'ASML', currency: '' })).toBe('EUR');
    expect(displayCurrency({ symbol: 'GARAN', currency: '' })).toBe('TRY');
  });

  it('11 — euro kasa farkı hareketlerden görünür', () => {
    const rows = [
      { currency: 'EUR', transaction_type: 'deposit', amount: 23001.99 },
      { currency: 'EUR', transaction_type: 'withdrawal', amount: 7550 },
      { currency: 'EUR', transaction_type: 'buy', amount: 29544.30 },
      { currency: 'EUR', transaction_type: 'sell', amount: 7550 },
      { currency: 'EUR', transaction_type: 'transfer', amount: 4930 },
    ];
    const eur = ledgerFromTransactions(rows).find(r => r.currency === 'EUR');
    expect(eur?.balance).toBeCloseTo(-1612.31, 2);
    expect(balanceGap(0, eur?.balance ?? 0)).toBeCloseTo(-1612.31, 2);
    expect(eur?.deposits).toBeCloseTo(23001.99, 2);
  });
});
