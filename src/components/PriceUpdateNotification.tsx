import { useEffect, useState, useRef } from 'react';
import { Activity, WifiOff, Wifi, AlertCircle } from 'lucide-react';
import {
  subscribeToConnectionStatus,
  ConnectionStatus,
  PriceUpdate,
  subscribeToPriceUpdates,
} from '../services/priceService';

export function PriceUpdateNotification() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [updateCount, setUpdateCount] = useState(0);
  const [lastSymbol, setLastSymbol] = useState('');
  const countRef = useRef(0);

  useEffect(() => {
    const unsubscribePrice = subscribeToPriceUpdates((update: PriceUpdate) => {
      countRef.current += 1;
      setUpdateCount(countRef.current);
      setLastSymbol(update.symbol);
    });

    const unsubscribeStatus = subscribeToConnectionStatus((status) => {
      setConnectionStatus(status);
    });

    return () => {
      unsubscribePrice();
      unsubscribeStatus();
    };
  }, []);

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi className="text-green-500" size={14} />;
      case 'connecting':
        return <Activity className="text-yellow-500 animate-pulse" size={14} />;
      case 'error':
        return <AlertCircle className="text-red-500" size={14} />;
      default:
        return <WifiOff className="text-gray-400" size={14} />;
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800/40';
      case 'connecting':
        return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800/40';
      case 'error':
        return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800/40';
      default:
        return 'bg-slate-50 border-slate-200 dark:bg-slate-900/20 dark:border-slate-800/40';
    }
  };

  const getStatusLabel = () => {
    switch (connectionStatus) {
      case 'connected': return 'Canlı';
      case 'connecting': return 'Bağlanıyor';
      case 'error': return 'Hata';
      default: return 'Kapalı';
    }
  };

  return (
    <div className={`fixed bottom-4 right-4 z-40 rounded-lg border backdrop-blur-sm px-3 py-2 shadow-md transition-all ${getStatusColor()}`}>
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {getStatusLabel()}
        </span>
        {updateCount > 0 && (
          <span className="text-[10px] text-slate-500 dark:text-slate-400 border-l border-slate-300 dark:border-slate-600 pl-2">
            {updateCount} güncelleme {lastSymbol && `(${lastSymbol})`}
          </span>
        )}
      </div>
    </div>
  );
}
