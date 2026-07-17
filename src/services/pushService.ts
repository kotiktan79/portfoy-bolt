// Web Push aboneliği: bildirim izni verildikten sonra tarayıcının push
// aboneliğini alır ve push_subscriptions tablosuna yazar (cron'lar oradan okur).

import { supabase } from '../lib/supabase';
import { VAPID_PUBLIC_KEY } from '../config';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  // applicationServerKey ArrayBuffer-destekli BufferSource ister (SharedArrayBuffer olmaz)
  const output = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export async function subscribeToPush(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    if (Notification.permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 250),
      },
      { onConflict: 'endpoint' }
    );
    if (error) {
      console.error('Push aboneliği kaydedilemedi:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Push aboneliği başarısız:', e);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (!sub) return;
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch {
    // sessiz — abonelik zaten yoksa sorun değil
  }
}
