// X-Ray politika/EUR kuralları (2026-09-22): canlıya benzer portföyle bulgular
import { describe, it, expect } from 'vitest';
import { analyzeXRay } from './xrayService';
import type { Holding } from '../lib/supabase';

const H = (o: Partial<Holding> & { symbol: string; asset_type: Holding['asset_type'] }): Holding => ({
  id: o.symbol, name: o.symbol, quantity: 1, purchase_price: 1, current_price: 1, currency: 'TRY',
  created_at: '2025-10-22', updated_at: new Date().toISOString(), ...o,
} as Holding);

const holdings: Holding[] = [
  H({ symbol: 'USD', asset_type: 'currency', quantity: 34000, purchase_price: 38.2, current_price: 48.78 }),
  H({ symbol: 'EURO', asset_type: 'currency', quantity: 30100, purchase_price: 48.15, current_price: 55.99 }),
  H({ symbol: 'ALTIN', asset_type: 'commodity', quantity: 150, purchase_price: 4200, current_price: 6940 }),
  H({ symbol: 'IB01', asset_type: 'eurobond', currency: 'EUR', quantity: 109.68, purchase_price: 105.12, current_price: 106.15, created_at: '2026-05-20' }),
  H({ symbol: 'TR-EUROBOND-2Y', asset_type: 'eurobond', currency: 'USD', quantity: 7.5, purchase_price: 1000, current_price: 1000 }),
  H({ symbol: 'V3YL', asset_type: 'stock', currency: 'EUR', quantity: 990, purchase_price: 7.2, current_price: 7.43 }),
  H({ symbol: 'REVOLUT-ROBO', asset_type: 'stock', currency: 'TRY', quantity: 1.29, purchase_price: 336_000, current_price: 377_534 }),   // canlıda TL fiyatlı saklı
  H({ symbol: 'US900123CJ75', asset_type: 'eurobond', currency: 'TRY', quantity: 2, purchase_price: 37_500, current_price: 46_940 }),
  H({ symbol: 'JNJ', asset_type: 'stock', currency: 'USD', quantity: 17, purchase_price: 155, current_price: 196 }),
  H({ symbol: 'TUPRS', asset_type: 'stock', quantity: 600, purchase_price: 95, current_price: 263 }),
  H({ symbol: 'ASELS', asset_type: 'stock', quantity: 500, purchase_price: 60, current_price: 240 }),
  H({ symbol: 'BIMAS', asset_type: 'stock', quantity: 300, purchase_price: 300, current_price: 422 }),
  H({ symbol: 'THYAO', asset_type: 'stock', quantity: 300, purchase_price: 300, current_price: 313 }),
  H({ symbol: 'BTC', asset_type: 'crypto', quantity: 0.081, purchase_price: 3_500_000, current_price: 4_200_000, created_at: '2026-04-05' }),
  H({ symbol: 'GPA', asset_type: 'fund', quantity: 1000, purchase_price: 80, current_price: 94 }),
];

describe('X-Ray — EUR ölçü ve tek plan kuralları', () => {
  const x = analyzeXRay(holdings);
  const byId = (id: string) => x.findings.find(f => f.id === id);
  it('ölü sermaye = getirisiz NAKİT (hedefin üstü); IB01 gibi faiz işleyen fonlar ölü sayılmaz', () => {
    const f = byId('dead-money')!;
    expect(f).toBeDefined();
    expect(f.symbols).toEqual(expect.arrayContaining(['USD', 'EURO']));
    expect(f.symbols).not.toContain('IB01');
    expect(f.title).toMatch(/Getirisiz nakit/);
    // hedef %5: atıl = nakit − %5 × toplam
    const cash = holdings.filter(h => h.asset_type === 'currency').reduce((s, h) => s + h.quantity * h.current_price, 0);
    expect(x.deadMoneyTotal).toBeCloseTo(cash - 0.05 * x.totalValue, 0);
  });
  it('TL maruziyeti: altın/kripto/eurobond/global TL fiyatlı olsa da TL DEĞİL', () => {
    const tl = byId('tl-exposure');
    expect(tl).toBeUndefined();
    // BIST (TUPRS+ASELS+BIMAS+THYAO) + GPA TL; REVOLUT-ROBO ve US900123CJ75 TL fiyatlı ama TL DEĞİL
    const tlTry = holdings.filter(h => ['TUPRS','ASELS','BIMAS','THYAO','GPA'].includes(h.symbol)).reduce((s, h) => s + h.quantity * h.current_price, 0);
    expect(x.tlPct).toBeCloseTo(100 * tlTry / x.totalValue, 1);
    expect(x.tlPct).toBeLessThan(15);
  });
  it('fiziki altın %50+ kârda olsa da trim önerisine girmez', () => {
    const w = byId('winners-ride');
    if (w) expect(w.symbols).not.toContain('ALTIN');
    expect(x.bigWinners.map(b => b.symbol)).not.toContain('ALTIN');
    expect(x.bigWinners.map(b => b.symbol)).not.toContain('USD');   // nakit 'kazanan' sayılmaz
    expect(x.geographicExposure.find(g => g.region.startsWith('Türkiye'))!.pct).toBeLessThan(20);   // Robo Türkiye'ye yazılmaz
  });
  it("'eksik sektör' bulgusu yok (plan BIST'e taze para koymuyor)", () => {
    expect(x.findings.find(f => f.category === 'sector')).toBeUndefined();
  });
  it('rapor EUR kurunu taşır', () => {
    expect(x.eurRate).toBeCloseTo(55.99, 2);
  });
});
