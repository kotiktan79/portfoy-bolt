// Sembolün yanında görünen ad. Veritabanında ad sütunu yok; bilinen semboller burada,
// notun ilk cümlesi yedek. Ham kimlik (uuid) hiç gösterilmez.

const NAMES: Record<string, string> = {
  AKSEN: 'Aksa Enerji',
  ALTIN: 'Gram altın',
  ASELS: 'Aselsan',
  ASML: 'ASML Holding',
  BIMAS: 'BİM',
  BTC: 'Bitcoin',
  CCOLA: 'Coca-Cola İçecek',
  EKGYO: 'Emlak Konut GYO',
  ENKAI: 'Enka İnşaat',
  EREGL: 'Ereğli Demir Çelik',
  EURO: 'Euro',
  EUR: 'Euro',
  GPA: 'Garanti Portföy',
  IB01: 'iShares ABD Hazine 0-1 yıl',
  IPV: 'İş Portföy',
  JNJ: 'Johnson & Johnson',
  REVOLUTROBO: 'Revolut robot portföy',
  'REVOLUT-ROBO': 'Revolut robot portföy',
  SAHOL: 'Sabancı Holding',
  SISE: 'Şişecam',
  TCELL: 'Turkcell',
  THYAO: 'Türk Hava Yolları',
  TOASO: 'Tofaş',
  TREUROBOND2Y: 'Türkiye Hazine dolar eurobond (2 yıl)',
  'TR-EUROBOND-2Y': 'Türkiye Hazine dolar eurobond (2 yıl)',
  TUPRS: 'Tüpraş',
  USD: 'Amerikan doları',
  US900123CJ75: 'Türkiye eurobond (itfa 14 Nis 2026)',
  US900123CL22: 'Türkiye eurobond (vade 25 Mar 2027)',
  V3YL: 'Vanguard Kuzey Amerika ESG',
  XEON: 'Xtrackers euro gecelik faiz',
};

export function assetName(symbol: string | null | undefined, notes?: string | null): string {
  const raw = String(symbol || '').trim();
  if (!raw) return 'Adsız varlık';
  const key = raw.toUpperCase();
  if (NAMES[key]) return NAMES[key];
  const compact = key.replace(/[^A-Z0-9]/g, '');
  if (NAMES[compact]) return NAMES[compact];
  const note = String(notes || '').trim();
  const first = note.split(/[.—–]/)[0]?.trim() || '';
  if (first && first.length <= 72 && !looksLikeId(first)) return first;
  return raw;
}

export function transactionAssetLabel(
  holding: { symbol?: string | null; price_notes?: string | null } | null | undefined,
): { name: string; symbol: string } {
  if (!holding?.symbol) return { name: 'Kapanmış pozisyon', symbol: '' };
  return { name: assetName(holding.symbol, holding.price_notes), symbol: String(holding.symbol) };
}

function looksLikeId(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);
}
