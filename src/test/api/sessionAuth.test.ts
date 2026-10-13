import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cronHeaderOk,
  extractBearer,
  requireCronAuth,
  requirePortfolioAccess,
  type SessionDeps,
} from '../../../api/lib/auth';
import { isAllowedOrigin } from '../../../api/lib/cors';
import { getServiceSupabase } from '../../../api/lib/serviceSupabase';
import { headersWithToken } from '../../lib/apiAuth';
import chatHandler from '../../../api/chat';
import dailyPlanHandler from '../../../api/daily-plan';
import binanceHandler from '../../../api/binance';
import researchHandler from '../../../api/cron/ai-research';

const ENV_KEYS = [
  'CRON_SECRET',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'VERCEL_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  delete process.env.CRON_SECRET;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function mockRes() {
  return {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string | number>,
    setHeader(name: string, value: string | number) {
      this.headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

function deps(overrides: Partial<SessionDeps> = {}): SessionDeps {
  return {
    getUserId: vi.fn(async () => 'owner-1'),
    isOwner: vi.fn(async () => true),
    ...overrides,
  };
}

describe('cronHeaderOk', () => {
  it('gizli yoksa her isteği reddeder', () => {
    expect(cronHeaderOk('Bearer herhangi', undefined)).toBe(false);
    expect(cronHeaderOk('Bearer herhangi', '')).toBe(false);
  });

  it('aynı Bearer değerini kabul eder, yanlışı reddeder', () => {
    expect(cronHeaderOk('Bearer gizli-123', 'gizli-123')).toBe(true);
    expect(cronHeaderOk('Bearer gizli-124', 'gizli-123')).toBe(false);
    expect(cronHeaderOk('bearer gizli-123', 'gizli-123')).toBe(false);
    expect(cronHeaderOk(undefined, 'gizli-123')).toBe(false);
  });

  it('dizi başlığın ilk değerine bakar', () => {
    expect(cronHeaderOk(['Bearer gizli-123'], 'gizli-123')).toBe(true);
  });
});

describe('extractBearer', () => {
  it('şema büyük-küçük harf duyarsız token döner', () => {
    expect(extractBearer('Bearer abc.def')).toBe('abc.def');
    expect(extractBearer('bearer abc.def')).toBe('abc.def');
  });

  it('boş veya bozuk başlıkta null', () => {
    expect(extractBearer(undefined)).toBeNull();
    expect(extractBearer('Basic abc')).toBeNull();
    expect(extractBearer('Bearer ')).toBeNull();
  });
});

describe('requireCronAuth', () => {
  it('eşleşmeyen çağrıyı 401 ile keser', () => {
    process.env.CRON_SECRET = 'cron-s';
    const res = mockRes();
    const rejected = requireCronAuth(
      { headers: { authorization: 'Bearer yanlis' } } as never,
      res as never,
    );
    expect(rejected).toBe(true);
    expect(res.statusCode).toBe(401);
  });

  it('doğru gizliyi geçirir', () => {
    process.env.CRON_SECRET = 'cron-s';
    const res = mockRes();
    const rejected = requireCronAuth(
      { headers: { authorization: 'Bearer cron-s' } } as never,
      res as never,
    );
    expect(rejected).toBe(false);
    expect(res.statusCode).toBe(0);
  });
});

describe('requirePortfolioAccess', () => {
  it('oturum yoksa kullanıcı kontrolü yapmadan 401', async () => {
    const checker = deps();
    const res = mockRes();
    const rejected = await requirePortfolioAccess(
      { headers: {} } as never,
      res as never,
      checker,
    );
    expect(rejected).toBe(true);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(checker.getUserId).not.toHaveBeenCalled();
  });

  it('CRON_SECRET kullanıcı kontrolünü atlar', async () => {
    process.env.CRON_SECRET = 'cron-s';
    const checker = deps();
    const res = mockRes();
    const rejected = await requirePortfolioAccess(
      { headers: { authorization: 'Bearer cron-s' } } as never,
      res as never,
      checker,
    );
    expect(rejected).toBe(false);
    expect(checker.getUserId).not.toHaveBeenCalled();
    expect(checker.isOwner).not.toHaveBeenCalled();
  });

  it('geçersiz JWT 401', async () => {
    const checker = deps({ getUserId: vi.fn(async () => null) });
    const res = mockRes();
    const rejected = await requirePortfolioAccess(
      { headers: { authorization: 'Bearer jwt-token' } } as never,
      res as never,
      checker,
    );
    expect(rejected).toBe(true);
    expect(res.statusCode).toBe(401);
    expect(checker.isOwner).not.toHaveBeenCalled();
  });

  it('giriş yapmış ama sahip olmayan hesabı reddeder', async () => {
    const checker = deps({ isOwner: vi.fn(async () => false) });
    const res = mockRes();
    const rejected = await requirePortfolioAccess(
      { headers: { authorization: 'Bearer jwt-token' } } as never,
      res as never,
      checker,
    );
    expect(rejected).toBe(true);
    expect(checker.isOwner).toHaveBeenCalledWith('owner-1');
  });

  it('sahiplik kontrolü hata verirse kapalı kalır', async () => {
    const checker = deps({ isOwner: vi.fn(async () => null) });
    const res = mockRes();
    const rejected = await requirePortfolioAccess(
      { headers: { authorization: 'Bearer jwt-token' } } as never,
      res as never,
      checker,
    );
    expect(rejected).toBe(true);
    expect(res.statusCode).toBe(401);
  });

  it('sahip oturumunu geçirir', async () => {
    const checker = deps();
    const res = mockRes();
    const rejected = await requirePortfolioAccess(
      { headers: { authorization: 'Bearer jwt-token' } } as never,
      res as never,
      checker,
    );
    expect(rejected).toBe(false);
    expect(res.statusCode).toBe(0);
  });
});

describe('getServiceSupabase', () => {
  it('anon anahtarına düşmez', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => getServiceSupabase()).toThrow(/SERVICE_ROLE/);
  });
});

describe('headersWithToken', () => {
  it('token varsa Authorization ekler', () => {
    expect(headersWithToken('abc', { 'Content-Type': 'application/json' })).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer abc',
    });
  });

  it('token yoksa mevcut başlıkları olduğu gibi bırakır', () => {
    expect(headersWithToken(null, { 'Content-Type': 'application/json' })).toEqual({
      'Content-Type': 'application/json',
    });
  });
});

describe('isAllowedOrigin', () => {
  it('uygulama adresi ve localhost serbest, yabancı site değil', () => {
    expect(isAllowedOrigin('https://portfoy-bolt.vercel.app')).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin(undefined)).toBe(false);
  });
});

describe('korunan API uçları', () => {
  it('sohbet oturumsuz isteği 401 ile keser', async () => {
    const res = mockRes();
    await chatHandler({ method: 'POST', headers: {}, body: { question: 'bakiye?' } } as never, res as never);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('sohbet ön kontrolü (OPTIONS) oturum istemez', async () => {
    const res = mockRes();
    await chatHandler({ method: 'OPTIONS', headers: {} } as never, res as never);
    expect(res.statusCode).toBe(200);
  });

  it('günlük plan oturumsuz isteği 401 ile keser', async () => {
    const res = mockRes();
    await dailyPlanHandler({ method: 'POST', headers: {}, body: {} } as never, res as never);
    expect(res.statusCode).toBe(401);
  });

  it('Binance bakiye ucu oturumsuz isteği 401 ile keser', async () => {
    const res = mockRes();
    await binanceHandler({ method: 'GET', headers: {}, query: {} } as never, res as never);
    expect(res.statusCode).toBe(401);
  });

  it('AI araştırma oturumsuz isteği 401 ile keser', async () => {
    const res = mockRes();
    await researchHandler({ method: 'GET', headers: {}, query: {} } as never, res as never);
    expect(res.statusCode).toBe(401);
  });
});
