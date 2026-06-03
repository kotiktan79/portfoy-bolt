import { describe, it, expect } from 'vitest';
import { computeRiskMetrics } from '../services/riskMetricsService';
import { generateRebalancingTrades, Holding } from '../services/rebalancingService';
import { fxToTRY, holdingValueTRY, getFxRatesFromHoldings } from './fx';
import { calculateRealizedPnL } from '../services/transactionService';

/*
  Known-answer verification for the recently-changed calculation logic that had
  NO numeric tests: deposit-adjusted risk metrics, deposit-clean drawdown, and
  foreign-currency rebalancing share counts. Expected values are hand-derived in
  the comments so a regression is caught with the exact wrong number.
*/

describe('riskMetrics: deposit adjustment (hand-derived)', () => {
  // d1 1000(dep0) → d2 1100(dep0) → d3 2100(dep1000) → d4 1900(dep1000)
  // r2=(1100-1000-0)/1000=+0.10
  // r3=(2100-1100-1000)/1100=0   (pure deposit day → 0 gain)
  // r4=(1900-2100-0)/2100=-0.0952381
  const snaps = [
    { date: '2026-01-04', total_value: 1900, total_investment: 0, total_pnl: 0, pnl_percentage: 0, total_deposits: 1000, total_withdrawals: 0 },
    { date: '2026-01-01', total_value: 1000, total_investment: 0, total_pnl: 0, pnl_percentage: 0, total_deposits: 0, total_withdrawals: 0 },
    { date: '2026-01-03', total_value: 2100, total_investment: 0, total_pnl: 0, pnl_percentage: 0, total_deposits: 1000, total_withdrawals: 0 },
    { date: '2026-01-02', total_value: 1100, total_investment: 0, total_pnl: 0, pnl_percentage: 0, total_deposits: 0, total_withdrawals: 0 },
  ];
  const m = computeRiskMetrics(snaps)!;

  it('deposit-only day yields exactly 0 return (no contamination)', () => {
    expect(m.dailyReturns[1]).toBeCloseTo(0, 10);
  });
  it('daily returns match hand calc', () => {
    expect(m.dailyReturns[0]).toBeCloseTo(0.10, 8);
    expect(m.dailyReturns[2]).toBeCloseTo(-0.0952381, 6);
    expect(m.observationDays).toBe(3);
  });
  it('positive-days% = 1/3 (deposit day not counted positive)', () => {
    expect(m.positiveDaysPct).toBeCloseTo(33.3333, 3);
  });
  it('best/worst day TRY use deposit-adjusted gain', () => {
    expect(m.bestDay!.changeTry).toBeCloseTo(100, 6);   // d2: 1100-1000-0
    expect(m.worstDay!.changeTry).toBeCloseTo(-200, 6); // d4: 1900-2100-0
  });
  it('max drawdown on deposit-clean index = 9.5238% / ~104.76 TRY', () => {
    // index: 1, 1.1, 1.1, 0.995238; peak 1.1 (value 1100), trough 0.995238
    // dd = (1.1-0.995238)/1.1 = 9.5238%; ddTry = 0.095238*1100 = 104.76
    expect(m.maxDrawdownPct).toBeCloseTo(9.5238, 3);
    expect(m.maxDrawdownValueTry).toBeCloseTo(104.76, 1);
  });
});

describe('fx: real IB01 EUR holding converts to TRY correctly', () => {
  // Live: EURO currency holding current_price=53.46 → EUR/TRY rate.
  // IB01: qty 17.13216196, price 103.6386 EUR.
  const holdings = [
    { symbol: 'EURO', asset_type: 'currency', quantity: 37550, current_price: 53.4644, purchase_price: 47.63, currency: 'TRY' },
    { symbol: 'USD', asset_type: 'currency', quantity: 34000, current_price: 45.9603, purchase_price: 38.2, currency: 'TRY' },
    { symbol: 'IB01', asset_type: 'eurobond', quantity: 17.13216196, current_price: 103.6386, purchase_price: 105.0666, currency: 'EUR' },
  ] as never[];
  const rates = getFxRatesFromHoldings(holdings);

  it('EUR rate picked from EURO currency holding', () => {
    expect(rates.eur).toBeCloseTo(53.4644, 4);
    expect(rates.usd).toBeCloseTo(45.9603, 4);
  });
  it('IB01 TRY value = qty*price*eurRate', () => {
    const expected = 17.13216196 * 103.6386 * 53.4644; // ≈ 94926 TRY
    expect(holdingValueTRY(holdings[2], rates)).toBeCloseTo(expected, 2);
  });
  it('fxToTRY round-trips through EUR rate', () => {
    expect(fxToTRY(100, 'EUR', rates)).toBeCloseTo(5346.44, 2);
    expect(fxToTRY(100, 'TRY', rates)).toBe(100);
  });
});

describe('transactionService: realized PnL on partial sell (average-cost)', () => {
  // buy 10@100 + buy 10@200 → avgCost 150. Sell 5@300 → realized = 1500 - 150*5 = 750.
  // Old (buggy) full-buy-cost method gave 1500 - 3000 = -1500.
  const txs = [
    { transaction_type: 'buy', quantity: 10, price: 100, total_amount: 1000, fee: 0, transaction_date: '2026-01-01' },
    { transaction_type: 'buy', quantity: 10, price: 200, total_amount: 2000, fee: 0, transaction_date: '2026-01-02' },
    { transaction_type: 'sell', quantity: 5, price: 300, total_amount: 1500, fee: 0, transaction_date: '2026-01-03' },
  ] as never[];
  it('only the cost basis of SOLD shares is realized (= 750, not -1500)', () => {
    expect(calculateRealizedPnL(txs)).toBeCloseTo(750, 6);
  });
  it('no sells → 0', () => {
    expect(calculateRealizedPnL([txs[0]])).toBe(0);
  });
});

describe('rebalancing: foreign-currency share count (FX-correct)', () => {
  const usdRate = 45;
  const holdings: Holding[] = [
    { id: '1', symbol: 'USD', asset_type: 'currency', quantity: 1000, current_price: usdRate, purchase_price: usdRate, currency: 'TRY' },
    { id: '2', symbol: 'AAPL', asset_type: 'stock', quantity: 1, current_price: 100, purchase_price: 100, currency: 'USD' },
  ];
  // value: USD cash 45000 TRY, AAPL 100*45=4500 TRY, total 49500. Stock 9.09% now.
  const trades = generateRebalancingTrades(holdings, { stock: 90, currency: 10 }, 0);
  const buy = trades.find(t => t.asset_type === 'stock' && t.action === 'buy')!;

  it('a buy trade for the USD stock is generated', () => {
    expect(buy).toBeDefined();
    expect(buy.current_price).toBe(100); // native USD price
  });
  it('shares * nativePrice * usdRate ≈ TRY amount (no 45x overstatement)', () => {
    // The bug being guarded: shares = amountTRY/100 would be 45x too many.
    expect(buy.shares * buy.current_price * usdRate).toBeCloseTo(buy.amount, 2);
    // sanity: shares are small (a few units), not thousands
    expect(buy.shares).toBeLessThan(buy.amount / (100 * usdRate) + 1);
  });
});
