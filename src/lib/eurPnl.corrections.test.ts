import { describe, it, expect } from 'vitest';
import { buildEurModel, type EurModelInput } from './eurPnl';

// VERİ DÜZELTMESİ KÂR/ZARAR DEĞİLDİR (2026-10-30). Kur sabit 50 TL/€ → TL tutarlar /50 = €.
const R = 50;
type Day = { date: string; V: number; I: number; prices: Record<string, number> };
function model(days: Day[], opts: {
  holdings: EurModelInput['holdings'];
  tx?: EurModelInput['transactions'];
  payouts?: EurModelInput['payouts'];
  withPrices?: boolean;
}) {
  const snapshots = [...days].map(d => ({ snapshot_date: d.date, total_value: d.V, total_investment: d.I, created_at: `${d.date}T18:00:00+00:00` }));
  const rates = days.map(d => ({ recorded_at: d.date, rate: R }));
  const holdingPrices = days.flatMap(d => Object.entries(d.prices).map(([id, price]) => ({ holding_id: id, price, recorded_at: `${d.date}T17:59:00+00:00` })));
  return buildEurModel({
    snapshots, eurRates: rates, usdRates: rates.map(r => ({ ...r, rate: 45 })), fxCloses: null, otherRates: {},
    transactions: opts.tx || [], cashSells: [], holdings: opts.holdings,
    usdNow: 45, reliableFrom: days[0].date, annualInflation: 0, asOf: days[days.length - 1].date,
    withdrawnByMonth: new Map(), payouts: opts.payouts || [],
    holdingPrices: opts.withPrices === false ? null : holdingPrices,
  });
}
const gainOn = (m: ReturnType<typeof model>, d: string) => m.daily.find(x => x.date === d)!.gainEUR;

describe('veri düzeltmesi kâr/zarar sayılmaz', () => {
  // A: 1000 adet, alış 100 TL; nakit TRY 50.000 (fiyat 1)
  const H = (qA = 1000, ppA = 100, created = '2026-01-01') => [
    { id: 'A', currency: 'TRY', quantity: qA, purchase_price: ppA, created_at: created },
    { id: 'C', currency: 'TRY', quantity: 50_000, purchase_price: 1, created_at: '2026-01-01' },
  ];
  const day = (date: string, pA: number, qA: number, ppA: number): Day =>
    ({ date, V: qA * pA + 50_000, I: qA * ppA + 50_000, prices: { A: pA, C: 1 } });

  it('(a) yalnız maliyet düzeltmesi (alış 100 → 110, işlem yok, fiyat sabit) → kâr 0', () => {
    const days = [day('2026-10-27', 120, 1000, 100), day('2026-10-28', 120, 1000, 110)];
    const m = model(days, { holdings: H(1000, 110) });
    expect(gainOn(m, '2026-10-28')).toBeCloseTo(0, 6);
    expect(m.health.corrections).toEqual([{ date: '2026-10-28', flowEUR: 200, method: 'prices' }]);
    // eski davranış (fiyat verisi yok): +10.000 TL maliyet "para girişi" sanılır → −€200 sahte zarar
    const old = model(days, { holdings: H(1000, 110), withPrices: false });
    expect(gainOn(old, '2026-10-28')).toBeCloseTo(-200, 6);
    expect(old.health.corrections?.[0].method).toBe('fallback');
  });

  it('(a2) maliyet düzeltmesi + aynı gün piyasa hareketi → kâr = yalnız piyasa hareketi', () => {
    const days = [day('2026-10-27', 120, 1000, 100), day('2026-10-28', 121, 1000, 110)];
    const m = model(days, { holdings: H(1000, 110) });
    expect(gainOn(m, '2026-10-28')).toBeCloseTo(1000 * 1 / R, 6);   // +€20
  });

  it('(b) kayıtsız adet düzeltmesi (1000 → 1100, alış 100, fiyat 120) → değer etkisi kâra sızmaz, kâr 0', () => {
    const days = [day('2026-10-27', 120, 1000, 100), day('2026-10-28', 120, 1100, 100)];
    const m = model(days, { holdings: H(1100, 100) });
    expect(gainOn(m, '2026-10-28')).toBeCloseTo(0, 6);
    // eski davranış: akış = 10.000 TL maliyet, servet +12.000 TL → +€40 sahte kâr
    expect(gainOn(model(days, { holdings: H(1100, 100), withPrices: false }), '2026-10-28')).toBeCloseTo(40, 6);
  });

  it('(c) normal alım ve satım günleri değişmez (akış ≈ 0, düzeltme günü sayılmaz)', () => {
    // 15 Eki: nakitten 100 adet A alımı @120 (nakit 50.000 → 38.000). 16 Eki: 200 adet A satışı @130, realize 6.000; hasılat nakde.
    const H2 = [
      { id: 'A', currency: 'TRY', quantity: 900, purchase_price: 100, created_at: '2026-01-01' },
      { id: 'C', currency: 'TRY', quantity: 64_000, purchase_price: 1, created_at: '2026-01-01' },
    ];
    // ağırlıklı alış: (1000×100 + 100×120)/1100 = 101,818..; satışta maliyet 200×101,818 = 20.363,6; realize 26.000 − 20.363,6
    const pp1 = (1000 * 100 + 100 * 120) / 1100;
    const days: Day[] = [
      { date: '2026-10-14', V: 1000 * 118 + 50_000, I: 1000 * 100 + 50_000, prices: { A: 118, C: 1 } },
      { date: '2026-10-15', V: 1100 * 121 + 38_000, I: 1100 * pp1 + 38_000, prices: { A: 121, C: 1 } },
      { date: '2026-10-16', V: 900 * 130 + 64_000, I: 900 * pp1 + 64_000, prices: { A: 130, C: 1 } },
    ];
    const tx = [
      { transaction_date: '2026-10-15T10:00:00+00:00', transaction_type: 'buy', quantity: 100, total_amount: 12_000, holding_id: 'A' },
      { transaction_date: '2026-10-16T10:00:00+00:00', transaction_type: 'sell', quantity: 200, total_amount: 26_000, realized_profit: 26_000 - 200 * pp1, holding_id: 'A' },
    ];
    const m = model(days, { holdings: H2, tx });
    const old = model(days, { holdings: H2, tx, withPrices: false });
    expect(m.health.corrections).toBeUndefined();
    expect(gainOn(m, '2026-10-15')).toBeCloseTo(gainOn(old, '2026-10-15'), 9);
    expect(gainOn(m, '2026-10-16')).toBeCloseTo(gainOn(old, '2026-10-16'), 9);
    expect(gainOn(m, '2026-10-15')).toBeCloseTo((1100 * 121 + 38_000 - 1000 * 118 - 50_000) / R, 6);   // alım içsel
    expect(gainOn(m, '2026-10-16')).toBeCloseTo((900 * 130 + 64_000 - 1100 * 121 - 38_000) / R, 6);    // satış içsel
  });

  it('(d) Ekim fikstürü: başlangıç €148.074, bitiş €148.061, 28 Eki +€530 Robo maliyet düzeltmesi → Ekim ≈ −€5 (eskiden −€535)', () => {
    // R: Robo (TRY birimli tutuluyor, sabit kur); C: nakit 3.700 TL. 15 Eki: €8 temettü kasaya çıktı (gerçek akış).
    const q = 2960, cash = 3700;
    const pFor = (eurV: number) => (eurV * R - cash) / q;
    const ppOld = 2365.65, ppNew = ppOld + (530 * R) / q;            // +€530 maliyet, işlem YOK
    const seq: Array<[string, number, number]> = [
      ['2026-09-30', 148_074, ppOld], ['2026-10-15', 147_640, ppOld], ['2026-10-27', 147_644, ppOld],
      ['2026-10-28', 148_065, ppNew], ['2026-10-29', 148_061, ppNew],
    ];
    const days: Day[] = seq.map(([date, eurV, pp]) => ({ date, V: eurV * R, I: q * pp + cash, prices: { R: pFor(eurV), C: 1 } }));
    const holdings = [
      { id: 'R', currency: 'TRY', quantity: q, purchase_price: ppNew, created_at: '2026-01-01' },
      { id: 'C', currency: 'TRY', quantity: cash, purchase_price: 1, created_at: '2026-01-01' },
    ];
    const payouts = [{ date: '2026-10-15', amount: 8, currency: 'EUR' }];
    const m = model(days, { holdings, payouts });
    const oct = m.months.find(r => r.month === '2026-10')!;
    expect(oct.startWealthEUR).toBeCloseTo(148_074, 6);
    expect(oct.endWealthEUR).toBeCloseTo(148_061, 6);
    expect(oct.gainEUR).toBeCloseTo(-5, 6);                       // −13 servet + €8 temettü çıkışı
    expect(gainOn(m, '2026-10-28')).toBeCloseTo(421, 6);          // gerçek piyasa hareketi, düzeltme değil
    expect(m.health.corrections?.map(c => [c.date, Math.round(c.flowEUR), c.method])).toEqual([['2026-10-28', 530, 'prices']]);
    const old = model(days, { holdings, payouts, withPrices: false });
    expect(old.months.find(r => r.month === '2026-10')!.gainEUR).toBeCloseTo(-535, 6);
  });

  it('(e) fiyat verisi snapshot ile tutmuyorsa (silinmiş pozisyon) eski formüle döner ve işaretlenir', () => {
    const days = [day('2026-10-27', 120, 1000, 100), day('2026-10-28', 120, 1000, 110)];
    const m = model(days, { holdings: [H(1000, 110)[1]] });   // A silinmiş → geri kurulan değer snapshot'ı tutmaz
    expect(m.health.corrections?.[0].method).toBe('fallback');
    expect(gainOn(m, '2026-10-28')).toBeCloseTo(-200, 6);
  });
});
