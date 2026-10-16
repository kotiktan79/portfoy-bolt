// TEFAS fon fiyatı — resmi (2026) tefas.gov.tr JSON API'si.
//
// Eski /api/DB/BindHistoryInfo 2026'da kapatıldı. Günlük NAV:
//   POST https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir
//        {"fonKodu":"GTL","dil":"TR","periyod":1}
//        → resultList[].{tarih, fiyat, fonUnvan}  (periyod: 1 = son 1 ay)
// Yedek (aynı son fiyat):
//   POST https://www.tefas.gov.tr/api/funds/fonBilgiGetir  {"fonKodu":"GTL"}
//        → resultList[0].sonFiyat
//
// Portföy sembolü her zaman TEFAS fon kodu değildir. GPY1PPF, Garanti'nin
// "GPY 1. Para Piyasası" adıyla tuttuğu fondur; tefas.gov.tr kodu GTL'dir
// (GPY kodu boş döner). GPA ve IPV kendi TEFAS kodlarıdır.
//
// TEFAS WAF'ı aralıklı olarak boş gövde/timeout döndürür; her uç için
// exponential backoff'lu 3 deneme yapılır.

export interface FundQuote {
  price: number;
  name: string | null;
  /** Günlük seri tarihi (YYYY-MM-DD). fonBilgiGetir yedeğinde null. */
  asOf: string | null;
}

interface TefasFundSpec {
  code: string;
  /** Dönen ünvan bu parçaların hepsini içermeli; yanlış fona yazmayı keser. */
  titleIncludes: string[];
}

/**
 * Portföy sembolü → TEFAS fon kodu.
 * Yalnızca tefas.gov.tr üzerinde fiyatı doğrulanmış fonlar.
 * 2026-10-16: GTL 0.142216, GPA 23.724091, IPV 80.255315.
 */
export const TEFAS_FUNDS: Readonly<Record<string, TefasFundSpec>> = {
  // Garanti Portföy Birinci Para Piyasası (TL) Fonu. Portföy sembolü GPY1PPF.
  GPY1PPF: { code: 'GTL', titleIncludes: ['BİRİNCİ PARA PİYASASI'] },
  // Garanti Portföy Eurobond Borçlanma Araçları (Döviz) Fonu.
  GPA: { code: 'GPA', titleIncludes: ['GARANTİ', 'EUROBOND'] },
  // İş Portföy Eurobond Borçlanma Araçları (Döviz) Fonu.
  IPV: { code: 'IPV', titleIncludes: ['İŞ PORTFÖY', 'EUROBOND'] },
};

const HISTORY_URL = 'https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir';
const INFO_URL = 'https://www.tefas.gov.tr/api/funds/fonBilgiGetir';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Günlük otomatik yazım: tek günde %25 üstü sapma parse/yanlış fon sayılır. */
export const DAILY_FUND_BAND = 0.25;
/** Manuel kilidi açan ilk yazım: 5 kattan büyük sapma birim hatası sayılır, satır durur. */
export const MANUAL_UNLOCK_FACTOR = 5;

export function tefasCodeForSymbol(symbol: string | null | undefined): string | null {
  const key = String(symbol || '').trim().toUpperCase();
  return TEFAS_FUNDS[key]?.code ?? null;
}

function titleMatches(name: string | null, fragments: string[]): boolean {
  if (!name) return false;
  const upper = name.toLocaleUpperCase('tr-TR');
  return fragments.every(fragment => upper.includes(fragment.toLocaleUpperCase('tr-TR')));
}

export function latestHistoryPrice(resultList: unknown, expectedCode?: string): FundQuote | null {
  if (!Array.isArray(resultList)) return null;
  const want = expectedCode?.toUpperCase();
  let best: FundQuote | null = null;
  for (const row of resultList) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as { fonKodu?: unknown; fonUnvan?: unknown; tarih?: unknown; fiyat?: unknown };
    const code = String(rec.fonKodu || '').toUpperCase();
    if (want && code && code !== want) continue;
    const price = Number(rec.fiyat);
    const asOf = String(rec.tarih || '');
    if (!Number.isFinite(price) || price <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) continue;
    if (!best || asOf > (best.asOf || '')) {
      best = { price, name: rec.fonUnvan ? String(rec.fonUnvan) : null, asOf };
    }
  }
  return best;
}

export function infoPrice(resultList: unknown, expectedCode?: string): FundQuote | null {
  if (!Array.isArray(resultList) || !resultList[0] || typeof resultList[0] !== 'object') return null;
  const fund = resultList[0] as { fonKodu?: unknown; fonUnvan?: unknown; sonFiyat?: unknown };
  const code = String(fund.fonKodu || '').toUpperCase();
  if (expectedCode && code && code !== expectedCode.toUpperCase()) return null;
  const price = Number(fund.sonFiyat);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, name: fund.fonUnvan ? String(fund.fonUnvan) : null, asOf: null };
}

export type FundPriceRejectReason = 'manual-unmapped' | 'no-price' | 'daily-anomaly' | 'unlock-anomaly';

export type FundPricePlan =
  | { write: false; clearManual: false; reason: FundPriceRejectReason }
  | { write: true; clearManual: boolean; price: number };

/**
 * TEFAS (veya yedek) fiyatı yazılsın mı, manual_price kapatılsın mı?
 * Eşlenmemiş manuel fonlara dokunulmaz. Eşlenmiş fonda kilit, fiyat gerçekten
 * yazılırsa kalkar; alınamayan veya bant dışı fiyat satırı olduğu gibi bırakır.
 */
export function planFundAutoPrice(input: {
  symbol: string;
  manualPrice: boolean;
  oldPrice: number;
  nextPrice: number | null | undefined;
}): FundPricePlan {
  const mapped = tefasCodeForSymbol(input.symbol) != null;
  if (input.manualPrice && !mapped) {
    return { write: false, clearManual: false, reason: 'manual-unmapped' };
  }
  const next = Number(input.nextPrice);
  if (!Number.isFinite(next) || next <= 0) {
    return { write: false, clearManual: false, reason: 'no-price' };
  }
  const old = Number(input.oldPrice) || 0;
  if (old > 0) {
    if (input.manualPrice && mapped) {
      if (next < old / MANUAL_UNLOCK_FACTOR || next > old * MANUAL_UNLOCK_FACTOR) {
        return { write: false, clearManual: false, reason: 'unlock-anomaly' };
      }
    } else if (Math.abs(next - old) / old > DAILY_FUND_BAND) {
      return { write: false, clearManual: false, reason: 'daily-anomaly' };
    }
  }
  return { write: true, clearManual: input.manualPrice && mapped, price: next };
}

async function tefasPost(url: string, body: unknown): Promise<unknown | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 500 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': UA,
          Origin: 'https://www.tefas.gov.tr',
          Referer: 'https://www.tefas.gov.tr/',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data && typeof data === 'object' && 'errorMessage' in data && (data as { errorMessage?: unknown }).errorMessage) {
        return null;
      }
      return data;
    } catch {
      // WAF timeout/boş gövde — tekrar dene
    }
  }
  return null;
}

export async function fetchTefasFundPrice(codeOrSymbol: string): Promise<FundQuote | null> {
  const raw = String(codeOrSymbol || '').trim().toUpperCase();
  if (!raw) return null;
  const spec = TEFAS_FUNDS[raw];
  const fonKodu = spec?.code ?? raw;

  const history = await tefasPost(HISTORY_URL, { fonKodu, dil: 'TR', periyod: 1 });
  const historyList = history && typeof history === 'object' ? (history as { resultList?: unknown }).resultList : undefined;
  const fromHistory = latestHistoryPrice(historyList, fonKodu);
  const quote = fromHistory ?? await (async () => {
    const info = await tefasPost(INFO_URL, { fonKodu });
    const infoList = info && typeof info === 'object' ? (info as { resultList?: unknown }).resultList : undefined;
    return infoPrice(infoList, fonKodu);
  })();

  if (!quote) return null;
  if (spec && !titleMatches(quote.name, spec.titleIncludes)) return null;
  return quote;
}
