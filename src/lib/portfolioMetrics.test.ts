import { describe, it, expect } from 'vitest';
import { Holding } from './supabase';
import {
  computePortfolioMetrics,
  computeClassMetrics,
  computePeriodChange,
  computeIntradayChange,
  computeDynamicWithdrawal,
  computeSafeSalaryFromProfit,
  topWinners,
  topLosers,
} from './portfolioMetrics';

// Test fixtures
function makeHolding(overrides: Partial<Holding>): Holding {
  return {
    id: overrides.id || crypto.randomUUID(),
    symbol: 'TEST',
    asset_type: 'stock',
    purchase_price: 100,
    quantity: 1,
    current_price: 100,
    currency: 'TRY',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

// USD ve EUR holding'ler (FX kaynağı için)
const usdHolding = makeHolding({ symbol: 'USD', asset_type: 'currency', current_price: 45, quantity: 100, purchase_price: 30 });
const eurHolding = makeHolding({ symbol: 'EURO', asset_type: 'currency', current_price: 50, quantity: 100, purchase_price: 35 });

describe('computePortfolioMetrics', () => {
  it('1. boş portföy → tüm değerler 0', () => {
    const m = computePortfolioMetrics([]);
    expect(m.totalValueTRY).toBe(0);
    expect(m.totalCostTRY).toBe(0);
    expect(m.totalPnLTRY).toBe(0);
    expect(m.totalPnLPct).toBe(0);
    expect(m.holdingCount).toBe(0);
  });

  it('2. tek TRY holding — value, cost, pnl doğru', () => {
    const h = makeHolding({ purchase_price: 100, current_price: 120, quantity: 10, currency: 'TRY' });
    const m = computePortfolioMetrics([h]);
    expect(m.totalValueTRY).toBe(1200);
    expect(m.totalCostTRY).toBe(1000);
    expect(m.totalPnLTRY).toBe(200);
    expect(m.totalPnLPct).toBe(20);
  });

  it('3. tek USD holding — TRY karşılığı doğru çevrilir', () => {
    const jnj = makeHolding({ symbol: 'JNJ', currency: 'USD', purchase_price: 200, current_price: 220, quantity: 5 });
    // jnj cost = 5×200 = $1000 = ₺45000
    // jnj value = 5×220 = $1100 = ₺49500
    // + usd cash (currency=TRY default, 100×45=4500 cost vs 100×45=4500 value), wait usd holding has TRY currency default
    // Actually with our makeHolding default currency=TRY, USD holding represents itself as TRY-valued
    // Bu test sadece JNJ açısından doğru olmalı
    const justJnj = computePortfolioMetrics([usdHolding, jnj]);
    // jnj contribution: cost ₺45000 value ₺49500
    expect(justJnj.totalCostTRY).toBeGreaterThan(45000 - 100);
    expect(justJnj.totalValueTRY).toBeGreaterThan(49500 - 100);
  });

  it('4. karma currency — TRY+USD+EUR birlikte normalize edilir', () => {
    const bist = makeHolding({ symbol: 'BIST', currency: 'TRY', purchase_price: 100, current_price: 150, quantity: 100 });
    const us = makeHolding({ symbol: 'US', currency: 'USD', purchase_price: 10, current_price: 11, quantity: 50 });
    const eu = makeHolding({ symbol: 'EU', currency: 'EUR', purchase_price: 20, current_price: 22, quantity: 25 });
    const m = computePortfolioMetrics([usdHolding, eurHolding, bist, us, eu]);
    // bist: cost 10000, value 15000 (TRY)
    // us:   $500 = ₺22500 cost, $550 = ₺24750 value
    // eu:   €500 = ₺25000 cost, €550 = ₺27500 value
    // usdHolding (currency=TRY): cost 3000, value 4500
    // eurHolding (currency=TRY): cost 3500, value 5000
    // Toplam cost: 64000, value: 76750
    expect(m.totalCostTRY).toBeCloseTo(64000, -1);
    expect(m.totalValueTRY).toBeCloseTo(76750, -1);
    expect(m.totalPnLTRY).toBeCloseTo(12750, -1);
  });

  it('5. sıfır quantity / sıfır price edge — NaN üretmemeli', () => {
    const zeroQty = makeHolding({ purchase_price: 100, current_price: 120, quantity: 0 });
    const zeroPrice = makeHolding({ purchase_price: 0, current_price: 100, quantity: 10 });
    const m = computePortfolioMetrics([zeroQty, zeroPrice]);
    expect(isFinite(m.totalValueTRY)).toBe(true);
    expect(isFinite(m.totalPnLPct)).toBe(true);
  });

  it('6. negative PnL — düşüş doğru hesaplanır', () => {
    const h = makeHolding({ purchase_price: 200, current_price: 150, quantity: 10 });
    const m = computePortfolioMetrics([h]);
    expect(m.totalPnLTRY).toBe(-500);
    expect(m.totalPnLPct).toBeCloseTo(-25);
  });

  it('7. >%100 kâr (BIST gibi) — doğru hesaplanır', () => {
    const h = makeHolding({ purchase_price: 100, current_price: 250, quantity: 10 });
    const m = computePortfolioMetrics([h]);
    expect(m.totalPnLPct).toBe(150);
  });

  it('8. cash holding hariç tutuluyor', () => {
    const cash = makeHolding({ symbol: 'CASH', asset_type: 'cash', purchase_price: 1, current_price: 1, quantity: 100000 });
    const stock = makeHolding({ symbol: 'X', purchase_price: 100, current_price: 120, quantity: 10 });
    const m = computePortfolioMetrics([cash, stock]);
    // Sadece stock sayılmalı
    expect(m.totalCostTRY).toBe(1000);
    expect(m.totalValueTRY).toBe(1200);
    expect(m.holdingCount).toBe(1);
  });
});

describe('computeClassMetrics', () => {
  it('9. asset class bazında ayrıştırır', () => {
    const stock = makeHolding({ asset_type: 'stock', purchase_price: 100, current_price: 120, quantity: 10 });
    const crypto = makeHolding({ asset_type: 'crypto', purchase_price: 1000, current_price: 1100, quantity: 1 });
    const result = computeClassMetrics([stock, crypto]);
    expect(result).toHaveLength(2);
    const s = result.find(r => r.asset_type === 'stock');
    const c = result.find(r => r.asset_type === 'crypto');
    expect(s?.valueTRY).toBe(1200);
    expect(s?.pnlTRY).toBe(200);
    expect(c?.valueTRY).toBe(1100);
  });
});

describe('computePeriodChange (kâr-bazlı)', () => {
  it('10. kâr deltası — fiyat hareketi', () => {
    // dün: değer 100K maliyet 80K → kâr 20K | bugün: değer 105K maliyet 80K → kâr 25K
    const prev = { total_value: 100000, total_investment: 80000 };
    const curr = { total_value: 105000, total_investment: 80000 };
    const p = computePeriodChange(curr, prev);
    expect(p.changeTRY).toBe(5000); // kâr 20K → 25K = +5K piyasa
    expect(p.changePct).toBeCloseTo(5);
  });

  it('11. YENİ PARA kârı etkilemez (kritik)', () => {
    // dün: değer 100K maliyet 80K → kâr 20K
    // bugün: €1000 yeni holding aldı → değer 110K maliyet 90K → kâr 20K (DEĞİŞMEDİ)
    const prev = { total_value: 100000, total_investment: 80000 };
    const curr = { total_value: 110000, total_investment: 90000 };
    const p = computePeriodChange(curr, prev);
    expect(p.changeTRY).toBe(0); // değer +10K arttı ama hepsi yeni para → PnL 0
    expect(p.changePct).toBe(0);
  });

  it('12. yeni para + piyasa hareketi birlikte', () => {
    // dün: kâr 20K | bugün: €10K yeni para + piyasa +%2 (2K kâr)
    const prev = { total_value: 100000, total_investment: 80000 };
    const curr = { total_value: 112000, total_investment: 90000 };
    // kâr: 20K → 22K = +2K (yeni para 10K dışlandı, sadece piyasa 2K)
    const p = computePeriodChange(curr, prev);
    expect(p.changeTRY).toBe(2000);
  });

  it('13. total_pnl alanı varsa onu kullanır', () => {
    const prev = { total_value: 100000, total_pnl: 20000 };
    const curr = { total_value: 105000, total_pnl: 24000 };
    expect(computePeriodChange(curr, prev).changeTRY).toBe(4000);
  });

  it('14. büyük sapma sanity — >%30 ise 0', () => {
    const prev = { total_value: 100000, total_investment: 80000 };
    const curr = { total_value: 200000, total_investment: 80000 }; // kâr 20K→120K = +100K = %100
    const p = computePeriodChange(curr, prev, 30);
    expect(p.changeTRY).toBe(0);
  });

  it('15. eksik snapshot — null güvenli', () => {
    expect(computePeriodChange(null, null).changeTRY).toBe(0);
    expect(computePeriodChange({ total_value: 100 }, null).changeTRY).toBe(0);
  });
});

describe('computeIntradayChange', () => {
  it('13. açılış-current sapma — per-holding sanity %25 sınırı', () => {
    const h = makeHolding({ current_price: 100, quantity: 10 });
    // Açılış 200 verilse de stale sayılır, current'a düşer → değişim 0
    const result = computeIntradayChange([h], { [h.id]: 200 });
    expect(result.changeTRY).toBe(0);
  });

  it('14. normal intraday hareket', () => {
    const h = makeHolding({ current_price: 110, quantity: 10 });
    // Açılış 100, şimdi 110 → +10% (sanity geçer çünkü 1.1 < 1.25)
    const result = computeIntradayChange([h], { [h.id]: 100 });
    expect(result.changeTRY).toBe(100);
    expect(result.changePct).toBeCloseTo(10);
  });
});

describe('computeDynamicWithdrawal', () => {
  it('16. pozitif büyüme — %85 güvenli max', () => {
    // 100 gün, $100K → $110K, yeni para yok → %10 büyüme, yıllık ~%36.5
    const snaps = [
      { snapshot_date: '2026-01-01', total_value: 4500000, total_deposits: 0, total_withdrawals: 0, usdRate: 45 },
      { snapshot_date: '2026-04-11', total_value: 4950000, total_deposits: 0, total_withdrawals: 0, usdRate: 45 },
    ];
    const r = computeDynamicWithdrawal(snaps);
    expect(r).not.toBeNull();
    expect(r!.status).toBe('positive');
    expect(r!.realGrowthUSD).toBeCloseTo(10000, -2); // ~$10K büyüme
    expect(r!.safeMonthlyUSD).toBeGreaterThan(0);
  });

  it('17. yeni para büyüme olarak sayılmaz', () => {
    // $100K → $110K ama $10K yeni para → reel büyüme ~0
    const snaps = [
      { snapshot_date: '2026-01-01', total_value: 4500000, total_deposits: 0, total_withdrawals: 0, usdRate: 45 },
      { snapshot_date: '2026-04-11', total_value: 4950000, total_deposits: 450000, total_withdrawals: 0, usdRate: 45 },
    ];
    const r = computeDynamicWithdrawal(snaps);
    expect(r!.realGrowthUSD).toBeCloseTo(0, -2);
  });

  it('18. negatif büyüme — güvenli max 0 (anaparaya dokunma)', () => {
    const snaps = [
      { snapshot_date: '2026-01-01', total_value: 5000000, total_deposits: 0, total_withdrawals: 0, usdRate: 45 },
      { snapshot_date: '2026-04-11', total_value: 4500000, total_deposits: 0, total_withdrawals: 0, usdRate: 45 },
    ];
    const r = computeDynamicWithdrawal(snaps);
    expect(r!.status).toBe('negative');
    expect(r!.safeMonthlyUSD).toBe(0);
  });

  it('19. TL erir ama USD sabit kalırsa — reel büyüme ~0', () => {
    // TL değeri %20 arttı ama kur da %20 arttı → USD sabit → reel büyüme yok
    const snaps = [
      { snapshot_date: '2026-01-01', total_value: 4500000, total_deposits: 0, total_withdrawals: 0, usdRate: 45 },
      { snapshot_date: '2026-04-11', total_value: 5400000, total_deposits: 0, total_withdrawals: 0, usdRate: 54 },
    ];
    const r = computeDynamicWithdrawal(snaps);
    // $100K → $100K, reel büyüme ~0
    expect(Math.abs(r!.realGrowthUSD)).toBeLessThan(100);
  });

  it('20. tek snapshot → null', () => {
    expect(computeDynamicWithdrawal([{ snapshot_date: '2026-01-01', total_value: 100, usdRate: 45 }])).toBeNull();
  });
});

describe('top winners/losers', () => {
  it('15. kazananlar pnlTRY desc sıralı', () => {
    const a = makeHolding({ symbol: 'A', purchase_price: 100, current_price: 200, quantity: 10 }); // +1000
    const b = makeHolding({ symbol: 'B', purchase_price: 100, current_price: 110, quantity: 10 }); // +100
    const c = makeHolding({ symbol: 'C', purchase_price: 100, current_price: 80, quantity: 10 }); // -200
    const winners = topWinners([a, b, c]);
    expect(winners[0].holding.symbol).toBe('A');
    expect(winners[1].holding.symbol).toBe('B');
    expect(winners.find(w => w.holding.symbol === 'C')).toBeUndefined();
    const losers = topLosers([a, b, c]);
    expect(losers[0].holding.symbol).toBe('C');
  });
});

describe('computeSafeSalaryFromProfit (biriken kâra göre)', () => {
  it('16. rezervuar ≤ 0 → maaş 0 (anapara altı)', () => {
    expect(computeSafeSalaryFromProfit(0, 150000)).toBe(0);
    expect(computeSafeSalaryFromProfit(-5000, 150000)).toBe(0);
  });
  it('17. küçük rezervuar → biriken-kâr tavanı bağlar (rezervuar/48)', () => {
    // reservoir 24000 → 24000/48 = 500; SWR 150000*0.04/12 = 500 → min 500
    expect(computeSafeSalaryFromProfit(24000, 150000)).toBeCloseTo(500, 0);
  });
  it('18. büyük rezervuar → SWR tavanı bağlar (portföyün %4/12), şişmez', () => {
    // reservoir 100000/48 = 2083 ama SWR 150000*0.04/12 = 500 → min 500
    expect(computeSafeSalaryFromProfit(100000, 150000)).toBeCloseTo(500, 0);
  });
});
