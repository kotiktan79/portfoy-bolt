import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from './serviceSupabase.js';

export type HeaderValue = string | string[] | undefined;

export function firstHeader(value: HeaderValue): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Uzunluk farkında erken çıkar; eşit uzunlukta sabit süreli karşılaştırma. */
export function cronHeaderOk(authorization: HeaderValue, secret: string | undefined): boolean {
  if (!secret) return false;
  const raw = firstHeader(authorization);
  if (!raw) return false;
  const expected = `Bearer ${secret}`;
  if (raw.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < raw.length; i++) {
    mismatch |= raw.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export function extractBearer(authorization: HeaderValue): string | null {
  const raw = firstHeader(authorization);
  if (!raw) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(raw);
  return match ? match[1] : null;
}

export interface SessionDeps {
  getUserId(token: string): Promise<string | null>;
  /** true = sahip, false = değil, null = kontrol edilemedi (kapalı başarısız). */
  isOwner(userId: string): Promise<boolean | null>;
}

/**
 * Fail-CLOSED authorization for scheduled cron endpoints.
 *
 * Requires CRON_SECRET to be configured in the project env AND the request to
 * carry a matching `Authorization: Bearer <CRON_SECRET>` header. Vercel Cron
 * sends this header automatically once CRON_SECRET is set in the project's
 * environment variables, so legitimate scheduled invocations keep working.
 *
 * If CRON_SECRET is missing the endpoint denies ALL traffic (fail closed).
 *
 * Returns true when the request was rejected (the response has been ended and
 * the caller should `return` immediately). Returns false when authorized.
 */
export function requireCronAuth(req: VercelRequest, res: VercelResponse): boolean {
  if (!cronHeaderOk(req.headers.authorization, process.env.CRON_SECRET)) {
    res.status(401).json({ error: 'Unauthorized' });
    return true;
  }
  return false;
}

/**
 * True when the request carries a valid CRON_SECRET bearer token.
 * Sunucudan sunucuya çağrılar (Vercel Cron, confirm-split) bunu kullanır.
 */
export function hasCronAuth(req: VercelRequest): boolean {
  return cronHeaderOk(req.headers.authorization, process.env.CRON_SECRET);
}

async function defaultGetUserId(token: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return data.user.id;
}

async function defaultIsOwner(userId: string): Promise<boolean | null> {
  try {
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from('portfoy_bolt_owners')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return null;
    return data?.user_id === userId;
  } catch {
    return null;
  }
}

const defaultDeps: SessionDeps = {
  getUserId: defaultGetUserId,
  isOwner: defaultIsOwner,
};

/**
 * Portföy verisi veya AI kredisi harcayan uçlar için.
 * Geçerli yol: CRON_SECRET (sunucudan sunucuya) VEYA Supabase JWT'si
 * portfoy_bolt_owners tablosundaki sahip.
 * Reddedildiyse true döner ve 401 yazılmıştır.
 */
export async function requirePortfolioAccess(
  req: VercelRequest,
  res: VercelResponse,
  deps: SessionDeps = defaultDeps,
): Promise<boolean> {
  if (cronHeaderOk(req.headers.authorization, process.env.CRON_SECRET)) {
    return false;
  }

  const token = extractBearer(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return true;
  }

  const userId = await deps.getUserId(token);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return true;
  }

  const owner = await deps.isOwner(userId);
  if (owner !== true) {
    res.status(401).json({ error: 'Unauthorized' });
    return true;
  }

  return false;
}
