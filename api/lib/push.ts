// Web Push gönderimi (cron'lardan çağrılır). VAPID_PRIVATE_KEY Vercel env'de;
// public anahtar istemcide de gömülü (src/config VAPID_PUBLIC_KEY, gizli değil).
// Ölü abonelikler (404/410) gönderim sırasında tablodan silinir.

import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env eksik');
  return createClient(url, key);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; failed: number; removed: number }> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID anahtarları env\'de yok — gönderim atlandı');
    return { sent: 0, failed: 0, removed: 0 };
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:tantuncer6@gmail.com',
    publicKey,
    privateKey
  );

  const supabase = getSupabase();
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth');
  if (error || !subs || subs.length === 0) return { sent: 0, failed: 0, removed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 3600 }
        );
        sent += 1;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(s.id);
        else failed += 1;
      }
    })
  );

  if (dead.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', dead);
  }
  return { sent, failed, removed: dead.length };
}
