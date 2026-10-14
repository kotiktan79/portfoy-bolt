import { afterEach, describe, expect, it } from 'vitest';
import {
  decideFxRate,
  FX_DEVIATION_LIMIT,
  FX_STALE_HOURS,
  FX_STALE_REPEAT,
  isStuckPrimary,
  type FxSample,
} from '../../../api/lib/fxStaleGuard';
import { parseEcbObservation, parseFrankfurterTry, parseYahooTryPrice, resolveTryRate } from '../../../api/lib/fxQuote';

const NOW = Date.parse('2026-10-13T21:00:00Z');

function hourly(rate: number, count: number, end = NOW): FxSample[] {
  return Array.from({ length: count }, (_, i) => ({
    rate,
    recordedAt: new Date(end - (i + 1) * 3_600_000).toISOString(),
  }));
}

describe('decideFxRate', () => {
  it('yedek %0.2 içindeyse birincil kalır', () => {
    const d = decideFxRate({
      pair: 'EUR/TRY',
      primary: 55.30,
      secondary: 55.31,
      secondaryName: 'yahoo',
      now: NOW,
    });
    expect(d.action).toBe('primary');
    expect(d.rate).toBe(55.30);
    expect(d.log).toBeNull();
  });

  it('tam %0.2 sapmada birincil kalır', () => {
    const secondary = 55.31;
    const primary = secondary * (1 + FX_DEVIATION_LIMIT);
    const d = decideFxRate({ pair: 'EUR/TRY', primary, secondary, secondaryName: 'yahoo', now: NOW });
    expect(d.action).toBe('primary');
  });

  it('13 Ekim: 55.11 birincil, Yahoo 55.31 → yedek', () => {
    const d = decideFxRate({
      pair: 'EUR/TRY',
      primary: 55.11,
      secondary: 55.31,
      secondaryName: 'yahoo',
      recent: hourly(55.11, 36),
      now: NOW,
    });
    expect(d.action).toBe('secondary');
    expect(d.rate).toBe(55.31);
    expect(d.stale).toBe(true);
    expect(d.deviation).toBeGreaterThan(FX_DEVIATION_LIMIT);
    expect(d.log).toMatch(/yahoo 55\.3100/);
    expect(d.log).toMatch(/55\.1100/);
  });

  it('geçmiş yokken de %0.2 üstü sapma yedeğe düşer (tek cron yazımı)', () => {
    const d = decideFxRate({
      pair: 'EUR/TRY',
      primary: 55.11,
      secondary: 55.31,
      secondaryName: 'yahoo',
      recent: [],
      now: NOW,
    });
    expect(d.stale).toBe(false);
    expect(d.action).toBe('secondary');
    expect(d.rate).toBe(55.31);
  });

  it('6 saatten kısa tekrar bayat sayılmaz', () => {
    const recent = Array.from({ length: 8 }, (_, i) => ({
      rate: 55.11,
      recordedAt: new Date(NOW - (i + 1) * 60_000).toISOString(),
    }));
    expect(isStuckPrimary(55.11, recent, NOW)).toBe(false);
    const d = decideFxRate({
      pair: 'EUR/TRY',
      primary: 55.11,
      secondary: 55.20,
      secondaryName: 'frankfurter',
      recent,
      now: NOW,
    });
    expect(d.stale).toBe(false);
    expect(d.action).toBe('primary');
  });

  it('bayat birincil, sapma %0.2 altında olsa da yedeği kullanır', () => {
    const recent = hourly(55.11, FX_STALE_REPEAT);
    const oldest = Date.parse(recent[recent.length - 1].recordedAt);
    expect(NOW - oldest).toBeGreaterThanOrEqual(FX_STALE_HOURS * 3_600_000);
    const d = decideFxRate({
      pair: 'EUR/TRY',
      primary: 55.11,
      secondary: 55.20,
      secondaryName: 'frankfurter',
      recent,
      now: NOW,
    });
    expect(d.stale).toBe(true);
    expect(d.deviation!).toBeLessThan(FX_DEVIATION_LIMIT);
    expect(d.action).toBe('secondary');
    expect(d.rate).toBe(55.20);
  });

  it('bayat ama yedek aynı kuru söylüyorsa birincil kalır ve gürültü yok', () => {
    const d = decideFxRate({
      pair: 'EUR/TRY',
      primary: 55.11,
      secondary: 55.11,
      secondaryName: 'yahoo',
      recent: hourly(55.11, 8),
      now: NOW,
    });
    expect(d.stale).toBe(true);
    expect(d.action).toBe('primary');
    expect(d.log).toBeNull();
  });

  it('%10 üstü tek yedek yok sayılır', () => {
    const d = decideFxRate({
      pair: 'EUR/TRY',
      primary: 55.11,
      secondary: 70,
      secondaryName: 'yahoo',
      recent: hourly(55.11, 8),
      now: NOW,
    });
    expect(d.action).toBe('primary');
    expect(d.rate).toBe(55.11);
    expect(d.log).toMatch(/yok sayıldı/);
  });

  it('birincil yoksa yedek yazılır', () => {
    const d = decideFxRate({ pair: 'USD/TRY', primary: null, secondary: 49.13, secondaryName: 'yahoo', now: NOW });
    expect(d.action).toBe('secondary');
    expect(d.rate).toBe(49.13);
  });

  it('ikisi de yoksa kur uydurulmaz', () => {
    const d = decideFxRate({ pair: 'EUR/TRY', primary: null, secondary: null, now: NOW });
    expect(d.action).toBe('none');
    expect(d.rate).toBeNull();
  });
});

describe('kur gövdesi ayrıştırma', () => {
  it('Yahoo chart fiyatı', () => {
    expect(parseYahooTryPrice({ chart: { result: [{ meta: { regularMarketPrice: 55.31 } }] } })).toBe(55.31);
    expect(parseYahooTryPrice({ chart: { result: [] } })).toBeNull();
  });

  it('Frankfurter v1 ve v2', () => {
    expect(parseFrankfurterTry({ rates: { TRY: 55.2921 } })).toBe(55.2921);
    expect(parseFrankfurterTry([{ date: '2026-10-14', base: 'EUR', quote: 'TRY', rate: 55.297 }])).toBe(55.297);
  });

  it('ECB CSV son gözlem', () => {
    const csv = [
      'KEY,FREQ,CURRENCY,TIME_PERIOD,OBS_VALUE,TITLE',
      'EXR.D.TRY.EUR.SP00.A,D,TRY,2026-10-14,55.2921,"Turkish lira/Euro, 2.15 pm"',
    ].join('\n');
    expect(parseEcbObservation(csv)).toBe(55.2921);
  });
});

describe('resolveTryRate', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function json(body: unknown, ok = true): Response {
    return new Response(JSON.stringify(body), { status: ok ? 200 : 500, headers: { 'Content-Type': 'application/json' } });
  }

  it('open.er 55.11 ve Yahoo 55.31 → Yahoo, Frankfurter çağrılmaz', async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('open.er-api.com')) return json({ rates: { TRY: 55.11 } });
      if (url.includes('finance.yahoo.com')) return json({ chart: { result: [{ meta: { regularMarketPrice: 55.31 } }] } });
      throw new Error('beklenmeyen istek ' + url);
    }) as typeof fetch;

    const d = await resolveTryRate('EUR', hourly(55.11, 36), { now: NOW });
    expect(d.action).toBe('secondary');
    expect(d.secondaryName).toBe('yahoo');
    expect(d.rate).toBe(55.31);
    expect(urls.some(u => u.includes('frankfurter'))).toBe(false);
    expect(urls.some(u => u.includes('ecb.europa.eu'))).toBe(false);
  });

  it('Yahoo bozuksa Frankfurter devreye girer', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('open.er-api.com')) return json({ rates: { TRY: 55.11 } });
      if (url.includes('finance.yahoo.com')) return json({ chart: { result: [{ meta: { regularMarketPrice: 551 } }] } });
      if (url.includes('frankfurter.dev/v2')) return json([{ quote: 'TRY', rate: 55.31 }]);
      return json({}, false);
    }) as typeof fetch;

    const d = await resolveTryRate('EUR', [], { now: NOW });
    expect(d.action).toBe('secondary');
    expect(d.secondaryName).toBe('frankfurter');
    expect(d.rate).toBe(55.31);
  });

  it('verilen birincil yeniden çekilmez (istemci exchangerate-api değeri)', async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('frankfurter.dev/v2')) return json([{ quote: 'TRY', rate: 55.31 }]);
      throw new Error('beklenmeyen istek ' + url);
    }) as typeof fetch;

    const d = await resolveTryRate('eur', hourly(55.11, 8), {
      now: NOW,
      allowYahoo: false,
      allowEcb: false,
      primary: 55.11,
    });
    expect(d.rate).toBe(55.31);
    expect(d.secondaryName).toBe('frankfurter');
    expect(urls.some(u => u.includes('open.er-api.com'))).toBe(false);
  });
});
