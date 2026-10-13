// ============================================================
// TEK DOĞRU KAYNAK — Portföy Politikası
// ============================================================
// Rebalans Planı (RebalancePlan), X-Ray (xrayService), AI bağlamı (api/lib/aiContext) ve
// AI Advisor (aiAdvisorService) HEPSİ buradan okur.
//
// Profil: Romanya yerleşiği, EUR-bazlı ölçüm, ORTA risk, gelir = DİNAMİK MAAŞ (kâr havuzu).
// Hedef (2026-10-13, kasa hariç portföy): hisse 62 / güvenli taraf 14 / altın 10 / kripto 5 / fon 4 / nakit 5.
// Güvenli taraf = Eurobond + Para Piyasası (XEON) + Hazine Bonosu ETF (IB01).
// Esnek alım planı (sabit haftalık takvim yok): VWCE %76 / V3YL %16 / XEON %8, €52.000, 31 Mart 2027.
// Detay: src/lib/buyPlan.ts ve src/lib/rebalance.ts
//
// Hisse hedefinin içinde (bilgi, ayrı bant değil): küresel ETF ~%75, TL hisse ~%25.

export interface AllocationBand {
  min: number;
  max: number;
  target: number;
}

export type AllocationClass = 'stock' | 'safe' | 'commodity' | 'crypto' | 'fund' | 'currency';

// Sınıf → hedef bant (yüzde). Toplam target = 100. Kasa bu hesaba girmez.
// Bantlar spec'teki açık aralıklardır (kripto/fon/nakit, ±5'ten daha dardır).
export const TARGET_ALLOCATION: Record<AllocationClass, AllocationBand> = {
  stock:     { min: 57, max: 67, target: 62 }, // hisse — büyüme motoru
  safe:      { min: 9,  max: 19, target: 14 }, // eurobond + para piyasası + hazine bonosu ETF
  commodity: { min: 5,  max: 15, target: 10 }, // ALTIN — FİZİKİ, satılamaz
  crypto:    { min: 2,  max: 8,  target: 5  }, // BTC, elle yönetilir
  fund:      { min: 2,  max: 6,  target: 4  }, // gelir/karma fonlar
  currency:  { min: 2,  max: 8,  target: 5  }, // likit nakit tamponu (kasa değil)
};

export const CLASS_LABELS: Record<AllocationClass, string> = {
  stock: 'Hisse',
  safe: 'Güvenli taraf',
  commodity: 'Altın',
  crypto: 'Kripto',
  fund: 'Fon',
  currency: 'Nakit',
};

/** Hisse satırında gösterilen iç kompozisyon (bilgi). Ayrı rebalans bantı değildir. */
export const STOCK_MIX_HINT = 'İçinde: küresel ETF ~%75, TL hisse ~%25';

// Basit {sınıf: hedef%} haritası (drift hesabı için).
export const TARGET_PCT: Record<string, number> = Object.fromEntries(
  Object.entries(TARGET_ALLOCATION).map(([k, v]) => [k, v.target]),
);

// Güvenli taraf grubu. Yeni para buraya XEON (para piyasası) olarak gider; IB01 yeni alınmaz.
export const SAFE_ASSET_TYPES = new Set(['eurobond', 'money_market', 'treasury_etf', 'bond']);

// Sembol → kayıt kategorisi. Veritabanı hâlâ eurobond dese de ekran ve hesap bunu kullanır.
export const SYMBOL_ASSET_TYPE: Record<string, string> = {
  XEON: 'money_market',
  IB01: 'treasury_etf',
};

export function effectiveAssetType(assetType: string, symbol?: string | null): string {
  const override = SYMBOL_ASSET_TYPE[String(symbol || '').trim().toUpperCase()];
  return override || assetType || 'stock';
}

/** Kasa ve 'cash' tipi rebalans dışıdır (null). Bilinmeyen tipler de dışarıda kalır. */
export function allocationClassOf(assetType: string, symbol?: string | null): AllocationClass | null {
  const t = effectiveAssetType(assetType, symbol);
  if (t === 'cash' || t === 'kasa') return null;
  if (SAFE_ASSET_TYPES.has(t)) return 'safe';
  if (t === 'stock' || t === 'commodity' || t === 'crypto' || t === 'fund' || t === 'currency') return t;
  return null;
}

// Fiziki/satılamaz varlık tipleri — rebalans ASLA "sat" önermez; fazlaysa
// "ekleme yapma, gerisini büyüt → seyrelt" mantığı uygulanır.
export const PHYSICAL_FIXED_TYPES = new Set(['commodity']);

// Dinamik güvenli maaş: reel EUR kârın bu kadarı havuzdan çekilebilir.
export const DYNAMIC_WITHDRAWAL_SAFETY = 0.85;

export const POLICY_META = {
  residence: 'RO',
  baseCurrency: 'EUR',
  horizonYears: 10,
  risk: 'moderate' as const,
  maxDrawdownPct: 20,
};
