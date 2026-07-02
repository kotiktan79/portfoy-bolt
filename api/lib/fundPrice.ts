// TEFAS fon fiyatı — resmi yeni (2025+) TEFAS API'si.
//
// Eski /api/DB/BindHistoryInfo 2026'da kapatıldı (ERR-006). Yeni API:
//   POST https://www.tefas.gov.tr/api/funds/fonBilgiGetir  {"fonKodu":"GPA"}
//   → {"errorCode":..,"errorMessage":..,"resultList":[{"sonFiyat":22.59,...}]}
//
// TEFAS WAF'ı aralıklı olarak boş gövde/timeout döndürür; bu yüzden
// exponential backoff'lu 3 deneme yapılır (borsapy ile aynı strateji).

export interface FundQuote {
  price: number;
  name: string | null;
}

const TEFAS_URL = 'https://www.tefas.gov.tr/api/funds/fonBilgiGetir';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export async function fetchTefasFundPrice(code: string): Promise<FundQuote | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 500 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(TEFAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': UA,
        },
        body: JSON.stringify({ fonKodu: code.toUpperCase().trim() }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.errorMessage) return null; // kod bulunamadı vb. — retry anlamsız
      const fund = data?.resultList?.[0];
      const price = Number(fund?.sonFiyat);
      if (isFinite(price) && price > 0) {
        return { price, name: fund?.fonUnvan ?? null };
      }
    } catch {
      // WAF timeout/boş gövde — tekrar dene
    }
  }
  return null;
}
