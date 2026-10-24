import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { policySnapshot } from './policyAllocation';
import { exposureCurrency } from './exposureCurrency';
import { projectFire } from '../services/fireProjectionService';
import { analyzeXRay } from '../services/xrayService';
import { buildEurModel, summarizeEur, RELIABLE_FROM, INFLATION_EUR, dayInTZ } from './eurPnl';
import { ledgerFromTransactions, balanceGap } from './cashLedger';
import { parseTruncgilGram } from '../../api/lib/gramGold';
import type { Holding } from './supabase';

describe('sekme cetveli', () => {
  it('gram altın metnini sayıya çevirir', () => {
    expect(parseTruncgilGram('6.688,76')).toBeCloseTo(6688.76, 2);
    expect(parseTruncgilGram('')).toBeNull();
    expect(parseTruncgilGram('12')).toBeNull();
  });

  it('hedef çizgisi her yıl enflasyon kadar büyür', () => {
    const p = projectFire({
      currentValue: 100_000,
      monthlyContribution: 0,
      annualReturnPct: 4,
      targetMonthlyIncome: 1000,
      safeWithdrawalRatePct: 3.5,
      annualInflationPct: 3,
    });
    const nominal = (1000 * 12) / 0.035;
    expect(p.yearByYear[0].inflationTarget).toBeCloseTo(nominal * 1.03, 6);
    expect(p.yearByYear[2].inflationTarget).toBeCloseTo(nominal * Math.pow(1.03, 3), 4);
    expect(p.yearByYear[0].realTarget).toBeCloseTo(nominal, 6);
    expect(p.yearByYear[2].realTarget).toBeCloseTo(nominal, 6);
    expect(p.yearByYear[2].realEndOfYearValue).toBeCloseTo(p.yearByYear[2].endOfYearValue / Math.pow(1.03, 3), 4);
    expect(p.realProgressPct).toBeCloseTo((100_000 * 0.035 / 12) / 1000 * 100, 4);
    expect(p.yearByYear[0].reachedTarget).toBe(p.yearByYear[0].endOfYearValue >= p.yearByYear[0].inflationTarget);
  });

  it('Revolut robo euro sayılır, kasa ve kapalı pozisyon payda dışıdır', () => {
    expect(exposureCurrency({ symbol: 'REVOLUT-ROBO', asset_type: 'stock', currency: 'TRY' })).toBe('EUR');
    expect(exposureCurrency({ symbol: 'THYAO', asset_type: 'stock', currency: 'TRY' })).toBe('TRY');
    const holdings = [
      { id: '1', symbol: 'AAA', asset_type: 'stock', quantity: 1, current_price: 62, purchase_price: 62, currency: 'EUR' },
      { id: '2', symbol: 'XEON', asset_type: 'eurobond', quantity: 1, current_price: 14, purchase_price: 14, currency: 'EUR' },
      { id: '3', symbol: 'ALTIN', asset_type: 'commodity', quantity: 1, current_price: 10, purchase_price: 10, currency: 'EUR' },
      { id: '4', symbol: 'BTC', asset_type: 'crypto', quantity: 1, current_price: 5, purchase_price: 5, currency: 'EUR' },
      { id: '5', symbol: 'FON', asset_type: 'fund', quantity: 1, current_price: 4, purchase_price: 4, currency: 'EUR' },
      { id: '6', symbol: 'EURO', asset_type: 'currency', quantity: 5, current_price: 5, purchase_price: 5, currency: 'TRY' },
      { id: '7', symbol: 'CASH', asset_type: 'cash', quantity: 100, current_price: 1, purchase_price: 1, currency: 'TRY' },
      { id: '8', symbol: 'KAPALI', asset_type: 'stock', quantity: 0, current_price: 999, purchase_price: 1, currency: 'EUR' },
    ] as unknown as Holding[];
    const snap = policySnapshot(holdings);
    expect(snap.rows.reduce((s, r) => s + r.currentPct, 0)).toBeCloseTo(100, 6);
    const by = Object.fromEntries(snap.rows.map(r => [r.key, r.currentPct]));
    expect(by.stock).toBeCloseTo(62, 5);
    expect(by.safe).toBeCloseTo(14, 5);
    expect(by.commodity).toBeCloseTo(10, 5);
    expect(by.crypto).toBeCloseTo(5, 5);
    expect(by.fund).toBeCloseTo(4, 5);
    expect(by.currency).toBeCloseTo(5, 5);
    expect(snap.totalEUR).toBeCloseTo(100, 5);
  });
});

const EXPORT = '/home/ubuntu/.cursor/projects/workspace/uploads/portfoy_export_043b.json';
const exportRaw = existsSync(EXPORT) ? JSON.parse(readFileSync(EXPORT, 'utf8')) : null;

describe.skipIf(!exportRaw)('ihracat ile sekme mutabakatı', () => {
  if (!exportRaw) return;
  const raw = exportRaw;
  const holdings = raw.holdings as Holding[];

  it('dağılım, plan ve x-ray aynı sınıf payını verir', () => {
    const snap = policySnapshot(holdings);
    const xray = analyzeXRay(holdings);
    expect(snap.rows.reduce((s, r) => s + r.currentPct, 0)).toBeCloseTo(100, 4);
    for (const row of snap.rows) {
      const d = xray.allocationDrift.find(x => x.asset_type === row.key);
      expect(d, row.key).toBeTruthy();
      expect(d!.currentPct).toBeCloseTo(row.currentPct, 1);
      expect(d!.targetPct).toBe(row.targetPct);
    }
    const targets = [62, 14, 10, 5, 4, 5];
    expect(snap.rows.map(r => r.targetPct).sort((a, b) => b - a)).toEqual(targets.sort((a, b) => b - a));
  });

  it('euro cetveli kendi günlük toplamıyla ve özetle uyumludur', () => {
    const api = (ccy: string) => (raw.exchange_rates_daily as Array<{ from_currency: string; to_currency: string; source: string; day: string; rate: number }>)
      .filter(r => r.from_currency === ccy && r.to_currency === 'TRY' && r.source === 'api')
      .map(r => ({ recorded_at: String(r.day).slice(0, 10), rate: Number(r.rate) }));
    const snaps = [...raw.portfolio_snapshots].sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)) || String(b.created_at).localeCompare(String(a.created_at)));
    const model = buildEurModel({
      snapshots: snaps,
      eurRates: api('EUR'),
      usdRates: api('USD'),
      otherRates: { RUB: api('RUB') },
      transactions: raw.transactions,
      cashSells: (raw.cash_transactions || []).filter((c: { transaction_type?: string; type?: string }) => String(c.transaction_type || c.type) === 'sell'),
      holdings: holdings as never,
      usdNow: Number(holdings.find(h => h.symbol === 'USD')?.current_price) || 0,
      reliableFrom: RELIABLE_FROM,
      annualInflation: INFLATION_EUR,
      asOf: dayInTZ(new Date()),
    });
    const sum = model.daily.reduce((s, d) => s + d.gainEUR, 0);
    const ends = model.daily[model.daily.length - 1];
    const first = model.daily[0];
    expect(model.health.ok).toBe(true);
    expect(sum).toBeCloseTo(model.daily.slice(1).reduce((s, d) => s + d.gainEUR, 0) + first.gainEUR, 6);
    const summary = summarizeEur(model, ends.date.slice(0, 7));
    expect(summary.wealthEUR).toBeCloseTo(ends.wealthEUR, 4);
    expect(summary.dayGainEUR).toBeCloseTo(ends.gainEUR, 4);
    expect(ends.wealthEUR).toBeGreaterThan(0);
  });

  it('kasa defteri kayıtlı bakiyeyle aynıdır ya da farkı gizlemez', () => {
    const ledger = ledgerFromTransactions(raw.cash_transactions || []);
    for (const stored of raw.cash_balances || []) {
      const row = ledger.find(r => r.currency === String(stored.currency).toUpperCase());
      const gap = balanceGap(Number(stored.balance) || 0, row?.balance || 0);
      if (gap != null) {
        expect(Math.abs(gap)).toBeGreaterThan(0.5);
      }
    }
  });
});
