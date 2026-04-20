import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, X, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { checkAlerts, getPreviousPrices, savePreviousPrices, Alert } from '../services/smartAlertService';
import { showNotification, playAlertSound } from '../services/notificationService';

const ALERT_COOLDOWN_MS = 30 * 60 * 1000;
const STORAGE_KEY_LAST_ALERTS = 'smart_alert_last_times';
const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 30_000;
const CHECK_INTERVAL_MS = 60_000;

function getLastAlertTimes(): Record<string, number> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_LAST_ALERTS);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function setLastAlertTime(symbol: string, type: string): void {
  const times = getLastAlertTimes();
  times[`${symbol}_${type}`] = Date.now();
  localStorage.setItem(STORAGE_KEY_LAST_ALERTS, JSON.stringify(times));
}

function canAlert(symbol: string, type: string): boolean {
  const times = getLastAlertTimes();
  const last = times[`${symbol}_${type}`];
  if (!last) return true;
  return Date.now() - last > ALERT_COOLDOWN_MS;
}

function AlertIcon({ severity }: { severity: Alert['severity'] }) {
  if (severity === 'critical') return <TrendingDown size={16} className="text-red-500 flex-shrink-0" />;
  if (severity === 'warning') return <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />;
  return <TrendingUp size={16} className="text-green-500 flex-shrink-0" />;
}

function borderColor(severity: Alert['severity']): string {
  if (severity === 'critical') return 'border-l-red-500';
  if (severity === 'warning') return 'border-l-amber-500';
  return 'border-l-green-500';
}

function bgColor(severity: Alert['severity']): string {
  if (severity === 'critical') return 'bg-red-50 dark:bg-red-950/30';
  if (severity === 'warning') return 'bg-amber-50 dark:bg-amber-950/30';
  return 'bg-green-50 dark:bg-green-950/30';
}

export function SmartAlerts() {
  const { holdings } = usePortfolio();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const runCheck = useCallback(() => {
    if (holdings.length === 0) return;

    const previousPrices = getPreviousPrices();
    const newAlerts = checkAlerts(holdings, previousPrices);

    // Filter only alerts that pass cooldown and are new
    const filteredAlerts = newAlerts.filter(a => canAlert(a.symbol, a.type));

    if (filteredAlerts.length > 0) {
      // Mark alert times to prevent spam
      for (const alert of filteredAlerts) {
        setLastAlertTime(alert.symbol, alert.type);
      }

      // Send browser notifications for critical/warning
      for (const alert of filteredAlerts) {
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

      setAlerts(prev => {
        const existingKeys = new Set(prev.map(a => `${a.symbol}_${a.type}`));
        const brandNew = filteredAlerts.filter(a => !existingKeys.has(`${a.symbol}_${a.type}`));
        return [...brandNew, ...prev];
      });

      setDismissed(new Set());
    }

    // Save current prices for next check
    const currentPrices: Record<string, number> = {};
    for (const h of holdings) {
      if (h.current_price > 0 && h.asset_type !== 'cash') {
        currentPrices[h.symbol] = h.current_price;
      }
    }
    savePreviousPrices(currentPrices);
  }, [holdings]);

  // Run check on interval
  useEffect(() => {
    // Initial check after a short delay (let prices load)
    const initialTimeout = setTimeout(runCheck, 3000);
    const interval = setInterval(runCheck, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [runCheck]);

  // Auto-dismiss alerts after 30 seconds
  useEffect(() => {
    for (const alert of alerts) {
      const key = `${alert.symbol}_${alert.type}`;
      if (!timerRefs.current.has(key) && !dismissed.has(key)) {
        const timer = setTimeout(() => {
          setDismissed(prev => new Set(prev).add(key));
          timerRefs.current.delete(key);
        }, AUTO_DISMISS_MS);
        timerRefs.current.set(key, timer);
      }
    }

    return () => {
      timerRefs.current.forEach(timer => clearTimeout(timer));
      timerRefs.current.clear();
    };
  }, [alerts, dismissed]);

  const visibleAlerts = alerts.filter(a => !dismissed.has(`${a.symbol}_${a.type}`));

  if (visibleAlerts.length === 0) return null;

  const displayAlerts = expanded ? visibleAlerts : visibleAlerts.slice(0, MAX_VISIBLE);
  const hiddenCount = visibleAlerts.length - MAX_VISIBLE;

  const dismissAlert = (alert: Alert) => {
    const key = `${alert.symbol}_${alert.type}`;
    setDismissed(prev => new Set(prev).add(key));
    const timer = timerRefs.current.get(key);
    if (timer) {
      clearTimeout(timer);
      timerRefs.current.delete(key);
    }
  };

  const dismissAll = () => {
    const allKeys = new Set(visibleAlerts.map(a => `${a.symbol}_${a.type}`));
    setDismissed(prev => new Set([...prev, ...allKeys]));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-gray-400">
          <Bell size={12} />
          <span>Ak\u0131ll\u0131 Uyar\u0131lar ({visibleAlerts.length})</span>
        </div>
        {visibleAlerts.length > 1 && (
          <button
            onClick={dismissAll}
            className="text-[10px] text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
          >
            T\u00FCm\u00FCn\u00FC kapat
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {displayAlerts.map((alert) => (
          <div
            key={`${alert.symbol}_${alert.type}_${alert.timestamp}`}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border-l-[3px] ${borderColor(alert.severity)} ${bgColor(alert.severity)} transition-all animate-fade-in`}
          >
            <AlertIcon severity={alert.severity} />
            <span className="flex-1 text-xs text-slate-700 dark:text-gray-300 leading-relaxed">
              {alert.message}
            </span>
            <button
              onClick={() => dismissAlert(alert)}
              className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0"
              aria-label="Kapat"
            >
              <X size={14} className="text-slate-400 dark:text-gray-500" />
            </button>
          </div>
        ))}
      </div>

      {!expanded && hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 text-[11px] text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 font-medium transition-colors"
        >
          <ChevronDown size={12} />
          {hiddenCount} daha
        </button>
      )}

      {expanded && visibleAlerts.length > MAX_VISIBLE && (
        <button
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1 text-[11px] text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 font-medium transition-colors"
        >
          <ChevronUp size={12} />
          Daralt
        </button>
      )}
    </div>
  );
}
