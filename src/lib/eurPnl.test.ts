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

import { buildEurModel, summarizeEur } from './eurPnl';

describe('buildEurModel + summarizeEur (ham satır → model, uygulama = cron)', () => {
  const snaps = [
    // €100 EUR pozisyon (q=100, pp=1): snapshot total_investment her gün O GÜNÜN kuruyla TL'ye çevrilir (daily-snapshot.ts) → drift
    { snapshot_date: '2026-08-30', total_value: 100 * 55, total_investment: 100 * 55 },
    { snapshot_date: '2026-08-31', total_value: 100 * 55.5, total_investment: 100 * 55.5 },   // kur 55→55.5: değer VE maliyet büyüdü → kâr 0
    { snapshot_date: '2026-09-01', total_value: 100 * 56 + 560, total_investment: 100 * 56 }, // +€10 gerçek kâr (560 TL / 56)
    { snapshot_date: '2026-09-02', total_value: 100 * 56 + 560 + 5600, total_investment: 100 * 56 + 5600 }, // €100 yeni para (TL pozisyon) → kâr 0
  ];
  const rates = (r: number[]) => ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02'].map((d, i) => ({ recorded_at: d, rate: r[i] }));
  const model = buildEurModel({
    snapshots: snaps, eurRates: rates([55, 55.5, 56, 56]), usdRates: rates([47, 47.2, 47.5, 47.5]),
    transactions: [], cashSells: [], holdings: [{ id: 1, currency: 'EUR', quantity: 100, purchase_price: 1, created_at: '2026-08-01' }],
    usdNow: 47.5, reliableFrom: '2026-08-30', annualInflation: 0.02,
  });
  it('kur oynaması kâr değil; gerçek kâr ve yeni para doğru ayrışır', () => {
    const g = model.daily.map(d => Math.round(d.gainEUR * 100) / 100);
    expect(g[0]).toBe(0);
    expect(g[1]).toBeCloseTo(0, 6);        // EUR/TRY 55→55.5, maliyet drift'i düşülür → 0
    expect(g[2]).toBeCloseTo(10, 6);       // +560 TL / 56 = €10
    expect(g[3]).toBeCloseTo(0, 6);        // 5600 TL yeni para = €100 → akış, kâr değil
  });
  it('aylık satırlar ve özet (MTD / geçen ay) tutarlı', () => {
    expect(model.months.map(m => m.month)).toEqual(['2026-08', '2026-09']);
    expect(model.months[1].gainEUR).toBeCloseTo(10, 6);
    const s = summarizeEur(model, '2026-09');
    expect(s.asOf).toBe('2026-09-02');
    expect(s.wealthEUR).toBeCloseTo(210, 6);          // 100 + 10 + 100
    expect(s.dayGainEUR).toBeCloseTo(0, 6);
    expect(s.weekGainEUR).toBeCloseTo(10, 6);
    expect(s.mtd?.month).toBe('2026-09');
    expect(s.lastFull?.month).toBe('2026-08');
    expect(s.health.ok).toBe(true);
  });
  it('kur serisi snapshot’tan geride kalırsa sağlık bozuk', () => {
    const m2 = buildEurModel({ snapshots: snaps, eurRates: rates([55, 55.5, 56, 56]).slice(0, 2), usdRates: rates([47, 47.2, 47.5, 47.5]), transactions: [], cashSells: [], holdings: [], usdNow: 47.5, reliableFrom: '2026-08-30', annualInflation: 0.02 });
    expect(m2.health.ok).toBe(false);
    expect(m2.health.lastEurRateDay).toBe('2026-08-31');
  });
});

import { ymInTZ, prevYMOf, dayInTZ, dayPct } from './eurPnl';

describe('ay/gün sınırı (kullanıcının saat dilimi)', () => {
  it('1 Ekim 02:00 Bükreş (= 30 Eylül 23:00 UTC) yeni aydır', () => {
    expect(ymInTZ(new Date('2026-09-30T23:00:00Z'))).toBe('2026-10');
    expect(prevYMOf(ymInTZ(new Date('2026-09-30T23:00:00Z')))).toBe('2026-09');
  });
  it('30 Eylül 23:00 Bükreş (= 20:00 UTC) hâlâ Eylül', () => {
    expect(ymInTZ(new Date('2026-09-30T20:00:00Z'))).toBe('2026-09');
  });
  it('yıl sınırı: 1 Ocak 01:00 Bükreş → önceki ay Aralık', () => {
    const ym = ymInTZ(new Date('2026-12-31T23:00:00Z'));
    expect(ym).toBe('2027-01');
    expect(prevYMOf(ym)).toBe('2026-12');
  });
  it('gün anahtarı da yerel: 30 Eylül 22:30 UTC → 1 Ekim', () => {
    expect(dayInTZ('2026-09-30T22:30:00Z')).toBe('2026-10-01');
  });
});

describe('günlük yüzde tabanı = önceki günün serveti (akış olan gün)', () => {
  it('€10.000 yeni para giren günde yüzde akışla şişmez', () => {
    const rates = ['2026-08-30', '2026-08-31'].map(d => ({ recorded_at: d, rate: 50 }));
    const model = buildEurModel({
      snapshots: [
        { snapshot_date: '2026-08-30', total_value: 100_000 * 50, total_investment: 80_000 * 50 },
        { snapshot_date: '2026-08-31', total_value: (100_000 + 10_000 + 500) * 50, total_investment: (80_000 + 10_000) * 50 },
      ],
      eurRates: rates, usdRates: rates, transactions: [], cashSells: [], holdings: [],
      usdNow: 45, reliableFrom: '2026-08-30', annualInflation: 0.02,
    });
    const s = summarizeEur(model, '2026-08');
    expect(s.dayGainEUR).toBeCloseTo(500, 6);
    expect(s.prevWealthEUR).toBeCloseTo(100_000, 6);
    expect(s.dayGainPct).toBeCloseTo(0.5, 6);           // 500 / 100.000 (taban dünkü servet)
    expect(500 / (s.wealthEUR - s.dayGainEUR) * 100).toBeCloseTo(0.4545, 3);  // eski taban olsaydı: yanlış
  });
});

describe('dayPct — tek taban kuralı (ekran ve cron aynı fonksiyonu kullanır)', () => {
  it('taban yoksa 0, taban varsa gain/prevWealth', () => {
    expect(dayPct(500, undefined)).toBe(0);
    expect(dayPct(500, 0)).toBe(0);
    expect(dayPct(500, 100_000)).toBeCloseTo(0.5, 9);
    expect(dayPct(-210, 148_281)).toBeCloseTo(-0.1416, 4);
  });
});

describe('zarar devri sıfırlama (CARRY_RESET_MONTH)', () => {
  const daily = [
    { date: '2026-07-01', gainEUR: 0, wealthEUR: 100_000 },
    { date: '2026-07-31', gainEUR: -1_000, wealthEUR: 99_000 },
    { date: '2026-08-31', gainEUR: -500, wealthEUR: 98_500 },
    { date: '2026-09-30', gainEUR: 800, wealthEUR: 99_300 },
  ];
  it('sıfırlamasız: Eylül kârı önce açığı kapatır, maaş 0', () => {
    const rows = monthlyRows(daily, 0, 0.85, null);
    const eyl = rows.find(r => r.month === '2026-09')!;
    expect(eyl.carryInEUR).toBeCloseTo(-1_500, 6);
    expect(eyl.withdrawableEUR).toBe(0);
    expect(eyl.salaryEUR).toBe(0);
  });
  it('Eylül’de sıfırlanınca: açık silinir, maaş = 0,85 × o ayın reel kârı', () => {
    const rows = monthlyRows(daily, 0, 0.85, '2026-09');
    const agu = rows.find(r => r.month === '2026-08')!;
    const eyl = rows.find(r => r.month === '2026-09')!;
    expect(agu.carryOutEUR).toBeCloseTo(-1_500, 6);      // geçmiş aylar dürüst kalır
    expect(eyl.carryInEUR).toBe(0);
    expect(eyl.carryResetApplied).toBe(true);
    expect(eyl.withdrawableEUR).toBeCloseTo(800, 6);
    expect(eyl.salaryEUR).toBeCloseTo(680, 6);
    // sıfırlama tek seferlik: Ekim'de zarar yine devreder
    const rows2 = monthlyRows([...daily, { date: '2026-10-31', gainEUR: -300, wealthEUR: 99_000 }], 0, 0.85, '2026-09');
    const eki = rows2.find(r => r.month === '2026-10')!;
    expect(eki.carryInEUR).toBe(0);
    expect(eki.carryOutEUR).toBeCloseTo(-300, 6);
    expect(eki.salaryEUR).toBe(0);
  });
  it('artıda olan devir sıfırlanmaz (yalnız açık silinir)', () => {
    const artida = [
      { date: '2026-08-01', gainEUR: 0, wealthEUR: 100_000 },
      { date: '2026-08-31', gainEUR: 1_000, wealthEUR: 101_000 },
      { date: '2026-09-30', gainEUR: 500, wealthEUR: 101_500 },
    ];
    const rows = monthlyRows(artida, 0, 0.85, '2026-09');
    expect(rows.find(r => r.month === '2026-09')!.carryResetApplied).toBeUndefined();
  });
});
