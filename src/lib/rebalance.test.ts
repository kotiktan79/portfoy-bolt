import { describe, it, expect } from 'vitest';
import { planRebalance } from './rebalance';
import { TARGET_ALLOCATION, allocationClassOf, effectiveAssetType, TARGET_PCT } from '../config/portfolioPolicy';

const atTarget = {
  stock: 62, safe: 14, commodity: 10, crypto: 5, fund: 4, currency: 5,
};

describe('hedef bantlar', () => {
  it('62/14/10/5/4/5 eder ve 100\'e tamamlanır', () => {
    const sum = Object.values(TARGET_PCT).reduce((s, n) => s + n, 0);
    expect(sum).toBe(100);
    expect(TARGET_ALLOCATION.stock).toEqual({ min: 57, max: 67, target: 62 });
    expect(TARGET_ALLOCATION.safe).toEqual({ min: 9, max: 19, target: 14 });
    expect(TARGET_ALLOCATION.commodity).toEqual({ min: 5, max: 15, target: 10 });
    expect(TARGET_ALLOCATION.crypto).toEqual({ min: 2, max: 8, target: 5 });
    expect(TARGET_ALLOCATION.fund).toEqual({ min: 2, max: 6, target: 4 });
    expect(TARGET_ALLOCATION.currency).toEqual({ min: 2, max: 8, target: 5 });
  });

  it('XEON para piyasası, IB01 hazine bonosu; ikisi de güvenli tarafta, eurobond diliminde değil', () => {
    expect(effectiveAssetType('eurobond', 'XEON')).toBe('money_market');
    expect(effectiveAssetType('eurobond', 'IB01')).toBe('treasury_etf');
    expect(allocationClassOf('eurobond', 'XEON')).toBe('safe');
    expect(allocationClassOf('eurobond', 'IB01')).toBe('safe');
    expect(allocationClassOf('eurobond', 'TR-EUROBOND-2Y')).toBe('safe');
    expect(allocationClassOf('cash', 'KASA')).toBeNull();
  });
});

describe('planRebalance', () => {
  it('hedefteki portföyde satış veya alım tutarı yok', () => {
    const { actions, rows } = planRebalance({ valuesEUR: atTarget, asOf: new Date('2026-10-13T12:00:00Z') });
    expect(rows.every(r => !r.outsideBand)).toBe(true);
    expect(actions.filter(a => a.kind === 'trade' || a.kind === 'dilute' || a.kind === 'transfer')).toHaveLength(0);
    expect(actions.find(a => a.kind === 'annual')).toBeUndefined();
  });

  it('Ocak ayında yıllık dengeleme kartı çıkar', () => {
    const jan = planRebalance({ valuesEUR: atTarget, asOf: new Date('2027-01-15T12:00:00Z') });
    expect(jan.annual).toBe(true);
    expect(jan.actions[0].title).toMatch(/Yıllık dengeleme/);
    const oct = planRebalance({ valuesEUR: atTarget, asOf: new Date('2026-10-13T12:00:00Z') });
    expect(oct.annual).toBe(false);
  });

  it('bant dışı ama ±10\'un içinde: maaş ve yeni para, somut satış yok', () => {
    // hisse 70 (bant 67, sapma +8), nakit 0 → hisse fazla, nakit geride
    const total = 100;
    const { actions } = planRebalance({
      valuesEUR: { stock: 70, safe: 14, commodity: 10, crypto: 5, fund: 1, currency: 0 },
      asOf: new Date('2026-06-01T12:00:00Z'),
    });
    void total;
    expect(actions.find(a => a.kind === 'salary')!.title).toMatch(/hisse kârından/);
    expect(actions.find(a => a.kind === 'direct')).toBeDefined();
    expect(actions.filter(a => a.kind === 'trade')).toHaveLength(0);
    const salary = actions.findIndex(a => a.kind === 'salary');
    const direct = actions.findIndex(a => a.kind === 'direct');
    expect(salary).toBeLessThan(direct);
  });

  it('±10 puanı geçince somut tutar önerir; altın için satış yazmaz', () => {
    // 1000 € portföy: altın 250 = %25 (sapma +15), hisse 470 = %47 (sapma −15)
    const { actions } = planRebalance({
      valuesEUR: { stock: 470, safe: 140, commodity: 250, crypto: 50, fund: 40, currency: 50 },
      xeonEUR: 80,
      asOf: new Date('2026-06-01T12:00:00Z'),
    });
    const gold = actions.find(a => a.id === 'dilute-commodity')!;
    expect(gold).toBeDefined();
    expect(gold.kind).toBe('dilute');
    expect(gold.title.toLowerCase()).not.toMatch(/sat/);
    expect(gold.detail.toLowerCase()).not.toMatch(/satış yok|satış/);
    expect(gold.detail).toMatch(/seyrelt/);
    expect(gold.amountEUR).toBe(0);
    expect(actions.find(a => a.id === 'sell-commodity')).toBeUndefined();

    const buyStock = actions.find(a => a.id === 'buy-stock')!;
    expect(buyStock.kind).toBe('trade');
    expect(buyStock.amountEUR).toBeCloseTo(620 - 470, 5);   // hedef %62
    // hisse %47 < %57 → XEON aktarımı alt banda (570) kadar, XEON bakiyesiyle sınırlı
    const xfer = actions.find(a => a.kind === 'transfer')!;
    expect(xfer.amountEUR).toBeCloseTo(80, 5);
    expect(xfer.title).toMatch(/XEON/);
  });

  it('hisse %57 altındayken XEON aktarımı, XEON yoksa tutar 0 ve satır yok', () => {
    const withXeon = planRebalance({
      valuesEUR: { stock: 50, safe: 20, commodity: 10, crypto: 5, fund: 5, currency: 10 },
      xeonEUR: 6,
    });
    // alt bant %57 × 100 = 57, hisse 50, ihtiyaç 7 ama XEON 6
    expect(withXeon.actions.find(a => a.kind === 'transfer')!.amountEUR).toBeCloseTo(6, 5);

    const noXeon = planRebalance({
      valuesEUR: { stock: 50, safe: 20, commodity: 10, crypto: 5, fund: 5, currency: 10 },
      xeonEUR: 0,
    });
    expect(noXeon.actions.find(a => a.kind === 'transfer')).toBeUndefined();
  });

  it('kasa bakiyesi hesaba girmez', () => {
    const { totalEUR, rows } = planRebalance({
      valuesEUR: { ...atTarget, kasa: 29_400 } as never,
    });
    expect(totalEUR).toBe(100);
    expect(rows.find(r => r.key === 'currency')!.currentPct).toBeCloseTo(5, 5);
  });

  it('satış önerisi, maaş ve yeni para önerisinden sonra gelir', () => {
    const { actions } = planRebalance({
      valuesEUR: { stock: 800, safe: 50, commodity: 50, crypto: 20, fund: 20, currency: 60 },
    });
    const order = actions.map(a => a.kind);
    const tradeAt = order.indexOf('trade');
    expect(tradeAt).toBeGreaterThan(order.indexOf('salary'));
    expect(tradeAt).toBeGreaterThan(order.indexOf('direct'));
  });
});
