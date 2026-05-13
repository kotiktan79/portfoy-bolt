import { useState, useEffect, useRef, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Sun, ChevronDown, ChevronUp,
  Clock, ArrowUpRight, ArrowDownRight, Minus,
  BarChart2, List, RefreshCw, Target
} from 'lucide-react';
import { Holding } from '../lib/supabase';
import { formatCurrency, formatCurrencyUSD, formatPercentage, getCachedUSDRate } from '../services/priceService';
import { loadDailyOpenPrices, saveDailyOpenPrices } from '../services/dailyOpenPriceService';
import { DEFAULT_USD_TRY_RATE } from '../config';

interface AssetDailyGain {
  id: string;
  symbol: string;
  assetType: string;
  quantity: number;
  openPrice: number;
  currentPrice: number;
  priceChangeTRY: number;
  priceChangePct: number;
  totalDayGainTRY: number;
  currentValueTRY: number;
  portfolioWeight: number;
  priceHistory: number[];
}

interface HourlyPoint {
  time: string;
  value: number;
  change: number;
}

interface DailyGainPanelProps {
  holdings: Holding[];
  totalDailyChange: number;
  totalDailyPct: number;
}

const SESSION_KEY_HOURLY = 'portfolio_session_hourly';

const ASSET_LABELS: Record<string, string> = {
  crypto: 'Kripto', stock: 'Hisse', gold: 'Altın', silver: 'Gümüş',
  fund: 'Fon', bond: 'Tahvil', cash: 'Nakit', commodity: 'Emtia', other: 'Diğer',
};

type SortKey = 'gain' | 'pct' | 'value' | 'symbol';
type ViewMode = 'list' | 'bars';

function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) {
    return <div className="w-16 h-6 flex items-center justify-center"><Minus size={10} className="text-slate-300" /></div>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 64;
  const h = 24;
  const pts = points.map((v, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const pathD = `M ${pts.join(' L ')}`;
  const areaD = `M ${pts[0]} L ${pts.join(' L ')} L ${w},${h} L 0,${h} Z`;

  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#sg-${color})`} />
      <path d={pathD} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="2" fill={color} />
    </svg>
  );
}

function HourlyTrendChart({ points }: { points: HourlyPoint[] }) {
  if (points.length < 2) return null;

  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 100;
  const H = 48;
  const pad = 2;

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (W - pad * 2);
    const y = H - pad - ((p.value - min) / range) * (H - pad * 2 - 8);
    return { x, y, ...p };
  });

  const pathD = `M ${coords.map(c => `${c.x},${c.y}`).join(' L ')}`;
  const areaD = `M ${coords[0].x},${H} L ${coords.map(c => `${c.x},${c.y}`).join(' L ')} L ${coords[coords.length - 1].x},${H} Z`;

  const isUp = points[points.length - 1].change >= 0;
  const color = isUp ? '#22c55e' : '#ef4444';

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: '48px' }}>
        <defs>
          <linearGradient id="hourly-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#hourly-grad)" />
        <path d={pathD} stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="1.2" fill={color} opacity={i === coords.length - 1 ? 1 : 0.4} />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {points.filter((_, i) => i === 0 || i === Math.floor(points.length / 2) || i === points.length - 1).map((p, i) => (
          <span key={i} className="text-xs text-slate-400 dark:text-gray-500">{p.time}</span>
        ))}
      </div>
    </div>
  );
}

export function DailyGainPanel({ holdings, totalDailyChange, totalDailyPct }: DailyGainPanelProps) {
  const [usdRate, setUsdRate] = useState(DEFAULT_USD_TRY_RATE);
  const [expanded, setExpanded] = useState(true);
  const [sessionPrices, setSessionPrices] = useState<Record<string, number>>({});
  const [hourlyPoints, setHourlyPoints] = useState<HourlyPoint[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('gain');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterType, setFilterType] = useState<'all' | 'winners' | 'losers'>('all');
  const [currentTime, setCurrentTime] = useState(new Date());
  const initDone = useRef(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    getCachedUSDRate().then(setUsdRate);
    const ticker = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(ticker);
  }, []);

  function getLocalToday(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  const recordHourlyPoint = useCallback((totalValue: number, change: number) => {
    const now = new Date();
    const timeKey = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const today = getLocalToday();

    const raw = sessionStorage.getItem(SESSION_KEY_HOURLY);
    let stored: { date: string; points: HourlyPoint[] } = { date: today, points: [] };

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.date === today) stored = parsed;
      } catch { /* */ }
    }

    const last = stored.points[stored.points.length - 1];
    if (!last || last.time !== timeKey) {
      stored.points.push({ time: timeKey, value: totalValue, change });
      if (stored.points.length > 24) stored.points = stored.points.slice(-24);
      sessionStorage.setItem(SESSION_KEY_HOURLY, JSON.stringify(stored));
    }
    setHourlyPoints(stored.points);
  }, []);

  useEffect(() => {
    if (holdings.length === 0 || loadingRef.current) return;
    loadingRef.current = true;

    const today = getLocalToday();

    const hourlyRaw = sessionStorage.getItem(SESSION_KEY_HOURLY);
    if (hourlyRaw) {
      try {
        const parsed = JSON.parse(hourlyRaw);
        if (parsed.date === today) setHourlyPoints(parsed.points || []);
      } catch { /* */ }
    }

    const holdingIds = holdings.map(h => h.id);
    loadDailyOpenPrices(holdingIds).then(async (loaded) => {
      const merged = await saveDailyOpenPrices(
        holdings.map(h => ({ id: h.id, symbol: h.symbol, current_price: h.current_price })),
        loaded
      );
      setSessionPrices(merged);
      initDone.current = true;
      loadingRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (holdings.length === 0) return;
    const totalVal = holdings.reduce((s, h) => s + h.current_price * h.quantity, 0);
    recordHourlyPoint(totalVal, totalDailyChange);
  }, [totalDailyChange, holdings.length]);

  const totalCurrentValue = holdings.reduce((s, h) => s + h.current_price * h.quantity, 0);

  const rawGains: AssetDailyGain[] = holdings
    .filter(h => h.asset_type !== 'cash')
    .map(h => {
      const rawOpenPrice = sessionPrices[h.id] ?? h.current_price;
      const currentPrice = h.current_price;
      const ratio = currentPrice > 0 ? rawOpenPrice / currentPrice : 1;
      // Single-day move >25% is implausible — treat as stale and use current.
      // (Crypto can move 15-20%, but 25%+ in one day means cache corruption.)
      const openPrice = ratio < 0.75 || ratio > 1.25 ? currentPrice : rawOpenPrice;
      const priceChangeTRY = currentPrice - openPrice;
      const priceChangePct = openPrice > 0 ? (priceChangeTRY / openPrice) * 100 : 0;
      const totalDayGainTRY = priceChangeTRY * h.quantity;
      const currentValueTRY = currentPrice * h.quantity;
      const portfolioWeight = totalCurrentValue > 0 ? (currentValueTRY / totalCurrentValue) * 100 : 0;

      const rawHourly = sessionStorage.getItem(`ph_${h.id}`);
      let priceHistory: number[] = [];
      try {
        if (rawHourly) {
          const parsed = JSON.parse(rawHourly);
          if (parsed.date === getLocalToday()) {
            priceHistory = parsed.prices || [];
          }
        }
      } catch { /* */ }
      if (priceHistory.length === 0) priceHistory = [openPrice, currentPrice];

      return {
        id: h.id, symbol: h.symbol, assetType: h.asset_type, quantity: h.quantity,
        openPrice, currentPrice, priceChangeTRY, priceChangePct,
        totalDayGainTRY, currentValueTRY, portfolioWeight, priceHistory,
      };
    });

  const sortFn = (a: AssetDailyGain, b: AssetDailyGain) => {
    if (sortKey === 'gain') return b.totalDayGainTRY - a.totalDayGainTRY;
    if (sortKey === 'pct') return b.priceChangePct - a.priceChangePct;
    if (sortKey === 'value') return b.currentValueTRY - a.currentValueTRY;
    return a.symbol.localeCompare(b.symbol);
  };

  const assetGains = rawGains
    .filter(a => {
      if (filterType === 'winners') return a.totalDayGainTRY > 0;
      if (filterType === 'losers') return a.totalDayGainTRY < 0;
      return true;
    })
    .sort(sortFn);

  const allGains = [...rawGains].sort(sortFn);
  const positiveCount = rawGains.filter(a => a.totalDayGainTRY > 0).length;
  const negativeCount = rawGains.filter(a => a.totalDayGainTRY < 0).length;
  const neutralCount = rawGains.filter(a => a.totalDayGainTRY === 0).length;

  const topGainers = rawGains.filter(a => a.totalDayGainTRY > 0).sort((a, b) => b.totalDayGainTRY - a.totalDayGainTRY).slice(0, 3);
  const topLosers = rawGains.filter(a => a.totalDayGainTRY < 0).sort((a, b) => a.totalDayGainTRY - b.totalDayGainTRY).slice(0, 3);

  const maxAbsGain = Math.max(...allGains.map(a => Math.abs(a.totalDayGainTRY)), 1);

  const isPositiveTotal = totalDailyChange >= 0;
  const timeStr = currentTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  const bestAsset = rawGains.reduce((best, a) => a.priceChangePct > (best?.priceChangePct ?? -Infinity) ? a : best, rawGains[0]);
  const worstAsset = rawGains.reduce((worst, a) => a.priceChangePct < (worst?.priceChangePct ?? Infinity) ? a : worst, rawGains[0]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-gray-900/20 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl transition-all ${isPositiveTotal ? 'bg-green-50 dark:bg-green-900/30 group-hover:bg-green-100 dark:group-hover:bg-green-900/50' : 'bg-red-50 dark:bg-red-900/30 group-hover:bg-red-100 dark:group-hover:bg-red-900/50'}`}>
            <Sun size={18} className={isPositiveTotal ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'} />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-700 dark:text-gray-200 tracking-tight">Bugünkü Kazanç</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Clock size={11} className="text-slate-400" />
              <span className="text-xs text-slate-400 dark:text-gray-500">{timeStr} itibarıyla</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400 dark:text-gray-500">
            {positiveCount > 0 && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-semibold">
                <ArrowUpRight size={13} />{positiveCount}
              </span>
            )}
            {negativeCount > 0 && (
              <span className="flex items-center gap-1 text-red-500 dark:text-red-400 font-semibold">
                <ArrowDownRight size={13} />{negativeCount}
              </span>
            )}
            {neutralCount > 0 && (
              <span className="flex items-center gap-1 text-slate-400 font-semibold">
                <Minus size={11} />{neutralCount}
              </span>
            )}
          </div>

          <div className="text-right">
            <p className={`text-2xl font-bold tabular-nums leading-none ${isPositiveTotal ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
              {isPositiveTotal ? '+' : ''}{formatCurrency(totalDailyChange)} ₺
            </p>
            <div className="flex items-center justify-end gap-2 mt-0.5">
              <span className={`text-sm font-semibold tabular-nums ${isPositiveTotal ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {isPositiveTotal ? '+' : ''}{totalDailyPct.toFixed(2)}%
              </span>
              <span className="text-xs text-slate-400 dark:text-gray-500">
                ${formatCurrencyUSD(Math.abs(totalDailyChange), usdRate)}
              </span>
            </div>
          </div>

          <div className="text-slate-400 dark:text-gray-500">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 dark:border-gray-700">

          <div className="grid grid-cols-3 border-b border-slate-100 dark:border-gray-700">
            <div className={`px-4 py-3 text-center cursor-pointer transition-colors ${filterType === 'winners' ? 'bg-green-50 dark:bg-green-900/20' : 'hover:bg-slate-50 dark:hover:bg-gray-900/20'}`}
              onClick={() => setFilterType(f => f === 'winners' ? 'all' : 'winners')}>
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <ArrowUpRight size={13} className="text-green-500" />
                <p className="text-xs text-slate-500 dark:text-gray-400">Kazanan</p>
              </div>
              <p className="text-xl font-bold text-green-600 dark:text-green-400">{positiveCount}</p>
            </div>
            <div className={`px-4 py-3 text-center border-x border-slate-100 dark:border-gray-700 cursor-pointer transition-colors ${filterType === 'losers' ? 'bg-red-50 dark:bg-red-900/20' : 'hover:bg-slate-50 dark:hover:bg-gray-900/20'}`}
              onClick={() => setFilterType(f => f === 'losers' ? 'all' : 'losers')}>
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <ArrowDownRight size={13} className="text-red-400" />
                <p className="text-xs text-slate-500 dark:text-gray-400">Kaybeden</p>
              </div>
              <p className="text-xl font-bold text-red-500 dark:text-red-400">{negativeCount}</p>
            </div>
            <div className="px-4 py-3 text-center hover:bg-slate-50 dark:hover:bg-gray-900/20 transition-colors cursor-pointer"
              onClick={() => setFilterType('all')}>
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Minus size={12} className="text-slate-400" />
                <p className="text-xs text-slate-500 dark:text-gray-400">Değişmeyen</p>
              </div>
              <p className="text-xl font-bold text-slate-400 dark:text-gray-500">{neutralCount}</p>
            </div>
          </div>

          {hourlyPoints.length >= 2 && (
            <div className="px-5 pt-4 pb-2 border-b border-slate-100 dark:border-gray-700">
              <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <BarChart2 size={12} />
                Gün İçi Portföy Eğrisi
              </p>
              <HourlyTrendChart points={hourlyPoints} />
            </div>
          )}

          {(topGainers.length > 0 || topLosers.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 border-b border-slate-100 dark:border-gray-700">
              {topGainers.length > 0 && (
                <div className="p-4 md:border-r border-slate-100 dark:border-gray-700">
                  <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <TrendingUp size={12} />
                    En İyi Performans
                  </p>
                  <div className="space-y-2.5">
                    {topGainers.map((a, i) => (
                      <div key={a.id} className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-slate-300 dark:text-gray-600 w-3">{i + 1}</span>
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-black text-white leading-none">
                            {a.symbol.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 dark:text-gray-200 leading-none">{a.symbol}</p>
                          <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">{ASSET_LABELS[a.assetType] || a.assetType}</p>
                        </div>
                        <div className="flex-shrink-0">
                          <MiniSparkline points={a.priceHistory} color="#22c55e" />
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-green-600 dark:text-green-400 tabular-nums">+{formatCurrency(a.totalDayGainTRY)} ₺</p>
                          <p className="text-xs text-green-500 dark:text-green-500 tabular-nums">+{a.priceChangePct.toFixed(2)}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {topLosers.length > 0 && (
                <div className="p-4">
                  <p className="text-xs font-bold text-red-500 dark:text-red-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <TrendingDown size={12} />
                    En Kötü Performans
                  </p>
                  <div className="space-y-2.5">
                    {topLosers.map((a, i) => (
                      <div key={a.id} className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-slate-300 dark:text-gray-600 w-3">{i + 1}</span>
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-black text-white leading-none">
                            {a.symbol.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 dark:text-gray-200 leading-none">{a.symbol}</p>
                          <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">{ASSET_LABELS[a.assetType] || a.assetType}</p>
                        </div>
                        <div className="flex-shrink-0">
                          <MiniSparkline points={a.priceHistory} color="#ef4444" />
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-red-500 dark:text-red-400 tabular-nums">{formatCurrency(a.totalDayGainTRY)} ₺</p>
                          <p className="text-xs text-red-400 dark:text-red-400 tabular-nums">{a.priceChangePct.toFixed(2)}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {rawGains.length >= 2 && bestAsset && worstAsset && (
            <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-gray-700 border-b border-slate-100 dark:border-gray-700 bg-slate-50/50 dark:bg-gray-900/20">
              <div className="px-4 py-3 flex items-center gap-3">
                <Target size={14} className="text-green-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 dark:text-gray-500">Günün Şampiyonu</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-gray-200 truncate">{bestAsset.symbol}</p>
                  <p className="text-xs font-semibold text-green-600 dark:text-green-400">+{formatPercentage(bestAsset.priceChangePct)}</p>
                </div>
              </div>
              <div className="px-4 py-3 flex items-center gap-3">
                <RefreshCw size={14} className="text-red-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 dark:text-gray-500">En Çok Düşen</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-gray-200 truncate">{worstAsset.symbol}</p>
                  <p className="text-xs font-semibold text-red-500 dark:text-red-400">{formatPercentage(worstAsset.priceChangePct)}</p>
                </div>
              </div>
            </div>
          )}

          {assetGains.length > 0 && (
            <div>
              <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-100 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/20">
                <div className="flex items-center gap-1">
                  {(['gain', 'pct', 'value', 'symbol'] as SortKey[]).map(k => (
                    <button
                      key={k}
                      onClick={() => setSortKey(k)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${sortKey === k
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-700'
                        }`}
                    >
                      {k === 'gain' ? 'Kazanç' : k === 'pct' ? '%' : k === 'value' ? 'Değer' : 'A-Z'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-gray-700'}`}
                  >
                    <List size={13} />
                  </button>
                  <button
                    onClick={() => setViewMode('bars')}
                    className={`p-1.5 rounded-lg transition-colors ${viewMode === 'bars' ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-gray-700'}`}
                  >
                    <BarChart2 size={13} />
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-50 dark:divide-gray-700/50">
                {assetGains.map(a => {
                  const isPos = a.totalDayGainTRY > 0;
                  const isNeg = a.totalDayGainTRY < 0;
                  const barWidth = (Math.abs(a.totalDayGainTRY) / maxAbsGain) * 100;

                  if (viewMode === 'bars') {
                    return (
                      <div key={a.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-gray-900/20 transition-colors">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black text-white ${isPos ? 'bg-green-500' : isNeg ? 'bg-red-400' : 'bg-slate-300'}`}>
                              {a.symbol.slice(0, 1)}
                            </div>
                            <span className="text-sm font-semibold text-slate-700 dark:text-gray-300">{a.symbol}</span>
                            <span className="text-xs text-slate-400 dark:text-gray-500">{a.portfolioWeight.toFixed(1)}% portföy</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-bold tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : isNeg ? 'text-red-500 dark:text-red-400' : 'text-slate-400'}`}>
                              {isPos ? '+' : ''}{formatCurrency(a.totalDayGainTRY)} ₺
                            </span>
                            <span className={`text-xs font-semibold tabular-nums w-14 text-right ${isPos ? 'text-green-600 dark:text-green-400' : isNeg ? 'text-red-500 dark:text-red-400' : 'text-slate-400'}`}>
                              {isPos ? '+' : ''}{a.priceChangePct.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${isPos ? 'bg-gradient-to-r from-green-400 to-green-500' : isNeg ? 'bg-gradient-to-r from-red-400 to-red-500' : 'bg-slate-300'}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-slate-400 dark:text-gray-500">Aç: {formatCurrency(a.openPrice, 4)}</span>
                          <span className="text-xs text-slate-400 dark:text-gray-500">Şu: {formatCurrency(a.currentPrice, 4)}</span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-gray-900/20 transition-colors">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isPos ? 'bg-green-100 dark:bg-green-900/40' : isNeg ? 'bg-red-100 dark:bg-red-900/40' : 'bg-slate-100 dark:bg-gray-700'}`}>
                        <span className={`text-xs font-black ${isPos ? 'text-green-700 dark:text-green-300' : isNeg ? 'text-red-700 dark:text-red-300' : 'text-slate-400'}`}>
                          {a.symbol.slice(0, 2).toUpperCase()}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-slate-800 dark:text-gray-200 truncate">{a.symbol}</p>
                          <span className="text-xs text-slate-400 dark:text-gray-500 flex-shrink-0">{ASSET_LABELS[a.assetType] || a.assetType}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="flex-1 h-1 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden max-w-[80px]">
                            <div
                              className={`h-full rounded-full ${isPos ? 'bg-green-500' : isNeg ? 'bg-red-400' : 'bg-slate-300'}`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400 dark:text-gray-500 tabular-nums">{a.portfolioWeight.toFixed(1)}%</span>
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        <MiniSparkline points={a.priceHistory} color={isPos ? '#22c55e' : isNeg ? '#ef4444' : '#94a3b8'} />
                      </div>

                      <div className="text-right flex-shrink-0 min-w-[90px]">
                        <p className={`text-sm font-bold tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : isNeg ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-gray-500'}`}>
                          {isPos ? '+' : ''}{formatCurrency(a.totalDayGainTRY)} ₺
                        </p>
                        <p className={`text-xs font-semibold tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : isNeg ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-gray-500'}`}>
                          {isPos ? '+' : ''}{formatPercentage(a.priceChangePct)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="px-4 py-3 bg-slate-50 dark:bg-gray-900/30 border-t border-slate-100 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-gray-300">Toplam Günlük</span>
                  <span className="text-xs text-slate-400 dark:text-gray-500">${formatCurrencyUSD(Math.abs(totalDailyChange), usdRate)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-base font-black tabular-nums ${isPositiveTotal ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {isPositiveTotal ? '+' : ''}{formatCurrency(totalDailyChange)} ₺
                  </span>
                  <span className={`text-sm font-bold tabular-nums px-2 py-0.5 rounded-lg ${isPositiveTotal ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300'}`}>
                    {isPositiveTotal ? '+' : ''}{totalDailyPct.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
