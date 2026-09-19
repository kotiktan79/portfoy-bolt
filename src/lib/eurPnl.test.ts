import { describe, it, expect } from 'vitest';
import { makeRateSeries, eurGainBetween, fxDriftTRY, monthlyRows } from './eurPnl';

const eur = makeRateSeries([{ date: '2026-08-01', rate: 54.7 }, { date: '2026-08-31', rate: 55.94 }], 55);
const usd = makeRateSeries([{ date: '2026-08-01', rate: 47.5 }, { date: '2026-08-31', rate: 48.25 }], 48);

describe('eurPnl', () => {
  it('(a) USD nakit $34K sabit, USD/TRY +%1,6, EUR/TRY +%2,3 → EUR kâr = EUR/USD kaymasından ibaret (küçük −)', () => {
    const a = { date: '2026-08-01', totalValue: 34000 * 47.5, totalInvestment: 34000 * 38.2 };
    const b = { date: '2026-08-31', totalValue: 34000 * 48.25, totalInvestment: 34000 * 38.2 };
    const g = eurGainBetween(a, b, eur);
    // $34.000: 34000×47.5/54.7 = €29.525 → 34000×48.25/55.94 = €29.326 → −€199 (EUR güçlendi). Kur "kâr"ı YOK.
    expect(g).toBeCloseTo(34000 * 48.25 / 55.94 - 34000 * 47.5 / 54.7, 4);
    expect(Math.abs(g)).toBeLessThan(250);
  });
  it('(b) sadece EUR nakit €30.100, kur ne olursa olsun → kâr 0', () => {
    const a = { date: '2026-08-01', totalValue: 30100 * 54.7, totalInvestment: 30100 * 48 };
    const b = { date: '2026-08-31', totalValue: 30100 * 55.94, totalInvestment: 30100 * 48 };
    expect(eurGainBetween(a, b, eur)).toBeCloseTo(0, 6);
  });
  it('(c) yeni para kâr değil', () => {
    const a = { date: '2026-08-01', totalValue: 1_000_000, totalInvestment: 800_000 };
    const b = { date: '2026-08-31', totalValue: 1_000_000 * (55.94 / 54.7) + 100_000, totalInvestment: 900_000 };
    expect(eurGainBetween(a, b, eur)).toBeCloseTo(0, 6);
  });
  it('(d) satış: hasılat portföyde kalır, kâr değişmez (realize geri eklenir)', () => {
    const a = { date: '2026-08-01', totalValue: 130 * 54.7, totalInvestment: 100 * 54.7 };
    const b = { date: '2026-08-31', totalValue: 130 * 55.94, totalInvestment: 0 };
    const realizedTRY = 30 * 55.94;
    // maliyet 100→0 çıktı (Δ=−5470), realize +1678 → akış = −5470 − 1678 = −7148 TL = −€127.8 ← hasılatın kendisi (130€×55.94=7272; lot maliyeti farkı)
    const g = eurGainBetween(a, b, eur, { realizedTRY });
    expect(g).toBeCloseTo(130 - 130 - (0 - 100 * 54.7 - realizedTRY) / 55.94, 4);
  });
  it('(e) kur-drift: €7.188 V3YL maliyeti, EUR/TRY 54.7→55.94, alım yok → drift = 7188×1.24 TL; akıştan düşülünce kâr 0', () => {
    const a = { date: '2026-08-01', totalValue: 7188 * 54.7, totalInvestment: 7188 * 54.7 };
    const b = { date: '2026-08-31', totalValue: 7188 * 55.94, totalInvestment: 7188 * 55.94 }; // snapshot maliyeti kurla büyüdü
    const drift = fxDriftTRY([{ currency: 'EUR', costNative: 7188 }], '2026-08-01', '2026-08-31', usd, eur);
    expect(drift).toBeCloseTo(7188 * (55.94 - 54.7), 4);
    expect(eurGainBetween(a, b, eur, { fxDriftTRY: drift })).toBeCloseTo(0, 6);
    expect(eurGainBetween(a, b, eur)).toBeLessThan(-100); // drift düşülmezse sahte zarar
  });
  it('(f) aylık: enflasyon payı, zarar devri, maaş', () => {
    const daily = [
      { date: '2026-06-01', gainEUR: 0, wealthEUR: 150000 }, { date: '2026-06-30', gainEUR: -4000, wealthEUR: 146000 },
      { date: '2026-07-31', gainEUR: 1000, wealthEUR: 147000 }, { date: '2026-08-31', gainEUR: 3500, wealthEUR: 150500 },
    ];
    const rows = monthlyRows(daily, 0.02);
    const [jun, jul, aug] = rows;
    expect(jun.inflationEUR).toBeCloseTo(150000 * (Math.pow(1.02, 1 / 12) - 1), 4);
    expect(jun.withdrawableEUR).toBe(0); expect(jun.carryOutEUR).toBeLessThan(-4000);
    expect(jul.withdrawableEUR).toBe(0);                          // açık henüz kapanmadı
    expect(aug.carryInEUR).toBeCloseTo(jul.carryOutEUR, 6);
    expect(aug.salaryEUR).toBeCloseTo(0.85 * Math.max(0, aug.carryInEUR + aug.realGainEUR), 6);
  });
});
