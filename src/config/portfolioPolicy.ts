// ============================================================
// TEK DOĞRU KAYNAK — Portföy Politikası
// ============================================================
// AI Portföy Yöneticisi (smartInvestmentEngine), X-Ray (xrayService) ve
// AI Advisor (aiAdvisorService) HEPSİ buradan okur. Eskiden her birinin ayrı
// hardcoded hedefi vardı → "ayrı telden" çelişkili öneriler. Artık tek kaynak.
//
// Profil (2026-06-15, deep-research ile doğrulandı): Romanya yerleşiği, USD-bazlı
// ölçüm, 10+ yıl ufuk, ORTA risk (kötü yıl maks ~−%20), gelir = DİNAMİK MAAŞ.
// Detay: memory/project_portfoy_policy.md
//
// Kanıt: 50/50–60/40 hisse/tahvil (Graham/Bogle/Trinity; 2000-02 drawdown 50/50
// −%14 vs 80/20 −%34 → −%20 toleransı bu bandı zorunlu kılar), altın regime-bağımlı
// ~%10, kripto %0-5. Kaynaklar memory'de.

export interface AllocationBand {
  min: number;
  max: number;
  target: number;
}

// asset_type → hedef bant (yüzde). Toplam target = 100.
export const TARGET_ALLOCATION: Record<string, AllocationBand> = {
  stock:     { min: 40, max: 60, target: 50 }, // global + kaliteli hisse — büyüme motoru
  eurobond:  { min: 20, max: 35, target: 25 }, // USD/hard-currency tahvil (IB01 vb.)
  fund:      { min: 0,  max: 15, target: 5  }, // gelir/karma fonlar
  commodity: { min: 8,  max: 13, target: 10 }, // ALTIN — FİZİKİ, satılamaz (aşağı bak)
  crypto:    { min: 0,  max: 5,  target: 5  }, // BTC, elle yönetilir (bot kapalı)
  currency:  { min: 5,  max: 10, target: 5  }, // likit nakit tamponu
};

// Basit {asset_type: hedef%} haritası (drift hesabı için).
export const TARGET_PCT: Record<string, number> = Object.fromEntries(
  Object.entries(TARGET_ALLOCATION).map(([k, v]) => [k, v.target]),
);

// Fiziki/satılamaz varlık tipleri — rebalans ASLA "sat" önermez; fazlaysa
// "ekleme yapma, gerisini büyüt → seyrelt" mantığı uygulanır.
export const PHYSICAL_FIXED_TYPES = new Set(['commodity']);

// Dinamik güvenli maaş: yıllık reel (USD) büyümenin bu kadarı çekilebilir.
export const DYNAMIC_WITHDRAWAL_SAFETY = 0.85;

export const POLICY_META = {
  residence: 'RO',
  baseCurrency: 'USD',
  horizonYears: 10,
  risk: 'moderate' as const,
  maxDrawdownPct: 20,
};
