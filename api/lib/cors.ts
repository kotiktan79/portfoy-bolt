import type { VercelRequest, VercelResponse } from '@vercel/node';

const FIXED_ORIGINS = new Set([
  'https://portfoy-bolt.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (FIXED_ORIGINS.has(origin)) return true;
  const vercel = process.env.VERCEL_URL;
  if (vercel && origin === `https://${vercel}`) return true;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod && (origin === `https://${prod}` || origin === prod)) return true;
  return false;
}

/** Aynı kaynaktan gelen isteklerde tarayıcı CORS kontrolü yapmaz. Yabancı sitelere yansıma yok. */
export function applyApiCors(req: VercelRequest, res: VercelResponse, methods: string): void {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin as string);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
