import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  JULY_RENOVATION_LINES,
  PRE_APP_RENOVATION,
  buildRenovationSummary,
  formatTotalEUR,
  summaryFromRecords,
} from './romaniaRenovation';

const julyCash = [
  { at: '2026-07-03T09:00:00+03:00', currency: 'EUR', amount: 3500, notes: 'ev tadilat' },
  { at: '2026-07-03T11:00:00+03:00', currency: 'EUR', amount: 4050, notes: null },
  { at: '2026-07-02T22:30:00Z', currency: 'RON', amount: 25000, notes: 'tadilat malzeme' },
];

describe('Romanya ev tadilat toplamı', () => {
  it('1 Eylül 2025 sabittir ve veritabanı satırı onu değiştirmez', () => {
    const summary = buildRenovationSummary({
      cashRows: [{ at: '2025-09-01T10:00:00Z', currency: 'EUR', amount: 1, notes: 'tadilat' }],
    });
    const pre = summary.lines[0];
    expect(pre.isoDate).toBe(PRE_APP_RENOVATION.isoDate);
    expect(pre.dateLabel).toBe('1 Eylül 2025');
    expect(pre.amountEUR).toBe(20_000);
    expect(pre.eurText).toBe('€20.000');
    expect(pre.note).toBe('uygulama öncesi, sadece bilgi');
    expect(pre.source).toBe('sabit');
  });

  it('3 Temmuz satırlarını cash_transactions parmak izinden okur', () => {
    const summary = buildRenovationSummary({
      cashRows: julyCash,
      ronTry: 9.84,
      eurTry: 50,
    });
    const july = summary.lines.slice(1);
    expect(july.map(l => l.source)).toEqual(['cash_transactions', 'cash_transactions', 'cash_transactions']);
    expect(july.map(l => l.amountEUR)).toEqual([3_500, 4_050, 4_920]);
    expect(july[2].nativeText).toBe('25.000 RON');
    expect(july[2].eurText).toBe('€4.920');
    expect(summary.fxSource).toBe('exchange_rates_daily');
    expect(summary.totalEUR).toBe(32_470);
    expect(formatTotalEUR(summary)).toBe('≈ €32.470');
  });

  it('kayıt yoksa Temmuz satırları aynı tutarla sabit kalır ve RON yedeği €4.920 olur', () => {
    const summary = buildRenovationSummary({});
    expect(summary.lines.slice(1).map(l => l.source)).toEqual(['sabit', 'sabit', 'sabit']);
    expect(summary.lines.map(l => l.amountEUR)).toEqual([20_000, 3_500, 4_050, 4_920]);
    expect(summary.fxSource).toBe('fallback');
    expect(summary.totalEUR).toBe(32_470);
    expect(JULY_RENOVATION_LINES.map(l => l.amount)).toEqual([3_500, 4_050, 25_000]);
  });

  it('aynı tutardan iki kayıt varsa tahmin etmez, sabite döner', () => {
    const summary = buildRenovationSummary({
      cashRows: [
        { at: '2026-07-03T08:00:00Z', currency: 'EUR', amount: 3500 },
        { at: '2026-07-03T18:00:00Z', currency: 'EUR', amount: 3500 },
        { at: '2026-07-03T12:00:00Z', currency: 'EUR', amount: 4050 },
      ],
    });
    expect(summary.lines[1].source).toBe('sabit');
    expect(summary.lines[1].amountEUR).toBe(3_500);
    expect(summary.lines[2].source).toBe('cash_transactions');
  });

  it('çift kayıtta tadilat notu taşıyan tek satırı seçer', () => {
    const summary = buildRenovationSummary({
      cashRows: [
        { at: '2026-07-03T08:00:00Z', currency: 'EUR', amount: -3500, notes: 'maaş' },
        { at: '2026-07-03T18:00:00Z', currency: 'EURO', amount: 3500, notes: 'ev tadilatı' },
      ],
    });
    expect(summary.lines[1].source).toBe('cash_transactions');
    expect(summary.lines[1].amountEUR).toBe(3_500);
  });

  it('cash_transactions yoksa transactions tablosuna bakar, ikisini birden saymaz', () => {
    const summary = buildRenovationSummary({
      cashRows: [{ at: '2026-07-03T10:00:00+03:00', currency: 'EUR', amount: 3500 }],
      txRows: [
        { at: '2026-07-03', currency: 'EUR', amount: 3500 },
        { at: '2026-07-03', currency: 'EUR', amount: 4050 },
        { at: '2026-07-03', currency: 'LEI', amount: 25000 },
      ],
      ronTry: 10,
      eurTry: 50,
    });
    expect(summary.lines.slice(1).map(l => l.source)).toEqual(['cash_transactions', 'transactions', 'transactions']);
    expect(summary.lines[3].amountEUR).toBe(5_000);
    expect(summary.totalEUR).toBe(20_000 + 3_500 + 4_050 + 5_000);
  });

  it('başka günün aynı tutarını tadilat saymaz', () => {
    const summary = buildRenovationSummary({
      cashRows: [{ at: '2026-08-03T10:00:00Z', currency: 'EUR', amount: 3500, notes: 'tadilat' }],
    });
    expect(summary.lines[1].source).toBe('sabit');
  });

  it('ham kayıtları ve kur serisinin son gününü eşler', () => {
    const summary = summaryFromRecords({
      cash: [
        { created_at: '2026-07-03T07:00:00Z', currency: 'EUR', amount: '3500', notes: '' },
        { created_at: '2026-07-03T08:00:00Z', currency: 'EUR', amount: 4050 },
        { created_at: '2026-07-03T09:00:00Z', currency: 'RON', amount: 25000 },
      ],
      rates: [
        { day: '2026-10-20', from_currency: 'EUR', rate: 50 },
        { day: '2026-10-23', from_currency: 'EUR', rate: 52 },
        { day: '2026-10-22', from_currency: 'RON', rate: 10.2336 },
        { day: '2026-10-23', from_currency: 'RON', rate: 10.2336 },
      ],
    });
    expect(summary.fxSource).toBe('exchange_rates_daily');
    expect(summary.lines[3].amountEUR).toBe(Math.round(25000 * (10.2336 / 52)));
    expect(summary.lines.slice(1).every(l => l.source === 'cash_transactions')).toBe(true);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('tadilat kartı hesap modüllerine bağlı değil', () => {
  it('romaniaRenovation yalnız kart, servis ve dağılım sayfasından okunur', () => {
    const allow = new Set([
      'src/lib/romaniaRenovation.test.ts',
      'src/services/romaniaRenovationService.ts',
      'src/components/RomaniaRenovationCard.tsx',
      'src/components/RomaniaRenovationCard.test.tsx',
      'src/components/AssetAllocationPage.tsx',
      'src/lib/houseMoney.ui.test.tsx',
    ]);
    const hits = walk('src')
      .map(file => relative(process.cwd(), file).replace(/\\/g, '/'))
      .filter(file => /romaniaRenovation/i.test(readFileSync(file, 'utf8')));
    expect(hits.sort()).toEqual([...allow].sort());
  });
});
