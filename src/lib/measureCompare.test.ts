import { describe, it, expect } from 'vitest';
import { computeMeasureCompare, SMOOTHED_RATE, SMOOTH_WINDOW } from './measureCompare';
import type { MonthRow } from './eurPnl';

const M = (p: Partial<MonthRow> & { month: string }): MonthRow => ({
  firstDate: p.month + '-01', lastDate: p.month + '-28',
  startWealthEUR: 0, endWealthEUR: 0, gainEUR: 0, inflationEUR: 0, realGainEUR: 0,
  carryInEUR: 0, withdrawableEUR: 0, carryOutEUR: 0, salaryEUR: 0, ...p,
});

describe('computeMeasureCompare', () => {
  // GERÇEK VERİ: 30 Eyl → 6 Eki. Snapshot 8.234.086,04 → 8.277.286,47 · EUR 55,61 → 55,1309
  // Euro cetveli +€2.070 der; kurlar sabit kalsaydı +€777 olurdu → kur payı +€1.293.
  it('Ekim 2026 gerçek rakamlarıyla kur payını ayırır', () => {
    const out = computeMeasureCompare(
      [M({ month: '2026-10', startWealthEUR: 8234086.04 / 55.61, endWealthEUR: 8277286.47 / 55.1309, gainEUR: 2070, realGainEUR: 1826, salaryEUR: 1000 })],
      [
        { snapshot_date: '2026-09-30', total_value: 8234086.04, total_investment: 6687784.88 },
        { snapshot_date: '2026-10-06', total_value: 8277286.47, total_investment: 6680339.48 },
      ],
      [{ day: '2026-09-30', rate: 55.61 }, { day: '2026-10-06', rate: 55.1309 }],
    );
    const r = out.rows[0];
    // akış yok (Ekim'de işlem yok) → kur-nötr = TL servet farkı ÷ ay başı kuru
    expect(r.fxNeutral!).toBeCloseTo((8277286.47 - 8234086.04) / 55.61, 0);
    expect(r.fxShare!).toBeCloseTo(2070 - (8277286.47 - 8234086.04) / 55.61, 0);
    // eski ölçü: maliyet-bazlı kâr farkı
    expect(r.tlPnlDelta!).toBeCloseTo((8277286.47 - 6680339.48) - (8234086.04 - 6687784.88), 2);
  });

  it('kur hiç oynamazsa kur payı SIFIR olur', () => {
    const out = computeMeasureCompare(
      [M({ month: '2026-10', startWealthEUR: 100000, endWealthEUR: 101000, gainEUR: 1000 })],
      [
        { snapshot_date: '2026-09-30', total_value: 5000000, total_investment: 4000000 },
        { snapshot_date: '2026-10-06', total_value: 5050000, total_investment: 4000000 },
      ],
      [{ day: '2026-09-30', rate: 50 }, { day: '2026-10-06', rate: 50 }],
    );
    expect(out.rows[0].fxShare!).toBeCloseTo(0, 6);
  });

  it('düzleştirilmiş çekim İLERİYE BAKMAZ: ilk ay kendi ay sonu servetini kullanamaz', () => {
    // tutarlar tavanın (€1.000/ay → €400.000 servet) ALTINDA tutuldu ki kesilme testi gölgelemesin
    const out = computeMeasureCompare(
      [M({ month: '2026-09', startWealthEUR: 100000, endWealthEUR: 200000 }), M({ month: '2026-10', startWealthEUR: 200000, endWealthEUR: 200000 })],
      [], [],
    );
    // 1. ay: geçmiş yok → startWealth tabanı (100.000), kendi ay sonunu (200.000) KULLANMAZ
    expect(out.rows[0].smoothedSalary).toBeCloseTo((100000 * SMOOTHED_RATE) / 12, 6);
    // 2. ay: yalnız 1. ayın SONU ortalamaya girer
    expect(out.rows[1].smoothedSalary).toBeCloseTo((200000 * SMOOTHED_RATE) / 12, 6);
  });

  it('düzleştirilmiş çekim aylık tavanı aşmaz', () => {
    const out = computeMeasureCompare([M({ month: '2026-10', startWealthEUR: 9_000_000, endWealthEUR: 9_000_000 })], [], []);
    expect(out.rows[0].smoothedSalary).toBe(1000);
  });

  it('€1.000/ay için gereken servet oranla tutarlı', () => {
    const out = computeMeasureCompare([M({ month: '2026-10' })], [], []);
    expect(out.wealthForCap).toBeCloseTo(12000 / SMOOTHED_RATE, 6);   // %3 → €400.000
    expect(out.wealthForCap).toBe(400000);
  });

  it('snapshot/kur yoksa ilgili sütunlar null — uydurma sayı üretmez', () => {
    const out = computeMeasureCompare([M({ month: '2026-10', gainEUR: 500 })], [], []);
    expect(out.rows[0].tlPnlDelta).toBeNull();
    expect(out.rows[0].fxNeutral).toBeNull();
    expect(out.rows[0].fxShare).toBeNull();
    expect(out.rows[0].eurGain).toBe(500);
  });

  it('düzleştirme penceresi en fazla SMOOTH_WINDOW ay geriye bakar', () => {
    // İlk 4 ay 0 servet, sonrası 120.000. Son satırın penceresi (son SMOOTH_WINDOW ay sonu)
    // sıfırları TAMAMEN dışarıda bırakmalı → 4 + SMOOTH_WINDOW + 1 ay gerekir.
    const N = 4 + SMOOTH_WINDOW + 1;
    const months = Array.from({ length: N }, (_, i) =>
      M({ month: `2026-${String((i % 12) + 1).padStart(2, '0')}`, endWealthEUR: i < 4 ? 0 : 120000, startWealthEUR: 120000 }));
    const out = computeMeasureCompare(months, [], []);
    expect(out.rows[N - 1].smoothedSalary).toBeCloseTo((120000 * SMOOTHED_RATE) / 12, 4);
    // kontrol: bir önceki satırda pencerede HÂLÂ bir sıfır var → daha düşük olmalı
    expect(out.rows[N - 2].smoothedSalary).toBeLessThan(out.rows[N - 1].smoothedSalary);
  });
});
