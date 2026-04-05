// Centralized configuration - replaces all hardcoded values across the app

// ── API URLs ──────────────────────────────────────────────────────────────
export const API_URLS = {
  BINANCE_REST: import.meta.env.VITE_BINANCE_API_URL || 'https://api.binance.com/api/v3/ticker/price',
  BINANCE_WS: import.meta.env.VITE_BINANCE_WS_URL || 'wss://stream.binance.com:9443/ws',
  EXCHANGE_RATE: import.meta.env.VITE_EXCHANGE_RATE_URL || 'https://api.exchangerate-api.com/v4/latest',
  OPEN_ER_API: import.meta.env.VITE_OPEN_ER_API_URL || 'https://open.er-api.com/v6/latest',
  METALS_API: import.meta.env.VITE_METALS_API_URL || 'https://api.metals.live/v1/spot',
} as const;

// ── Timing (milliseconds) ────────────────────────────────────────────────
export const TIMING = {
  WS_THROTTLE_MS: 3000,
  PRICE_REFRESH_INTERVAL: 30000,
  EXCHANGE_RATE_REFRESH_INTERVAL: 3600000,
  CACHE_CLEANUP_INTERVAL: 60000,
  HEALTH_CHECK_INTERVAL: 60000,
} as const;

// ── Currency ─────────────────────────────────────────────────────────────
export const DEFAULT_USD_TRY_RATE = 38.50;

// ── Auth ─────────────────────────────────────────────────────────────────
export const ANON_USER_ID = '00000000-0000-0000-0000-000000000001';
