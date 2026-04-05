import { Holding } from '../lib/supabase';
import { showNotification, playAlertSound } from './notificationService';

export type AlertSeverity = 'critical' | 'warning' | 'opportunity';
export type AlertType = 'price_drop_5' | 'price_drop_10' | 'price_up_20' | 'stop_loss' | 'big_daily_move';

export interface Alert {
  symbol: string;
  type: AlertType;
  message: string;
  severity: AlertSeverity;
  timestamp: number;
}

const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const STORAGE_KEY_LAST_ALERTS = 'smart_alert_last_times';
const STORAGE_KEY_PREV_PRICES = 'smart_alert_prev_prices';

function getLastAlertTimes(): Record<string, number> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_LAST_ALERTS);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function setLastAlertTime(symbol: string, type: AlertType): void {
  const times = getLastAlertTimes();
  times[`${symbol}_${type}`] = Date.now();
  localStorage.setItem(STORAGE_KEY_LAST_ALERTS, JSON.stringify(times));
}

function canAlert(symbol: string, type: AlertType): boolean {
  const times = getLastAlertTimes();
  const last = times[`${symbol}_${type}`];
  if (!last) return true;
  return Date.now() - last > ALERT_COOLDOWN_MS;
}

export function getPreviousPrices(): Record<string, number> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PREV_PRICES);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function savePreviousPrices(prices: Record<string, number>): void {
  localStorage.setItem(STORAGE_KEY_PREV_PRICES, JSON.stringify(prices));
}

export function checkAlerts(
  holdings: Holding[],
  previousPrices: Record<string, number>
): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();

  for (const holding of holdings) {
    if (holding.asset_type === 'cash') continue;
    if (holding.current_price <= 0 || holding.purchase_price <= 0) continue;

    const { symbol, purchase_price, current_price } = holding;
    const changeFromPurchase = ((current_price - purchase_price) / purchase_price) * 100;

    // Stop-loss hit (price below 85% of purchase)
    if (current_price < purchase_price * 0.85 && canAlert(symbol, 'stop_loss')) {
      alerts.push({
        symbol,
        type: 'stop_loss',
        message: `\u{1F6A8} ${symbol} stop-loss seviyesinde! (Al\u0131\u015F: ${purchase_price.toFixed(0)}\u20BA \u2192 G\u00FCncel: ${current_price.toFixed(0)}\u20BA, %${Math.abs(changeFromPurchase).toFixed(1)} d\u00FC\u015F\u00FC\u015F)`,
        severity: 'critical',
        timestamp: now,
      });
    }
    // Price drop >10%
    else if (changeFromPurchase <= -10 && canAlert(symbol, 'price_drop_10')) {
      alerts.push({
        symbol,
        type: 'price_drop_10',
        message: `\u{1F534} ${symbol} %${Math.abs(changeFromPurchase).toFixed(1)} zararda! Stop-loss de\u011Ferlendirin.`,
        severity: 'critical',
        timestamp: now,
      });
    }
    // Price drop >5%
    else if (changeFromPurchase <= -5 && canAlert(symbol, 'price_drop_5')) {
      alerts.push({
        symbol,
        type: 'price_drop_5',
        message: `\u26A0\uFE0F ${symbol} %${Math.abs(changeFromPurchase).toFixed(1)} d\u00FC\u015Ft\u00FC! (Al\u0131\u015F: ${purchase_price.toFixed(0)}\u20BA \u2192 G\u00FCncel: ${current_price.toFixed(0)}\u20BA)`,
        severity: 'warning',
        timestamp: now,
      });
    }

    // Price up >20%
    if (changeFromPurchase >= 20 && canAlert(symbol, 'price_up_20')) {
      alerts.push({
        symbol,
        type: 'price_up_20',
        message: `\u{1F7E2} ${symbol} %${changeFromPurchase.toFixed(1)} k\u00E2rda! K\u00E2r realizasyonu d\u00FC\u015F\u00FCn\u00FCn.`,
        severity: 'opportunity',
        timestamp: now,
      });
    }

    // Big daily move >3%
    const prevPrice = previousPrices[symbol];
    if (prevPrice && prevPrice > 0) {
      const dailyChange = ((current_price - prevPrice) / prevPrice) * 100;
      if (Math.abs(dailyChange) > 3 && canAlert(symbol, 'big_daily_move')) {
        const direction = dailyChange > 0 ? 'y\u00FCkseldi' : 'd\u00FC\u015Ft\u00FC';
        const icon = dailyChange > 0 ? '\u{1F4C8}' : '\u{1F4C9}';
        alerts.push({
          symbol,
          type: 'big_daily_move',
          message: `${icon} ${symbol} bug\u00FCn %${Math.abs(dailyChange).toFixed(1)} ${direction}! (${prevPrice.toFixed(0)}\u20BA \u2192 ${current_price.toFixed(0)}\u20BA)`,
          severity: dailyChange > 0 ? 'opportunity' : 'warning',
          timestamp: now,
        });
      }
    }
  }

  return alerts;
}

export function runAlertCheck(holdings: Holding[]): void {
  const previousPrices = getPreviousPrices();
  const alerts = checkAlerts(holdings, previousPrices);

  for (const alert of alerts) {
    setLastAlertTime(alert.symbol, alert.type);

    showNotification(
      alert.severity === 'critical'
        ? 'Kritik Portf\u00F6y Uyar\u0131s\u0131'
        : alert.severity === 'warning'
          ? 'Portf\u00F6y Uyar\u0131s\u0131'
          : 'Portf\u00F6y F\u0131rsat\u0131',
      {
        body: alert.message,
        tag: `smart-alert-${alert.symbol}-${alert.type}`,
      }
    );

    if (alert.severity === 'critical') {
      playAlertSound();
    }
  }

  // Save current prices for next daily move comparison
  const currentPrices: Record<string, number> = {};
  for (const h of holdings) {
    if (h.current_price > 0 && h.asset_type !== 'cash') {
      currentPrices[h.symbol] = h.current_price;
    }
  }
  savePreviousPrices(currentPrices);
}
