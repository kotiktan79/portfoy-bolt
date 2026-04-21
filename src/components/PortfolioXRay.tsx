import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, ChevronDown, ChevronUp, Layers, Sparkles } from 'lucide-react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { analyzeXRay, XRayFinding } from '../services/xrayService';
import { formatCurrency } from '../services/priceService';
import { Card } from './ui/Card';

const SEVERITY_STYLES: Record<XRayFinding['severity'], { ring: string; pillBg: string; pillText: string; iconBg: string; iconColor: string; label: string }> = {
  high: {
    ring: 'border-l-red-500',
    pillBg: 'bg-red-100 dark:bg-red-950/40',
    pillText: 'text-red-700 dark:text-red-300',
    iconBg: 'bg-red-100 dark:bg-red-950/40',
    iconColor: 'text-red-600 dark:text-red-400',
    label: 'YÜKSEK',
  },
  medium: {
    ring: 'border-l-amber-500',
    pillBg: 'bg-amber-100 dark:bg-amber-950/40',
    pillText: 'text-amber-700 dark:text-amber-300',
    iconBg: 'bg-amber-100 dark:bg-amber-950/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
    label: 'ORTA',
  },
  low: {
    ring: 'border-l-brand-500',
    pillBg: 'bg-brand-100 dark:bg-brand-950/40',
    pillText: 'text-brand-700 dark:text-brand-300',
    iconBg: 'bg-brand-100 dark:bg-brand-950/40',
    iconColor: 'text-brand-600 dark:text-brand-400',
    label: 'DÜŞÜK',
  },
  info: {
    ring: 'border-l-slate-400',
    pillBg: 'bg-slate-100 dark:bg-gray-800',
    pillText: 'text-slate-700 dark:text-gray-300',
    iconBg: 'bg-slate-100 dark:bg-gray-800',
    iconColor: 'text-slate-600 dark:text-gray-400',
    label: 'BİLGİ',
  },
};

function HealthRing({ score, size = 64, strokeWidth = 6 }: { score: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 75 ? '#10b981' :
    score >= 55 ? '#f59e0b' :
    '#ef4444';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-slate-200 dark:stroke-gray-800"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
      />
    </svg>
  );
}

export default function PortfolioXRay() {
  const { holdings } = usePortfolio();
  const [expanded, setExpanded] = useState(false);
  const [showSectors, setShowSectors] = useState(false);

  const xray = useMemo(() => analyzeXRay(holdings), [holdings]);

  if (xray.totalValue === 0) return null;

  const grade =
    xray.healthScore >= 85 ? 'A+' :
    xray.healthScore >= 75 ? 'A' :
    xray.healthScore >= 65 ? 'B+' :
    xray.healthScore >= 55 ? 'B' :
    xray.healthScore >= 40 ? 'C' : 'D';

  const gradeColor =
    xray.healthScore >= 75 ? 'text-accent-600 dark:text-accent-400' :
    xray.healthScore >= 55 ? 'text-amber-600 dark:text-amber-400' :
    'text-red-600 dark:text-red-400';

  const gradeMsg =
    xray.healthScore >= 85 ? 'Mükemmel' :
    xray.healthScore >= 75 ? 'İyi' :
    xray.healthScore >= 65 ? 'İyi+' :
    xray.healthScore >= 55 ? 'Vasat' :
    xray.healthScore >= 40 ? 'Zayıf' : 'Kritik';

  const highCount = xray.findings.filter(f => f.severity === 'high').length;
  const mediumCount = xray.findings.filter(f => f.severity === 'medium').length;
  const topFindings = xray.findings.slice(0, expanded ? xray.findings.length : 2);

  return (
    <Card>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-gray-800/30 transition-colors text-left"
      >
        <div className="relative flex-shrink-0">
          <HealthRing score={xray.healthScore} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-xl font-black leading-none ${gradeColor}`}>{grade}</span>
            <span className="text-[9px] font-semibold text-gray-500 dark:text-gray-400 mt-0.5">{xray.healthScore}/100</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="t-h3 flex items-center gap-2">
            <Activity size={14} className="text-brand-500" />
            Portföy X-Ray
            <span className={`pill ${highCount > 0 ? 'pill-negative' : mediumCount > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'pill-positive'} !text-[10px] !px-2 !py-0.5`}>
              {gradeMsg}
            </span>
          </h3>
          <p className="t-caption mt-0.5">
            {xray.findings.length === 0
              ? 'Sorun bulunamadı — portföy sağlıklı'
              : `${xray.findings.length} bulgu (${highCount} yüksek · ${mediumCount} orta)`}
          </p>
        </div>
        {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>

      {(expanded || topFindings.length > 0) && xray.findings.length > 0 && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-200 dark:border-gray-800 pt-3">
          <div className="space-y-2">
            {topFindings.map(finding => {
              const s = SEVERITY_STYLES[finding.severity];
              return (
                <div
                  key={finding.id}
                  className={`flex items-start gap-3 p-3 rounded-xl bg-white dark:bg-gray-900/50 border-l-4 ${s.ring} ring-1 ring-slate-200 dark:ring-gray-800 transition-all hover:ring-slate-300 dark:hover:ring-gray-700`}
                >
                  <div className={`p-1.5 rounded-lg ${s.iconBg} ${s.iconColor} flex-shrink-0`}>
                    <AlertTriangle size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded ${s.pillBg} ${s.pillText}`}>
                        {s.label}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {finding.title}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      {finding.detail}
                    </p>
                  </div>
                  {finding.amount !== undefined && finding.amount > 0 && (
                    <span className="flex-shrink-0 text-xs font-bold tabular-nums text-gray-700 dark:text-gray-300">
                      {formatCurrency(finding.amount, 0)} ₺
                    </span>
                  )}
                </div>
              );
            })}
            {!expanded && xray.findings.length > 2 && (
              <button
                onClick={() => setExpanded(true)}
                className="w-full text-center text-xs text-brand-600 dark:text-brand-400 font-semibold py-1.5 hover:underline"
              >
                +{xray.findings.length - 2} daha — tümünü göster
              </button>
            )}
          </div>

          {expanded && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Döviz Maruziyet" value={`%${xray.effectiveCurrencyPct.toFixed(0)}`} sub={formatCurrency(xray.effectiveCurrencyExposure, 0) + ' ₺'} />
                <Stat label="Ölü Sermaye" value={`${xray.deadMoneyCount}`} sub={formatCurrency(xray.deadMoneyTotal, 0) + ' ₺'} />
                <Stat
                  label="En Büyük"
                  value={xray.topConcentration ? `%${xray.topConcentration.weight.toFixed(0)}` : '–'}
                  sub={xray.topConcentration?.symbol || '–'}
                />
              </div>

              {xray.sectorBreakdown.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-gray-800 p-3 bg-slate-50/50 dark:bg-gray-800/30">
                  <button
                    onClick={() => setShowSectors(!showSectors)}
                    className="flex items-center gap-1.5 t-eyebrow hover:text-gray-700 dark:hover:text-gray-300 w-full"
                  >
                    <Layers size={11} /> BIST Sektör Dağılımı
                    {showSectors ? <ChevronUp size={11} className="ml-auto" /> : <ChevronDown size={11} className="ml-auto" />}
                  </button>
                  {showSectors && (
                    <div className="mt-3 space-y-2">
                      {xray.sectorBreakdown.map(s => (
                        <div key={s.sector} className="flex items-center gap-2 text-xs">
                          <span className="font-semibold text-gray-700 dark:text-gray-300 w-24 truncate">
                            {s.sector}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-white dark:bg-gray-900 overflow-hidden ring-1 ring-slate-200 dark:ring-gray-800">
                            <div
                              className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full"
                              style={{ width: `${Math.min(100, s.weight)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-500 tabular-nums w-10 text-right">
                            %{s.weight.toFixed(0)}
                          </span>
                        </div>
                      ))}
                      {xray.missingSectors.length > 0 && (
                        <div className="flex items-start gap-1.5 mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                          <Sparkles size={11} className="mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                          <p className="text-[10px] text-amber-700 dark:text-amber-400">
                            <strong>Eksik sektörler:</strong> {xray.missingSectors.join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-800/30 p-3 text-center">
      <div className="t-eyebrow !text-[9px]">{label}</div>
      <div className="text-base font-bold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">{value}</div>
      <div className="text-[10px] text-gray-500 truncate">{sub}</div>
    </div>
  );
}
