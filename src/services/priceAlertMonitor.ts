import { supabase } from '../lib/supabase';
import { notifyPriceAlert } from './notificationService';

interface PriceAlert {
  id: string;
  symbol: string;
  target_price: number;
  condition: 'above' | 'below';
  is_active: boolean;
}

let monitorInterval: ReturnType<typeof setInterval> | null = null;

export function startPriceAlertMonitor(getHoldings: () => Array<{ symbol: string; current_price: number }>) {
  if (monitorInterval) return; // already running

  async function checkAlerts() {
    try {
      const { data: alerts } = await supabase
        .from('price_alerts')
        .select('*')
        .eq('is_active', true);

      if (!alerts || alerts.length === 0) return;

      const holdings = getHoldings();
      if (holdings.length === 0) return;

      for (const alert of alerts as PriceAlert[]) {
        const holding = holdings.find(h => h.symbol === alert.symbol);
        if (!holding || holding.current_price <= 0) continue;

        const shouldTrigger =
          (alert.condition === 'above' && holding.current_price >= alert.target_price) ||
          (alert.condition === 'below' && holding.current_price <= alert.target_price);

        if (shouldTrigger) {
          notifyPriceAlert(alert.symbol, holding.current_price, alert.target_price, alert.condition);

          await supabase
            .from('price_alerts')
            .update({ is_active: false, triggered_at: new Date().toISOString() })
            .eq('id', alert.id);
        }
      }
    } catch (error) {
      console.error('Price alert check error:', error);
    }
  }

  // Check immediately, then every 30 seconds
  checkAlerts();
  monitorInterval = setInterval(checkAlerts, 30000);
}

export function stopPriceAlertMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}
