import { describe, it, expect } from 'vitest';
import { expectedSnapshotDay, stalePrices } from './aiContext';

const now = new Date('2026-09-22T10:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);

describe('expectedSnapshotDay — snapshot cron 18:00 UTC', () => {
  it('cron saatinden önce beklenen gün DÜN', () => {
    expect(expectedSnapshotDay(new Date('2026-09-22T10:00:00Z'))).toBe('2026-09-21');
    expect(expectedSnapshotDay(new Date('2026-09-22T18:05:00Z'))).toBe('2026-09-21');   // cron çalışıyor olabilir
  });
  it('cron bitince beklenen gün BUGÜN', () => {
    expect(expectedSnapshotDay(new Date('2026-09-22T18:30:00Z'))).toBe('2026-09-22');
    expect(expectedSnapshotDay(new Date('2026-09-22T23:59:00Z'))).toBe('2026-09-22');
  });
  it('ay başında düne geçiş doğru', () => {
    expect(expectedSnapshotDay(new Date('2026-10-01T03:00:00Z'))).toBe('2026-09-30');
  });
});

describe('stalePrices — price_history üzerinden gerçek değişim', () => {
  it('11-44 gün önce son değişen sembol bayat, gün sayısı doğru', () => {
    const rows = [];
    for (let i = 44; i >= 0; i--) rows.push({ symbol: 'A', price: i >= 20 ? 10 : 11, recorded_at: day(i) });
    const m = stalePrices(rows, now);
    expect(m.get('A')).toEqual({ days: 19, atLeast: false });
  });
  it('pencere boyunca HİÇ değişmemiş fiyat da bayat (en bayat olan) — eski koşul bunu atlıyordu', () => {
    const rows = [];
    for (let i = 44; i >= 0; i--) rows.push({ symbol: 'B', price: 5, recorded_at: day(i) });
    const m = stalePrices(rows, now);
    expect(m.get('B')).toEqual({ days: 44, atLeast: true });
  });
  it('pencereye yeni girmiş (≤10 gün) ve sabit fiyatlı sembol bayat sayılmaz', () => {
    const rows = [];
    for (let i = 6; i >= 0; i--) rows.push({ symbol: 'C', price: 7, recorded_at: day(i) });
    expect(stalePrices(rows, now).has('C')).toBe(false);
  });
  it('son 10 gün içinde değişen sembol bayat değil', () => {
    const rows = [];
    for (let i = 44; i >= 0; i--) rows.push({ symbol: 'D', price: i >= 3 ? 1 : 2, recorded_at: day(i) });
    expect(stalePrices(rows, now).has('D')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------
// buildAiContext — sahte Supabase ile uçtan uca metin (DB yok, AI yok)
// ---------------------------------------------------------------------------------
import { buildAiContext } from './aiContext';

type Row = Record<string, any>;
function fakeSupabase(tables: Record<string, Row[]>) {
  const builder = (name: string) => {
    const rows = tables[name] || [];
    let filtered = rows.slice(); let from = 0, to = Infinity; let head = false; let count = false;
    const q: any = {
      select: (_c: string, opts?: { count?: string; head?: boolean }) => { head = !!opts?.head; count = !!opts?.count; return q; },
      eq: (c: string, v: any) => { filtered = filtered.filter(r => r[c] === v); return q; },
      gt: (c: string, v: any) => { filtered = filtered.filter(r => r[c] > v); return q; },
      gte: (c: string, v: any) => { filtered = filtered.filter(r => String(r[c]) >= String(v)); return q; },
      order: () => q,
      range: (a: number, b: number) => { from = a; to = b; return q; },
      then: (res: (v: any) => void) => res({ data: head ? null : filtered.slice(from, to + 1), error: null, count: count ? filtered.length : null }),
    };
    return q;
  };
  return { from: builder } as any;
}

function fixture(opts: { augLoss: boolean }) {
  const E = 48, U = 41;
  const days: string[] = [];
  for (let d = new Date('2026-08-01T00:00:00Z'); d <= new Date('2026-09-21T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  const snapshots = days.map((day, i) => {
    const aug = day < '2026-09-01';
    // Ağustos: 100.000 → 97.000 (zarar) ya da → 103.000 (kâr); Eylül: Ağustos kapanışından +2.000 (kâr); yatırım sabit → tüm fark kâr/zarar
    const augDelta = opts.augLoss ? -3000 : 3000;
    const augEnd = 100000 + augDelta;
    const eurWealth = aug ? 100000 + augDelta * (i / 30) : augEnd + 2000 * ((i - 31) / 20);
    return { snapshot_date: day, total_value: eurWealth * E, total_investment: 50000 * E, created_at: `${day}T18:00:00Z` };
  });
  const rate = (r: number) => days.map(day => ({ day, rate: r }));
  const holdings = [
    { id: 1, symbol: 'V3YL', asset_type: 'stock', currency: 'EUR', quantity: 1, current_price: 40000, purchase_price: 30000, created_at: '2026-01-01' },
    { id: 2, symbol: 'IB01', asset_type: 'eurobond', currency: 'USD', quantity: 1, current_price: 10000, purchase_price: 10000, created_at: '2026-01-01' },
    { id: 3, symbol: 'ALTIN', asset_type: 'commodity', currency: 'TRY', quantity: 1, current_price: 10000 * E, purchase_price: 1, created_at: '2026-01-01' },
    { id: 4, symbol: 'EURO', asset_type: 'currency', currency: 'EUR', quantity: 30000, current_price: 1, purchase_price: 1, created_at: '2026-01-01' },
    { id: 5, symbol: 'KASA', asset_type: 'cash', currency: 'EUR', quantity: 99999, current_price: 1, purchase_price: 1, created_at: '2026-01-01' },
    { id: 6, symbol: 'US900123CJ75', asset_type: 'eurobond', currency: 'USD', quantity: 0, current_price: 1000, purchase_price: 1000, created_at: '2026-01-01' },
  ];
  const price_history: Row[] = [];
  for (const day of days) {
    price_history.push({ symbol: 'V3YL', price: 40000, recorded_at: `${day}T18:00:00Z` });                    // hiç değişmedi → bayat
    price_history.push({ symbol: 'IB01', price: 10000 + (day >= '2026-09-15' ? 1 : 0), recorded_at: `${day}T18:00:00Z` }); // 7 gün önce değişti → bayat değil
  }
  return fakeSupabase({
    portfolio_snapshots: snapshots,
    exchange_rates_daily: [...rate(E).map(r => ({ ...r, from_currency: 'EUR', to_currency: 'TRY', source: 'api' })), ...rate(U).map(r => ({ ...r, from_currency: 'USD', to_currency: 'TRY', source: 'api' }))],
    transactions: [], cash_transactions: [], salary_withdrawals: [],
    holdings, cash_balances: [{ currency: 'USD', balance: 20000 }, { currency: 'RUB', balance: 0 }],
    price_history,
  });
}

describe('buildAiContext — metin motordan türetilir, sabit rakam yok', () => {
  it('sıfırlama uygulanan ayda "devreden açık SIFIRLANDI" yazar; ön izleme = mtd.salaryEUR; plan dilimi tranche toplar', async () => {
    const ctx = await buildAiContext(fixture({ augLoss: true }), '2026-09-22', new Date('2026-09-22T10:00:00Z'));
    expect(ctx.eur.asOf).toBe('2026-09-21');
    expect(ctx.eur.mtd?.carryResetApplied).toBe(true);
    expect(ctx.text).toContain('devreden açık SIFIRLANDI');
    expect(ctx.text).not.toContain('Zarar devreder');
    expect(ctx.text).toContain(`Eki 2026 maaş ÖN İZLEME`);
    expect(ctx.text).toContain(`€${Math.round(ctx.eur.mtd!.salaryEUR).toLocaleString('tr-TR')}`);
    // kapanmış Ağustos havuzu negatif → şu an çekilebilir €0
    expect(ctx.eur.poolEUR).toBeLessThan(0);
    expect(ctx.eur.entitlementEUR).toBe(0);
    // dilim: V3YL + XEON = trancheEUR (yuvarlama farkı yok), tranche = $2.000'in euro karşılığı
    expect(ctx.weekPlan[0].amountEUR + ctx.weekPlan[1].amountEUR).toBe(ctx.trancheEUR);
    expect(ctx.trancheEUR).toBe(Math.round(2000 * 41 / 48));
    // 'cash' tipi ve sıfır adetli satır dağılıma girmez: stock 40k / (40k + IB01 8,54k + altın 10k + EURO 30k)
    const total = 40000 + 10000 * 41 / 48 + 10000 + 30000;
    expect(ctx.text).toContain(`stock: %${(100 * 40000 / total).toFixed(0)}`);
    expect(ctx.text).not.toContain('KASA (cash)');
    // elle yazılmış rakamlar yok
    expect(ctx.text).not.toMatch(/€18k|€370-470k|€150-250|€460/);
  });

  it('anomaliler deterministik: bayat fiyat (pencere boyu sabit), alım yok, itfa yalnız adet>0; snapshot anomalisi cron saatine bağlı', async () => {
    const before = await buildAiContext(fixture({ augLoss: false }), '2026-09-22', new Date('2026-09-22T10:00:00Z'));
    expect(before.anomalies.some(a => /^V3YL fiyatı en az 4[45] gündür/.test(a))).toBe(true);   // 45 günlük pencere boyunca sabit
    expect(before.anomalies.some(a => a.startsWith('IB01'))).toBe(false);
    expect(before.anomalies.some(a => a.includes('kayıtlı ALIM yok'))).toBe(true);
    expect(before.anomalies.some(a => a.includes('US900123CJ75'))).toBe(false);   // quantity 0 → filtrelendi
    expect(before.anomalies.some(a => a.startsWith('Snapshot eksik'))).toBe(false); // 10:00 UTC: dünkü snapshot yeterli
    const after = await buildAiContext(fixture({ augLoss: false }), '2026-09-22', new Date('2026-09-22T19:00:00Z'));
    expect(after.anomalies.some(a => a.startsWith('Snapshot eksik: son 2026-09-21, beklenen 2026-09-22'))).toBe(true);
  });

  it('sıfırlama olmayan ayda devreden havuz/açık cümlesi ve "Zarar devreder" yazar', async () => {
    const ctx = await buildAiContext(fixture({ augLoss: false }), '2026-09-22', new Date('2026-09-22T10:00:00Z'));
    expect(ctx.eur.mtd?.carryResetApplied).toBeFalsy();
    expect(ctx.text).toMatch(/Bu aya devreden (havuz|açık)/);
    expect(ctx.text).toContain('Zarar devreder');
  });
});
