import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Fail-CLOSED authorization for scheduled cron endpoints.
 *
 * Requires CRON_SECRET to be configured in the project env AND the request to
 * carry a matching `Authorization: Bearer <CRON_SECRET>` header. Vercel Cron
 * sends this header automatically once CRON_SECRET is set in the project's
 * environment variables, so legitimate scheduled invocations keep working.
 *
 * If CRON_SECRET is missing the endpoint denies ALL traffic (fail closed),
 * the opposite of the previous `if (cronSecret && ...)` pattern which left the
 * endpoint fully public whenever the secret was unset.
 *
 * Returns true when the request was rejected (the response has been ended and
 * the caller should `return` immediately). Returns false when authorized.
 */
export function requireCronAuth(req: VercelRequest, res: VercelResponse): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return true;
  }
  return false;
}

/**
 * True when the request carries a valid CRON_SECRET bearer token. Used by
 * endpoints that are intentionally reachable without the secret (e.g. the
 * manual AI-research button) but want to grant elevated/forced behaviour only
 * to authenticated callers.
 */
export function hasCronAuth(req: VercelRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && req.headers.authorization === `Bearer ${cronSecret}`;
}
