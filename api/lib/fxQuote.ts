// Birincil kur (open.er-api, günde bir kez) takılırsa Yahoo EURTRY=X, olmazsa
// Frankfurter (ECB referans kuru), o da olmazsa ECB veri API'si.
// Karar fxStaleGuard'da. Bu dosya yalnız çeker.

import {
  decideFxRate,
  FX_SANITY_LIMIT,
  type FxDecision,
  type FxSample,
} from './fxStaleGuard.js';

export type { FxDecision, FxSample };

const YAHOO_SYMBOL: Record<string, string> = {
  USD: 'USDTRY=X',
  EUR: 'EURTRY=X',
  GBP: 'GBPTRY=X',
  CHF: 'CHFTRY=X',
  RON: 'RONTRY=X',
  RUB: 'RUBTRY=X',
};

export interface SecondaryOpts {
  allowYahoo?: boolean;
  allowEcb?: boolean;
  /** Varsa, %10'dan uzak yedek atlanır ve sıradaki denenir. */
  primary?: number | null;
}

function positive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

async function getJson(url: string, headers?: Record<string, string>): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export function parseYahooTryPrice(body: unknown): number | null {
  const price = Number((body as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: unknown } }> } })
    ?.chart?.result?.[0]?.meta?.regularMarketPrice);
  return positive(price) ? price : null;
}

export function parseFrankfurterTry(body: unknown): number | null {
  if (Array.isArray(body)) {
    const row = body.find(r => r && typeof r === 'object' && (r as { quote?: string }).quote === 'TRY') as { rate?: unknown } | undefined;
    const rate = Number(row?.rate ?? (body[0] as { rate?: unknown } | undefined)?.rate);
    return positive(rate) ? rate : null;
  }
  const rate = Number((body as { rates?: { TRY?: unknown } })?.rates?.TRY);
  return positive(rate) ? rate : null;
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseEcbObservation(csv: string): number | null {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const header = splitCsv(lines[0]);
  const idx = header.indexOf('OBS_VALUE');
  if (idx < 0) return null;
  const rate = Number(splitCsv(lines[lines.length - 1])[idx]);
  return positive(rate) ? rate : null;
}

export async function fetchOpenErTry(currency: string): Promise<number | null> {
  const body = await getJson(`https://open.er-api.com/v6/latest/${encodeURIComponent(currency)}`);
  const rate = Number((body as { rates?: { TRY?: unknown } } | null)?.rates?.TRY);
  return positive(rate) ? rate : null;
}

async function fetchYahooTry(currency: string): Promise<number | null> {
  const symbol = YAHOO_SYMBOL[currency.toUpperCase()];
  if (!symbol) return null;
  const body = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
    { 'User-Agent': 'Mozilla/5.0' },
  );
  return parseYahooTryPrice(body);
}

async function fetchFrankfurterTry(currency: string): Promise<number | null> {
  const ccy = encodeURIComponent(currency);
  const v2 = await getJson(`https://api.frankfurter.dev/v2/rates?base=${ccy}&quotes=TRY`);
  const fromV2 = parseFrankfurterTry(v2);
  if (fromV2 != null) return fromV2;
  const v1 = await getJson(`https://api.frankfurter.dev/v1/latest?from=${ccy}&to=TRY`);
  return parseFrankfurterTry(v1);
}

async function fetchEcbTry(currency: string): Promise<number | null> {
  const text = await getText(
    `https://data-api.ecb.europa.eu/service/data/EXR/D.TRY.${encodeURIComponent(currency)}.SP00.A?lastNObservations=1&format=csvdata`,
  );
  if (!text) return null;
  return parseEcbObservation(text);
}

function withinSanity(primary: number | null | undefined, rate: number): boolean {
  if (!positive(primary)) return true;
  return Math.abs(primary - rate) / rate <= FX_SANITY_LIMIT;
}

export async function fetchSecondaryTry(
  currency: string,
  opts: SecondaryOpts = {},
): Promise<{ rate: number; name: string } | null> {
  const attempts: Array<() => Promise<{ rate: number; name: string } | null>> = [];
  if (opts.allowYahoo !== false) {
    attempts.push(async () => {
      const rate = await fetchYahooTry(currency);
      return rate != null ? { rate, name: 'yahoo' } : null;
    });
  }
  attempts.push(async () => {
    const rate = await fetchFrankfurterTry(currency);
    return rate != null ? { rate, name: 'frankfurter' } : null;
  });
  if (opts.allowEcb !== false) {
    attempts.push(async () => {
      const rate = await fetchEcbTry(currency);
      return rate != null ? { rate, name: 'ecb' } : null;
    });
  }

  let first: { rate: number; name: string } | null = null;
  for (const attempt of attempts) {
    const quote = await attempt();
    if (!quote) continue;
    if (!first) first = quote;
    if (withinSanity(opts.primary, quote.rate)) return quote;
  }
  return first;
}

export async function resolveTryRate(
  currency: string,
  recent: FxSample[] = [],
  opts: SecondaryOpts & { now?: number; primary?: number | null } = {},
): Promise<FxDecision> {
  const ccy = currency.toUpperCase();
  const primary = Object.prototype.hasOwnProperty.call(opts, 'primary')
    ? (positive(opts.primary) ? opts.primary : null)
    : await fetchOpenErTry(ccy);
  const secondary = await fetchSecondaryTry(ccy, { ...opts, primary });
  return decideFxRate({
    pair: `${ccy}/TRY`,
    primary,
    secondary: secondary?.rate ?? null,
    secondaryName: secondary?.name ?? null,
    recent,
    now: opts.now,
  });
}
