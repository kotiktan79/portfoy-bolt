import { useEffect, useState } from 'react';
import { Activity, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { getAllAPIHealth } from '../services/priceMonitor';

interface APIHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  lastCheck: number;
  successRate: number;
  avgResponseTime: number;
  consecutiveFailures: number;
}

export function APIHealthMonitor() {
  const [healthData, setHealthData] = useState<APIHealth[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const updateHealth = () => {
      const health = getAllAPIHealth();
      setHealthData(health);
    };

    updateHealth();
    const interval = setInterval(updateHealth, 5000);

    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="text-green-500" size={16} />;
      case 'degraded':
        return <AlertCircle className="text-yellow-500" size={16} />;
      case 'down':
        return <XCircle className="text-red-500" size={16} />;
      default:
        return <Activity className="text-gray-400" size={16} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400';
      case 'degraded':
        return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400';
      case 'down':
        return 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400';
      default:
        return 'bg-gray-500/10 border-gray-500/30 text-gray-700 dark:text-gray-400';
    }
  };

  const getServiceName = (service: string) => {
    const names: Record<string, string> = {
      'crypto-proxy': 'Kripto Proxy',
      'usd-proxy': 'USD Proxy',
      'binance': 'Binance',
      'exchangerate': 'Döviz Kurları',
      'yahoo': 'Yahoo Finance',
      'gold': 'Altın Fiyatları',
    };
    return names[service] || service;
  };

  if (healthData.length === 0) {
    return null;
  }

  const healthyCount = healthData.filter(h => h.status === 'healthy').length;
  const degradedCount = healthData.filter(h => h.status === 'degraded').length;
  const downCount = healthData.filter(h => h.status === 'down').length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 border border-slate-200 dark:border-gray-700">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <Activity className="text-blue-600 dark:text-blue-400" size={20} />
          <div>
            <h3 className="font-bold text-slate-800 dark:text-white">API Sağlık Durumu</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {healthyCount} sağlıklı, {degradedCount} yavaş, {downCount} çalışmıyor
            </p>
          </div>
        </div>
        <button className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
          {isExpanded ? '▼' : '▶'}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-2">
          {healthData.map((api) => (
            <div
              key={api.service}
              className={`p-3 rounded-lg border ${getStatusColor(api.status)}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getStatusIcon(api.status)}
                  <span className="font-semibold text-sm">{getServiceName(api.service)}</span>
                </div>
                <span className="text-xs font-bold uppercase">{api.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Başarı</p>
                  <p className="font-bold">{(api.successRate * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Yanıt</p>
                  <p className="font-bold">{api.avgResponseTime.toFixed(0)}ms</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Hata</p>
                  <p className="font-bold">{api.consecutiveFailures}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
