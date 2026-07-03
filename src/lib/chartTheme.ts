// Grafik tema sistemi — doğrulanmış kategorik palet + eksen/grid renkleri + formatlar.
//
// Palet, dataviz validator'ından geçirildi (2026-07-03):
//  - Light (beyaz kart yüzeyi):  CVD worst adjacent ΔE 25.0 → PASS
//    (aqua/yellow/magenta <3:1 kontrast → "relief" kuralı: grafiklerin yanında
//     görünür etiket veya tablo şart — dağılım sayfasında tablo zaten var)
//  - Dark (gray-900 kart yüzeyi): tüm kontroller PASS
//
// KURAL: Renk varlık sınıfını izler, sıralamayı değil. Filtre/sıralama değişince
// renk değişmez. 8.+ seri asla yeni renk almaz → "Diğer"e katlanır.

export type AssetTypeKey =
  | 'stock' | 'commodity' | 'currency' | 'crypto'
  | 'eurobond' | 'cash' | 'fund';

// Slot sırası CVD-güvenliği için seçildi (blue→yellow→aqua→orange→violet→green→magenta)
const ASSET_COLORS: Record<AssetTypeKey, { light: string; dark: string; name: string }> = {
  stock:     { light: '#2a78d6', dark: '#3987e5', name: 'BIST Hisseleri' },
  commodity: { light: '#eda100', dark: '#c98500', name: 'Emtia (Altın)' },
  currency:  { light: '#1baf7a', dark: '#199e70', name: 'Döviz' },
  crypto:    { light: '#eb6834', dark: '#d95926', name: 'Kripto Para' },
  eurobond:  { light: '#4a3aa7', dark: '#9085e9', name: 'Eurobond' },
  cash:      { light: '#008300', dark: '#008300', name: 'Nakit' },
  fund:      { light: '#e87ba4', dark: '#d55181', name: 'Fon' },
};

const FALLBACK_SLOT = { light: '#898781', dark: '#898781', name: 'Diğer' };

export function assetColor(assetType: string, isDark: boolean): string {
  const slot = ASSET_COLORS[assetType as AssetTypeKey] || FALLBACK_SLOT;
  return isDark ? slot.dark : slot.light;
}

export function assetName(assetType: string): string {
  return (ASSET_COLORS[assetType as AssetTypeKey] || FALLBACK_SLOT).name;
}

// Grafik iskeleti (grid/eksen/tooltip) — Tailwind slate/gray tonlarıyla uyumlu
export function chartChrome(isDark: boolean) {
  return {
    grid: isDark ? '#2c2c34' : '#e8e8ee',
    axis: isDark ? '#8a8a95' : '#8a8a95',
    tooltipBg: isDark ? '#111827' : '#ffffff',
    tooltipBorder: isDark ? '#374151' : '#e5e7eb',
    tooltipText: isDark ? '#f9fafb' : '#111827',
    positive: isDark ? '#34d399' : '#059669',
    negative: isDark ? '#f87171' : '#dc2626',
    neutralLine: isDark ? '#6b7280' : '#94a3b8',
  };
}

// ── Sayı formatları ──────────────────────────────────────────────────────
// Eksen: kompakt (₺7,3M) — tooltip/tile: tam sayı, ondalıksız.

export function fmtAxisTRY(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${sign}₺${(abs / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}K`;
  return `${sign}₺${abs.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
}

export function fmtTRY0(n: number): string {
  return '₺' + n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

export function fmtUSD0(n: number): string {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function fmtSignedTRY0(n: number): string {
  return (n >= 0 ? '+' : '−') + fmtTRY0(Math.abs(n));
}

// Miktar: tam sayılar ondalıksız, kesirliler en çok 4 anlamlı ondalıkla,
// kuyruk sıfırları olmadan. (37.550,00000000 → 37.550 · 0,06321882 → 0,0632)
export function fmtQty(n: number): string {
  if (!isFinite(n)) return '0';
  if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-9) {
    return Math.round(n).toLocaleString('tr-TR');
  }
  const decimals = Math.abs(n) >= 1 ? 4 : 6;
  return n.toLocaleString('tr-TR', { maximumFractionDigits: decimals });
}

// Fiyat: büyüklüğe göre ondalık — ₺3.350.478 gibi büyükler tam sayı,
// normal fiyatlar 2 hane, kuruş-altı fiyatlar 4 hane.
export function fmtPrice(n: number): string {
  if (!isFinite(n)) return '0';
  const abs = Math.abs(n);
  const decimals = abs >= 10000 ? 0 : abs >= 1 ? 2 : 4;
  return n.toLocaleString('tr-TR', { maximumFractionDigits: decimals, minimumFractionDigits: abs >= 1 && abs < 10000 ? 2 : 0 });
}

// Recharts YAxis domain'i: 0-tabanlı düz çizgi yerine veriye oturan,
// %1,5 nefes paylı aralık. (Pozitif seriler için; negatifler kırpılmaz.)
export const paddedDomain: [(dataMin: number) => number, (dataMax: number) => number] = [
  (dataMin: number) => (dataMin >= 0 ? Math.floor(dataMin * 0.985) : Math.floor(dataMin * 1.015)),
  (dataMax: number) => Math.ceil(dataMax * 1.015),
];
