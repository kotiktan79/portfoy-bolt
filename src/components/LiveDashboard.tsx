import { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Activity, ArrowUp, ArrowDown,
  Maximize2, PieChart, AlertTriangle, Target, Zap, BarChart2, RefreshCw,
  LayoutGrid, List, Trophy, Flame, Shield, ChevronUp, ChevronDown, ChevronsUpDown,
  Eye, Layers
} from 'lucide-react';
import { Holding, supabase } from '../lib/supabase';
import { formatCurrency, formatPercentage } from '../services/priceService';
import { ASSET_TYPE_LABELS } from '../constants/assetTypes';

interface LiveDashboardProps {
  holdings: Holding[];
  totalValue: number;
  totalInvestment: number;
  totalPnL: number;
  totalPnLPercent: number;
  updatingPrices?: boolean;
  lastUpdated?: Date | null;
  countdown?: number;
  onRefresh?: () => void;
}

interface HoldingWithPnL extends Holding {
  pnl: number;
  pnlPercent: number;
  value: number;
  weight: number;
}

interface PerformanceData {
  daily: number;
  weekly: number;
  monthly: number;
}

type SortKey = 'symbol' | 'value' | 'pnl' | 'pnlPercent' | 'weight' | 'current_price';
type SortDir = 'asc' | 'desc';
type ViewMode = 'heatmap' | 'table';

export function LiveDashboard({
  holdings,
  totalValue,
  totalInvestment,
  totalPnL,
  totalPnLPercent,
  updatingPrices = false,
  lastUpdated = null,
  countdown = 30,
  onRefresh,
}: LiveDashboardProps) {
  const [timeString, setTimeString] = useState('');
  const [dateString, setDateString] = useState('');
  const [performance, setPerformance] = useState<PerformanceData>({ daily: 0, weekly: 0, monthly: 0 });
  const [viewMode, setViewMode] = useState<ViewMode>('heatmap');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(now.toLocaleTimeString('tr-TR'));
      setDateString(now.toLocaleDateString('tr-TR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchPerformanceData();
  }, [holdings]);

  async function fetchPerformanceData() {
    try {
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [{ data: dailySnapshot }, { data: weeklySnapshot }, { data: monthlySnapshot }] = await Promise.all([
        supabase.from('portfolio_snapshots').select('total_value').gte('snapshot_date', dayAgo.toISOString()).order('snapshot_date', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('portfolio_snapshots').select('total_value').gte('snapshot_date', weekAgo.toISOString()).order('snapshot_date', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('portfolio_snapshots').select('total_value').gte('snapshot_date', monthAgo.toISOString()).order('snapshot_date', { ascending: true }).limit(1).maybeSingle(),
      ]);

      const daily = (dailySnapshot && dailySnapshot.total_value > 0) ? ((totalValue - dailySnapshot.total_value) / dailySnapshot.total_value) * 100 : 0;
      const weekly = (weeklySnapshot && weeklySnapshot.total_value > 0) ? ((totalValue - weeklySnapshot.total_value) / weeklySnapshot.total_value) * 100 : 0;
      const monthly = (monthlySnapshot && monthlySnapshot.total_value > 0) ? ((totalValue - monthlySnapshot.total_value) / monthlySnapshot.total_value) * 100 : 0;

      setPerformance({ daily, weekly, monthly });
    } catch {
      setPerformance({ daily: 0, weekly: 0, monthly: 0 });
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const holdingsWithPnL: HoldingWithPnL[] = useMemo(() => holdings.map((h) => {
    const value = h.current_price * h.quantity;
    const invested = h.purchase_price * h.quantity;
    const pnl = value - invested;
    const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
    const weight = totalValue > 0 ? (value / totalValue) * 100 : 0;
    return { ...h, pnl, pnlPercent, value, weight };
  }), [holdings, totalValue]);

  const sortedHoldings = useMemo(() => {
    return [...holdingsWithPnL].sort((a, b) => {
      const aVal = a[sortKey] as number | string;
      const bVal = b[sortKey] as number | string;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [holdingsWithPnL, sortKey, sortDir]);

  const topGainers = useMemo(() => [...holdingsWithPnL].sort((a, b) => b.pnl - a.pnl).slice(0, 3), [holdingsWithPnL]);
  const topLosers = useMemo(() => [...holdingsWithPnL].sort((a, b) => a.pnl - b.pnl).slice(0, 3), [holdingsWithPnL]);

  const assetTypeBreakdown = useMemo(() => holdingsWithPnL.reduce((acc, h) => {
    const type = h.asset_type || 'other';
    if (!acc[type]) acc[type] = { value: 0, count: 0, pnl: 0 };
    acc[type].value += h.value;
    acc[type].count += 1;
    acc[type].pnl += h.pnl;
    return acc;
  }, {} as Record<string, { value: number; count: number; pnl: number }>), [holdingsWithPnL]);

  const assetTypes = useMemo(() => Object.entries(assetTypeBreakdown).map(([type, data]) => ({
    type, ...data,
    percentage: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
  })).sort((a, b) => b.value - a.value), [assetTypeBreakdown, totalValue]);

  const volatileAssets = holdingsWithPnL.filter(h => Math.abs(h.pnlPercent) > 10);
  const stableAssets = holdingsWithPnL.filter(h => Math.abs(h.pnlPercent) <= 5);
  const winnersCount = holdingsWithPnL.filter(h => h.pnl > 0).length;
  const losersCount = holdingsWithPnL.filter(h => h.pnl < 0).length;

  const avgReturn = holdingsWithPnL.length > 0
    ? holdingsWithPnL.reduce((sum, h) => sum + h.pnlPercent, 0) / holdingsWithPnL.length
    : 0;

  const bestAsset = holdingsWithPnL.length > 0
    ? holdingsWithPnL.reduce((best, h) => h.pnlPercent > best.pnlPercent ? h : best)
    : null;
const biggestPosition = holdingsWithPnL.length > 0
    ? holdingsWithPnL.reduce((big, h) => h.value > big.value ? h : big)
    : null;

  const getColorClass = (value: number) => {
    if (value > 0) return 'text-green-400';
    if (value < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const getBgColorClass = (value: number) => {
    if (value > 5) return 'bg-green-500/20 border-green-500/50';
    if (value > 0) return 'bg-green-500/10 border-green-500/30';
    if (value < -5) return 'bg-red-500/20 border-red-500/50';
    if (value < 0) return 'bg-red-500/10 border-red-500/30';
    return 'bg-gray-500/10 border-gray-500/30';
  };

  const getHeatColor = (pnlPercent: number) => {
    if (pnlPercent > 15) return 'from-green-600/60 to-green-800/60 border-green-500/60';
    if (pnlPercent > 5) return 'from-green-600/30 to-green-800/30 border-green-500/40';
    if (pnlPercent > 0) return 'from-green-600/15 to-green-800/15 border-green-500/25';
    if (pnlPercent > -5) return 'from-red-600/15 to-red-800/15 border-red-500/25';
    if (pnlPercent > -15) return 'from-red-600/30 to-red-800/30 border-red-500/40';
    return 'from-red-600/60 to-red-800/60 border-red-500/60';
  };

  const getTypeName = (type: string) => ASSET_TYPE_LABELS[type] || 'Diger';

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'stock': return 'bg-blue-500';
      case 'crypto': return 'bg-yellow-500';
      case 'commodity': return 'bg-orange-500';
      case 'forex': return 'bg-green-500';
      case 'fund': return 'bg-teal-500';
      case 'eurobond': return 'bg-cyan-500';
      default: return 'bg-gray-500';
    }
  };

  const getTypeColorHex = (type: string) => {
    switch (type) {
      case 'stock': return '#3b82f6';
      case 'crypto': return '#eab308';
      case 'commodity': return '#f97316';
      case 'forex': return '#22c55e';
      case 'fund': return '#14b8a6';
      case 'eurobond': return '#06b6d4';
      default: return '#6b7280';
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown size={12} className="text-gray-600" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-blue-400" />
      : <ChevronDown size={12} className="text-blue-400" />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 text-white">
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:50px_50px] pointer-events-none"></div>

      <div className="relative z-10 p-3 sm:p-4 md:p-6 space-y-4 md:space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="p-2 sm:p-3 bg-blue-500/20 rounded-xl sm:rounded-2xl backdrop-blur-xl border border-blue-500/30 flex-shrink-0">
              <Activity className="text-blue-400 animate-pulse" size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl md:text-3xl font-bold tracking-tight truncate">Canli Portfoy Izleme</h1>
              <p className="text-gray-400 text-xs sm:text-sm mt-0.5 truncate">
                {timeString} &bull; {dateString}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {lastUpdated && (
              <div className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-gray-800/60 rounded-xl text-xs text-gray-400 border border-gray-700/50">
                <div className={`w-1.5 h-1.5 rounded-full ${updatingPrices ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`}></div>
                <span>
                  {updatingPrices
                    ? 'Guncelleniyor...'
                    : lastUpdated.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  }
                </span>
                {!updatingPrices && <span className="text-gray-500">&bull; {countdown}s</span>}
              </div>
            )}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={updatingPrices}
                className="p-2 sm:p-2.5 bg-gray-800/50 hover:bg-gray-700/50 disabled:opacity-50 rounded-lg sm:rounded-xl transition-all border border-gray-700"
                title="Fiyatlari Guncelle"
              >
                <RefreshCw size={16} className={updatingPrices ? 'animate-spin text-blue-400' : 'text-gray-300'} />
              </button>
            )}
            <a
              href="/"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-gray-800/60 hover:bg-gray-700/60 rounded-xl text-sm text-gray-300 hover:text-white transition-all border border-gray-700/50"
            >
              <BarChart2 size={15} />
              <span>Ana Sayfa</span>
            </a>
            <button
              onClick={toggleFullscreen}
              className="p-2 sm:p-3 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg sm:rounded-xl transition-all border border-gray-700"
            >
              <Maximize2 size={18} />
            </button>
          </div>
        </div>

        {/* ── Top metric cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="group sm:col-span-2 relative bg-gradient-to-br from-blue-600/30 to-blue-900/30 backdrop-blur-2xl rounded-2xl md:rounded-3xl p-5 md:p-8 border-2 border-blue-500/40 shadow-2xl overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 md:w-40 md:h-40 bg-blue-400/20 rounded-full blur-3xl group-hover:bg-blue-400/30 transition-all pointer-events-none"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 md:gap-3 mb-3">
                <DollarSign className="text-blue-400 animate-pulse flex-shrink-0" size={20} />
                <p className="text-blue-100 text-sm md:text-base font-bold uppercase tracking-wider">Toplam Deger</p>
              </div>
              <p className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black mb-3 bg-gradient-to-r from-white to-blue-100 bg-clip-text text-transparent leading-none">
                {formatCurrency(totalValue, 0)} ₺
              </p>
              <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-3">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-xl backdrop-blur-sm">
                  {totalPnL >= 0 ? <ArrowUp className="text-green-400 flex-shrink-0" size={16} /> : <ArrowDown className="text-red-400 flex-shrink-0" size={16} />}
                  <span className={`text-base md:text-xl font-black ${getColorClass(totalPnL)}`}>
                    {formatCurrency(Math.abs(totalPnL), 0)} ₺
                  </span>
                </div>
                <span className={`text-lg md:text-2xl font-black ${getColorClass(totalPnL)}`}>
                  {formatPercentage(totalPnLPercent)}
                </span>
              </div>
            </div>
          </div>

          <div className="group relative bg-gradient-to-br from-orange-600/30 to-orange-800/30 backdrop-blur-2xl rounded-2xl md:rounded-3xl p-5 md:p-8 border-2 border-orange-500/40 shadow-2xl overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 md:w-24 md:h-24 bg-orange-400/20 rounded-full blur-2xl pointer-events-none"></div>
            <div className="relative z-10">
              <p className="text-orange-100 text-xs md:text-sm font-bold uppercase tracking-wider mb-2 md:mb-3">Yatirim</p>
              <p className="text-2xl md:text-3xl lg:text-4xl font-black leading-none">{formatCurrency(totalInvestment, 0)} ₺</p>
              <p className="text-xs text-orange-200/60 mt-2">Toplam maliyet</p>
            </div>
          </div>

          <div className="group relative bg-gradient-to-br from-teal-600/30 to-teal-800/30 backdrop-blur-2xl rounded-2xl md:rounded-3xl p-5 md:p-8 border-2 border-teal-500/40 shadow-2xl overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 md:w-24 md:h-24 bg-teal-400/20 rounded-full blur-2xl pointer-events-none"></div>
            <div className="relative z-10">
              <p className="text-teal-100 text-xs md:text-sm font-bold uppercase tracking-wider mb-2 md:mb-3">Toplam Varlik</p>
              <p className="text-2xl md:text-3xl lg:text-4xl font-black leading-none">{holdings.length}</p>
              <p className="text-xs text-teal-200/60 mt-2">Aktif pozisyon</p>
            </div>
          </div>
        </div>

        {/* ── Portfolio summary strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/25 rounded-2xl px-4 py-3">
            <Trophy className="text-green-400 flex-shrink-0" size={18} />
            <div>
              <p className="text-xs text-green-300/70 font-semibold uppercase tracking-wide">Kazanan</p>
              <p className="text-2xl font-black text-green-400">{winnersCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/25 rounded-2xl px-4 py-3">
            <Flame className="text-red-400 flex-shrink-0" size={18} />
            <div>
              <p className="text-xs text-red-300/70 font-semibold uppercase tracking-wide">Kaybeden</p>
              <p className="text-2xl font-black text-red-400">{losersCount}</p>
            </div>
          </div>
          {bestAsset && (
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl px-4 py-3">
              <ArrowUp className="text-emerald-400 flex-shrink-0" size={18} />
              <div className="min-w-0">
                <p className="text-xs text-emerald-300/70 font-semibold uppercase tracking-wide">En Iyi</p>
                <p className="text-base font-black text-emerald-400 truncate">{bestAsset.symbol}</p>
                <p className="text-xs text-emerald-300/60">{formatPercentage(bestAsset.pnlPercent)}</p>
              </div>
            </div>
          )}
          {biggestPosition && (
            <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/25 rounded-2xl px-4 py-3">
              <Layers className="text-blue-400 flex-shrink-0" size={18} />
              <div className="min-w-0">
                <p className="text-xs text-blue-300/70 font-semibold uppercase tracking-wide">En Buyuk</p>
                <p className="text-base font-black text-blue-400 truncate">{biggestPosition.symbol}</p>
                <p className="text-xs text-blue-300/60">{biggestPosition.weight.toFixed(1)}%</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Performance row ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <PerformanceCard label="Gunluk" sublabel="Son 24 saat" value={performance.daily}
            icon={<Zap className="text-emerald-400 animate-pulse" size={18} />}
            colorClass="from-emerald-600/30 to-emerald-800/30 border-emerald-500/40"
            textClass="text-emerald-100" getColorClass={getColorClass} />
          <PerformanceCard label="Haftalik" sublabel="Son 7 gun" value={performance.weekly}
            icon={<TrendingUp className="text-cyan-400" size={18} />}
            colorClass="from-cyan-600/30 to-cyan-800/30 border-cyan-500/40"
            textClass="text-cyan-100" getColorClass={getColorClass} />
          <PerformanceCard label="Aylik" sublabel="Son 30 gun" value={performance.monthly}
            icon={<Target className="text-blue-400" size={18} />}
            colorClass="from-blue-600/30 to-blue-800/30 border-blue-500/40"
            textClass="text-blue-100" getColorClass={getColorClass} />
        </div>

        {/* ── Middle: Asset distribution + Stats + Risk ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {/* Asset distribution with mini donut */}
          <div className="bg-gray-800/40 backdrop-blur-xl rounded-2xl p-4 md:p-6 border border-gray-700/50 shadow-xl">
            <div className="flex items-center gap-2 md:gap-3 mb-4">
              <PieChart className="text-orange-400 flex-shrink-0" size={18} />
              <h3 className="text-base md:text-lg font-bold">Varlik Dagilimi</h3>
            </div>
            {/* Mini donut via conic-gradient */}
            {assetTypes.length > 0 && (
              <div className="flex justify-center mb-5">
                <div className="relative w-28 h-28">
                  <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
                    {(() => {
                      let offset = 0;
                      return assetTypes.map((asset) => {
                        const pct = asset.percentage;
                        const dash = `${pct} ${100 - pct}`;
                        const el = (
                          <circle
                            key={asset.type}
                            cx="18" cy="18" r="15.915"
                            fill="transparent"
                            stroke={getTypeColorHex(asset.type)}
                            strokeWidth="3.5"
                            strokeDasharray={dash}
                            strokeDashoffset={-offset}
                          />
                        );
                        offset += pct;
                        return el;
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xs text-gray-400">Toplam</span>
                    <span className="text-sm font-black">{assetTypes.length} tip</span>
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-3">
              {assetTypes.map((asset) => (
                <div key={asset.type}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getTypeColor(asset.type)}`}></div>
                      <span className="text-gray-300 text-xs sm:text-sm font-semibold">{getTypeName(asset.type)}</span>
                      <span className="text-gray-500 text-xs">({asset.count})</span>
                    </div>
                    <span className="text-white text-xs sm:text-sm font-bold">{asset.percentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-700/30 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-700 ${getTypeColor(asset.type)}`}
                      style={{ width: `${Math.min(asset.percentage, 100)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>{formatCurrency(asset.value, 0)} ₺</span>
                    <span className={getColorClass(asset.pnl)}>{asset.pnl >= 0 ? '+' : ''}{formatCurrency(asset.pnl, 0)} ₺</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Market stats */}
          <div className="bg-gray-800/40 backdrop-blur-xl rounded-2xl p-4 md:p-6 border border-gray-700/50 shadow-xl">
            <div className="flex items-center gap-2 md:gap-3 mb-4">
              <Activity className="text-blue-400 flex-shrink-0" size={18} />
              <h3 className="text-base md:text-lg font-bold">Piyasa Istatistikleri</h3>
            </div>
            <div className="space-y-3">
              <div className="bg-gray-700/30 rounded-xl p-3 md:p-4">
                <p className="text-gray-400 text-xs mb-1">Ortalama Getiri</p>
                <p className={`text-2xl md:text-3xl font-bold ${getColorClass(avgReturn)}`}>{formatPercentage(avgReturn)}</p>
              </div>
              <div className="bg-gray-700/30 rounded-xl p-3 md:p-4">
                <p className="text-gray-400 text-xs mb-1">Volatil Varliklar</p>
                <p className="text-2xl md:text-3xl font-bold text-yellow-400">{volatileAssets.length}</p>
                <p className="text-xs text-gray-400 mt-0.5">%10+ degisim</p>
              </div>
              <div className="bg-gray-700/30 rounded-xl p-3 md:p-4">
                <p className="text-gray-400 text-xs mb-1">Stabil Varliklar</p>
                <p className="text-2xl md:text-3xl font-bold text-green-400">{stableAssets.length}</p>
                <p className="text-xs text-gray-400 mt-0.5">+-5% araliginda</p>
              </div>
            </div>
          </div>

          {/* Risk indicators */}
          <div className="bg-gray-800/40 backdrop-blur-xl rounded-2xl p-4 md:p-6 border border-gray-700/50 shadow-xl">
            <div className="flex items-center gap-2 md:gap-3 mb-4">
              <Shield className="text-red-400 flex-shrink-0" size={18} />
              <h3 className="text-base md:text-lg font-bold">Risk Gostergeleri</h3>
            </div>
            <div className="space-y-3">
              {volatileAssets.length > 5 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 md:p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} className="text-red-400" />
                    <p className="text-red-400 text-sm font-semibold">Yuksek Volatilite</p>
                  </div>
                  <p className="text-xs text-gray-300">{volatileAssets.length} varlik %10+ degisim gosteriyor</p>
                </div>
              )}
              {totalPnLPercent < -10 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 md:p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} className="text-red-400" />
                    <p className="text-red-400 text-sm font-semibold">Portfoy Kayip</p>
                  </div>
                  <p className="text-xs text-gray-300">Toplam kayip %10'un uzerinde</p>
                </div>
              )}
              {assetTypes.some(a => a.percentage > 60) && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 md:p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} className="text-yellow-400" />
                    <p className="text-yellow-400 text-sm font-semibold">Konsantrasyon Riski</p>
                  </div>
                  <p className="text-xs text-gray-300">Portfoyun %60+ tek varlik tipinde</p>
                </div>
              )}
              {volatileAssets.length <= 2 && totalPnLPercent >= 0 && !assetTypes.some(a => a.percentage > 60) && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 md:p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield size={14} className="text-green-400" />
                    <p className="text-green-400 text-sm font-semibold">Dusuk Risk</p>
                  </div>
                  <p className="text-xs text-gray-300">Portfoy dengeli ve stabil gorunuyor</p>
                </div>
              )}
              {volatileAssets.length > 2 && volatileAssets.length <= 5 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 md:p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} className="text-yellow-400" />
                    <p className="text-yellow-400 text-sm font-semibold">Orta Risk</p>
                  </div>
                  <p className="text-xs text-gray-300">{volatileAssets.length} varlik yuksek degisim gosteriyor</p>
                </div>
              )}
              {/* Risk meter */}
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-2">Risk Skoru</p>
                <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      volatileAssets.length > 5 || totalPnLPercent < -10
                        ? 'bg-gradient-to-r from-orange-500 to-red-500'
                        : volatileAssets.length > 2
                        ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                        : 'bg-gradient-to-r from-green-500 to-emerald-500'
                    }`}
                    style={{
                      width: `${Math.min(
                        ((volatileAssets.length / Math.max(holdings.length, 1)) * 100) +
                        (totalPnLPercent < -10 ? 30 : 0) +
                        (assetTypes.some(a => a.percentage > 60) ? 20 : 0),
                        100
                      )}%`
                    }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                  <span>Dusuk</span>
                  <span>Orta</span>
                  <span>Yuksek</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Gainers & Losers ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
          <div className="bg-gray-800/40 backdrop-blur-xl rounded-2xl md:rounded-3xl p-4 md:p-6 border border-gray-700/50 shadow-2xl">
            <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-5">
              <TrendingUp className="text-green-400 flex-shrink-0" size={18} />
              <h2 className="text-base md:text-xl font-bold">En Cok Kazandıranlar</h2>
            </div>
            <div className="space-y-2 md:space-y-3">
              {topGainers.map((holding, index) => (
                <div key={holding.id} className={`p-3 md:p-4 rounded-xl border-2 ${getBgColorClass(holding.pnlPercent)}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg md:text-xl font-bold text-gray-500 flex-shrink-0 w-6">#{index + 1}</span>
                      <div className="min-w-0">
                        <span className="text-base md:text-xl font-bold truncate block">{holding.symbol}</span>
                        <span className="text-xs text-gray-400">{getTypeName(holding.asset_type)}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <span className="text-sm md:text-base font-bold text-green-400 block">{formatPercentage(holding.pnlPercent)}</span>
                      <span className="text-xs text-green-300/70">+{formatCurrency(holding.pnl, 0)} ₺</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>Fiyat: {formatCurrency(holding.current_price)} ₺</span>
                    <span>Agirlik: {holding.weight.toFixed(1)}%</span>
                  </div>
                  <div className="mt-2 w-full bg-gray-700/40 rounded-full h-1">
                    <div
                      className="h-1 rounded-full bg-green-500 transition-all duration-700"
                      style={{ width: `${Math.min(holding.pnlPercent, 100)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-800/40 backdrop-blur-xl rounded-2xl md:rounded-3xl p-4 md:p-6 border border-gray-700/50 shadow-2xl">
            <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-5">
              <TrendingDown className="text-red-400 flex-shrink-0" size={18} />
              <h2 className="text-base md:text-xl font-bold">En Cok Kaybedenler</h2>
            </div>
            <div className="space-y-2 md:space-y-3">
              {topLosers.map((holding, index) => (
                <div key={holding.id} className={`p-3 md:p-4 rounded-xl border-2 ${getBgColorClass(holding.pnlPercent)}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg md:text-xl font-bold text-gray-500 flex-shrink-0 w-6">#{index + 1}</span>
                      <div className="min-w-0">
                        <span className="text-base md:text-xl font-bold truncate block">{holding.symbol}</span>
                        <span className="text-xs text-gray-400">{getTypeName(holding.asset_type)}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <span className="text-sm md:text-base font-bold text-red-400 block">{formatPercentage(holding.pnlPercent)}</span>
                      <span className="text-xs text-red-300/70">{formatCurrency(holding.pnl, 0)} ₺</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>Fiyat: {formatCurrency(holding.current_price)} ₺</span>
                    <span>Agirlik: {holding.weight.toFixed(1)}%</span>
                  </div>
                  <div className="mt-2 w-full bg-gray-700/40 rounded-full h-1">
                    <div
                      className="h-1 rounded-full bg-red-500 transition-all duration-700"
                      style={{ width: `${Math.min(Math.abs(holding.pnlPercent), 100)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Live ticker ── */}
        <div className="bg-gray-800/40 backdrop-blur-xl rounded-2xl md:rounded-3xl p-4 md:p-5 border border-gray-700/50 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base md:text-lg font-bold">Canli Fiyat Hareketleri</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-gray-400">Gercek Zamanli</span>
            </div>
          </div>
          <div className="overflow-hidden">
            <div className="flex gap-3 animate-scroll">
              {[...holdingsWithPnL, ...holdingsWithPnL].map((holding, index) => (
                <div
                  key={`${holding.id}-${index}`}
                  className={`flex-shrink-0 w-44 sm:w-52 rounded-xl border-2 p-3 ${getBgColorClass(holding.pnlPercent)}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold truncate">{holding.symbol}</span>
                    {holding.pnlPercent >= 0
                      ? <ArrowUp className="text-green-400 flex-shrink-0" size={14} />
                      : <ArrowDown className="text-red-400 flex-shrink-0" size={14} />
                    }
                  </div>
                  <p className="text-lg font-bold leading-none mb-1">{formatCurrency(holding.current_price)} ₺</p>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${getColorClass(holding.pnlPercent)}`}>
                      {formatPercentage(holding.pnlPercent)}
                    </span>
                    <p className="text-[10px] text-gray-400 uppercase">{getTypeName(holding.asset_type)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Heat map / Table toggle ── */}
        <div className="bg-gray-800/40 backdrop-blur-xl rounded-2xl md:rounded-3xl p-4 md:p-6 border border-gray-700/50 shadow-2xl">
          <div className="flex items-center justify-between mb-4 md:mb-5">
            <div className="flex items-center gap-2">
              <Eye className="text-gray-400 flex-shrink-0" size={18} />
              <h2 className="text-base md:text-xl font-bold">Tum Varliklar</h2>
              <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-0.5 rounded-full">{holdings.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('heatmap')}
                className={`p-2 rounded-lg transition-all border ${viewMode === 'heatmap' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-gray-700/30 border-gray-600/30 text-gray-400 hover:text-white'}`}
                title="Isi Haritasi"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-lg transition-all border ${viewMode === 'table' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-gray-700/30 border-gray-600/30 text-gray-400 hover:text-white'}`}
                title="Tablo Gorunumu"
              >
                <List size={16} />
              </button>
            </div>
          </div>

          {viewMode === 'heatmap' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-3">
              {holdingsWithPnL.map((holding) => {
                const minH = 90;
                const maxH = 150;
                const heightPx = minH + (holding.weight / 100) * (maxH - minH) * holdings.length;
                return (
                  <div
                    key={holding.id}
                    className={`relative rounded-xl border-2 bg-gradient-to-br ${getHeatColor(holding.pnlPercent)} transition-all duration-200 hover:scale-[1.03] hover:shadow-lg cursor-pointer overflow-hidden`}
                    style={{ height: `${Math.min(Math.max(heightPx, minH), maxH)}px` }}
                    onMouseEnter={() => setHoveredId(holding.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <div className="absolute inset-0 p-2.5 flex flex-col justify-between">
                      <div>
                        <p className="text-sm font-bold leading-tight truncate">{holding.symbol}</p>
                        <p className="text-[10px] text-gray-400 uppercase mt-0.5">{getTypeName(holding.asset_type)}</p>
                      </div>
                      <div>
                        <p className={`text-base font-black ${getColorClass(holding.pnlPercent)}`}>
                          {formatPercentage(holding.pnlPercent)}
                        </p>
                        {hoveredId === holding.id ? (
                          <p className="text-[10px] text-gray-300 mt-0.5">{formatCurrency(holding.value, 0)} ₺</p>
                        ) : (
                          <p className="text-[10px] text-gray-500 mt-0.5">{holding.weight.toFixed(1)}%</p>
                        )}
                      </div>
                    </div>
                    {/* weight bar at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-700/50">
                      <div
                        className={`h-full ${holding.pnl >= 0 ? 'bg-green-500' : 'bg-red-500'} transition-all duration-700`}
                        style={{ width: `${Math.min(holding.weight * 4, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/50">
                    {([
                      { key: 'symbol', label: 'Sembol' },
                      { key: 'current_price', label: 'Fiyat' },
                      { key: 'value', label: 'Deger' },
                      { key: 'pnl', label: 'K/Z (₺)' },
                      { key: 'pnlPercent', label: 'K/Z (%)' },
                      { key: 'weight', label: 'Agirlik' },
                    ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className="text-left pb-3 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-white transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          {label}
                          <SortIcon col={key} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {sortedHoldings.map((holding) => (
                    <tr
                      key={holding.id}
                      className="hover:bg-gray-700/20 transition-colors group"
                    >
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getTypeColor(holding.asset_type)}`}></div>
                          <div>
                            <p className="font-bold">{holding.symbol}</p>
                            <p className="text-[10px] text-gray-400">{getTypeName(holding.asset_type)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2 font-mono text-gray-200">{formatCurrency(holding.current_price)} ₺</td>
                      <td className="py-3 px-2 font-mono font-semibold">{formatCurrency(holding.value, 0)} ₺</td>
                      <td className={`py-3 px-2 font-mono font-bold ${getColorClass(holding.pnl)}`}>
                        {holding.pnl >= 0 ? '+' : ''}{formatCurrency(holding.pnl, 0)} ₺
                      </td>
                      <td className={`py-3 px-2 font-bold ${getColorClass(holding.pnlPercent)}`}>
                        <div className="flex items-center gap-1.5">
                          {holding.pnlPercent >= 0
                            ? <ArrowUp size={12} className="text-green-400" />
                            : <ArrowDown size={12} className="text-red-400" />
                          }
                          {formatPercentage(holding.pnlPercent)}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-700/50 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-blue-500 transition-all"
                              style={{ width: `${Math.min(holding.weight, 100)}%` }}
                            ></div>
                          </div>
                          <span className="text-gray-300 text-xs font-semibold">{holding.weight.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="bg-gray-800/20 backdrop-blur-xl rounded-xl md:rounded-2xl p-3 border border-gray-700/30">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-8 text-xs text-gray-400">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${updatingPrices ? 'bg-yellow-400 animate-pulse' : 'bg-green-500 animate-pulse'}`}></div>
              <span>{updatingPrices ? 'Fiyatlar guncelleniyor...' : 'Canli Veri Akisi Aktif'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="animate-pulse flex-shrink-0" size={13} />
              <span>{updatingPrices ? 'Guncelleniyor...' : `Sonraki guncelleme: ${countdown} saniye`}</span>
            </div>
            {lastUpdated && (
              <div className="flex items-center gap-1.5">
                <RefreshCw size={12} />
                <span>Son guncelleme: {lastUpdated.toLocaleTimeString('tr-TR')}</span>
              </div>
            )}
            <a href="/" className="flex sm:hidden items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors">
              <BarChart2 size={13} />
              <span>Ana Sayfaya Git</span>
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}

interface PerformanceCardProps {
  label: string;
  sublabel: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
  textClass: string;
  getColorClass: (v: number) => string;
}

function PerformanceCard({ label, sublabel, value, icon, colorClass, textClass, getColorClass }: PerformanceCardProps) {
  const isPos = value >= 0;
  return (
    <div className={`group relative bg-gradient-to-br ${colorClass} backdrop-blur-2xl rounded-2xl p-5 md:p-6 border-2 shadow-2xl overflow-hidden`}>
      <div className="absolute top-0 right-0 w-20 h-20 md:w-24 md:h-24 rounded-full blur-2xl opacity-20 bg-white pointer-events-none"></div>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {icon}
            <p className={`${textClass} text-xs md:text-sm font-bold uppercase tracking-wider`}>{label}</p>
          </div>
          {isPos
            ? <ArrowUp className="text-green-400 flex-shrink-0" size={18} />
            : <ArrowDown className="text-red-400 flex-shrink-0" size={18} />
          }
        </div>
        <p className={`text-3xl md:text-4xl font-black ${getColorClass(value)} mb-1 leading-none`}>
          {formatPercentage(value)}
        </p>
        <p className={`${textClass} text-xs font-semibold opacity-70`}>{sublabel}</p>
      </div>
    </div>
  );
}
