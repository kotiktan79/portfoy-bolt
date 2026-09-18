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

// Son başarısızlığın sebebi — UI toast'ta gösterilir. iOS'ta en sık sebep:
// uygulama Safari sekmesinde açık (push için Ana Ekran'a eklenmiş olmalı, iOS 16.4+).
export let lastPushError = '';

function isIOS(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export async function subscribeToPush(): Promise<boolean> {
  lastPushError = '';
  try {
    if (!('serviceWorker' in navigator)) { lastPushError = 'Tarayıcı service worker desteklemiyor'; return false; }
    if (!('PushManager' in window)) {
      lastPushError = isIOS() && !isStandalone()
        ? 'iPhone: push için uygulamayı Safari → Paylaş → "Ana Ekrana Ekle" ile kur ve ORADAN aç'
        : 'Tarayıcı Web Push desteklemiyor';
      return false;
    }
    if (Notification.permission !== 'granted') { lastPushError = 'Bildirim izni verilmemiş (' + Notification.permission + ')'; return false; }

    const registration = await navigator.serviceWorker.ready;
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) { lastPushError = 'Abonelik anahtarları eksik'; return false; }

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
      lastPushError = 'Sunucuya kaydedilemedi: ' + error.message;
      console.error('Push aboneliği kaydedilemedi:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    lastPushError = e instanceof Error ? e.message : String(e);
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
