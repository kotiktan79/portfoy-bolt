export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        console.log('Service Worker registered:', registration);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateNotification();
              }
            });
          }
        });

        if (registration.waiting) {
          showUpdateNotification();
        }
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    });
  }
}

function showUpdateNotification() {
  const updateBanner = document.createElement('div');
  updateBanner.className = 'fixed bottom-4 left-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50 flex items-center justify-between';
  updateBanner.innerHTML = `
    <span>Yeni versiyon mevcut!</span>
    <button id="update-btn" class="bg-white text-blue-600 px-4 py-2 rounded font-semibold hover:bg-blue-50 transition-colors">
      Güncelle
    </button>
  `;
  document.body.appendChild(updateBanner);

  document.getElementById('update-btn')?.addEventListener('click', () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  });
}

export function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    showInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallButton();
    console.log('PWA installed successfully');
  });
}

function showInstallButton() {
  const installButton = document.getElementById('install-pwa-btn');
  if (installButton) {
    installButton.style.display = 'flex';
  }
}

function hideInstallButton() {
  const installButton = document.getElementById('install-pwa-btn');
  if (installButton) {
    installButton.style.display = 'none';
  }
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) {
    return false;
  }

  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  deferredPrompt = null;
  hideInstallButton();

  return outcome === 'accepted';
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

export function canInstall(): boolean {
  return deferredPrompt !== null;
}

export async function checkForUpdates() {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.update();
    }
  }
}

export async function enableBackgroundSync() {
  if ('serviceWorker' in navigator && 'sync' in (self as any).registration) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as any).sync.register('sync-portfolio');
      return true;
    } catch (error) {
      console.error('Background sync registration failed:', error);
      return false;
    }
  }
  return false;
}

export function getConnectionStatus(): {
  online: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
} {
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

  return {
    online: navigator.onLine,
    effectiveType: connection?.effectiveType,
    downlink: connection?.downlink,
    rtt: connection?.rtt,
  };
}

export function setupConnectionListener(callback: (online: boolean) => void) {
  window.addEventListener('online', () => callback(true));
  window.addEventListener('offline', () => callback(false));

  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

  if (connection) {
    connection.addEventListener('change', () => {
      callback(navigator.onLine);
    });
  }
}

export async function clearAppCache() {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(cacheName => caches.delete(cacheName))
    );
  }
}

export async function getCacheSize(): Promise<number> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return estimate.usage || 0;
  }
  return 0;
}

export function setupTouchGestures(element: HTMLElement, callbacks: {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onPinch?: (scale: number) => void;
}) {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  let initialDistance = 0;

  element.addEventListener('touchstart', (e: TouchEvent) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;

    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialDistance = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });

  element.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length === 2 && callbacks.onPinch) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);
      const scale = currentDistance / initialDistance;
      callbacks.onPinch(scale);
    }
  }, { passive: true });

  element.addEventListener('touchend', (e: TouchEvent) => {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    const minSwipeDistance = 50;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (Math.abs(deltaX) > minSwipeDistance) {
        if (deltaX > 0 && callbacks.onSwipeRight) {
          callbacks.onSwipeRight();
        } else if (deltaX < 0 && callbacks.onSwipeLeft) {
          callbacks.onSwipeLeft();
        }
      }
    } else {
      if (Math.abs(deltaY) > minSwipeDistance) {
        if (deltaY > 0 && callbacks.onSwipeDown) {
          callbacks.onSwipeDown();
        } else if (deltaY < 0 && callbacks.onSwipeUp) {
          callbacks.onSwipeUp();
        }
      }
    }
  }, { passive: true });
}

export function enablePullToRefresh(callback: () => Promise<void>) {
  let touchStartY = 0;
  let pulling = false;

  document.addEventListener('touchstart', (e: TouchEvent) => {
    if (window.scrollY === 0) {
      touchStartY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e: TouchEvent) => {
    if (!pulling) return;

    const touchY = e.touches[0].clientY;
    const pullDistance = touchY - touchStartY;

    if (pullDistance > 100 && window.scrollY === 0) {
      pulling = false;
      callback();
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    pulling = false;
  }, { passive: true });
}
