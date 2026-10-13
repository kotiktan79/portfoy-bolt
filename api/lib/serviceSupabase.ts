import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Sunucu yazma/okuma istemcisi. Yalnız service-role.
 * Anon anahtara düşmez: anon rolünün tablo yetkisi kaldırıldı
 * (20260604010000). Anahtar yoksa boş veri yazmak yerine hata verir.
 */
export function getServiceSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY zorunlu');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
