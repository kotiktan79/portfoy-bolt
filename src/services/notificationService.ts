export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export function showNotification(title: string, options?: NotificationOptions): void {
  if (Notification.permission === 'granted') {
    new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });
  }
}

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

export function playAlertSound(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = 880;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);

    oscillator.onended = () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };
  } catch (error) {
    console.error('Failed to play alert sound:', error);
  }
}

export function notifyPriceAlert(symbol: string, currentPrice: number, targetPrice: number, direction: 'above' | 'below'): void {
  const title = `🔔 ${symbol} Fiyat Alarmı!`;
  const body = direction === 'above'
    ? `${symbol} hedef fiyatın üzerine çıktı: ${currentPrice.toFixed(2)} ₺ (Hedef: ${targetPrice.toFixed(2)} ₺)`
    : `${symbol} hedef fiyatın altına düştü: ${currentPrice.toFixed(2)} ₺ (Hedef: ${targetPrice.toFixed(2)} ₺)`;

  showNotification(title, {
    body,
    tag: `price-alert-${symbol}`,
    requireInteraction: true,
  });

  playAlertSound();
}

export function notifyAchievementUnlocked(title: string, description: string): void {
  showNotification('🏆 Yeni Başarı Kazanıldı!', {
    body: `${title}: ${description}`,
    tag: 'achievement-unlock',
  });
}

export function notifyPortfolioMilestone(message: string): void {
  showNotification('📈 Portföy Kilometre Taşı!', {
    body: message,
    tag: 'portfolio-milestone',
  });
}

export function getNotificationPermissionStatus(): NotificationPermission {
  if (!('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}
