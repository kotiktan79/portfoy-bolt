// Türkiye gram altın (satış). Binlik nokta silinir, virgül ondalık olur.
// Aralık dışı veya boş değer yazılmaz.

export function parseTruncgilGram(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const num = parseFloat(String(raw).replace(/\./g, '').replace(',', '.'));
  if (Number.isFinite(num) && num > 1000 && num < 50000) return num;
  return null;
}

export async function fetchTRGramGold(): Promise<number | null> {
  try {
    const res = await fetch('https://finans.truncgil.com/today.json', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const raw = d?.['gram-altin']?.['Satış'] ?? d?.['gram-altin']?.['Selling'];
    return parseTruncgilGram(raw);
  } catch {
    return null;
  }
}
