import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { analyzeXRay, XRayFinding } from '../services/xrayService';
import { formatCurrency } from '../services/priceService';
import { Card, CardHeader } from './ui/Card';

const SEVERITY_STYLES: Record<XRayFinding['severity'], string> = {
  high: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400',
  medium: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400',
  low: 'bg-brand-50 dark:bg-brand-950/30 border-brand-200 dark:border-brand-900 text-brand-700 dark:text-brand-400',
  info: 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-400',
};

const SEVERITY_ICONS: Record<XRayFinding['severity'], string> = {
  high: 'YÜKSEK',
  medium: 'ORTA',
  low: 'DÜŞÜK',
  info: 'BİLGİ',
};

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
    xray.healthScore >= 75 ? 'text-accent-500' :
    xray.healthScore >= 55 ? 'text-amber-500' :
    'text-red-500';

  return (
    <Card>
      <CardHeader
        icon={Activity}
        iconTone="brand"
        title="Portföy X-Ray"
        subtitle={`${xray.findings.length === 0 ? 'Sorun bulunamadı' : `${xray.findings.length} bulgu`} · Sağlık skoru`}
        onClick={() => setExpanded(!expanded)}
        rightSlot={
          <>
            <div className={`text-2xl font-black ${gradeColor}`}>{grade}</div>
            <span className="text-xs font-semibold text-gray-500">{xray.healthScore}</span>
            {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </>
        }
      />

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-200 dark:border-gray-800 pt-3">
          {xray.findings.length > 0 ? (
            <div className="space-y-1.5">
              {xray.findings.map(finding => (
                <div
                  key={finding.id}
                  className={`flex items-start gap-2 p-2.5 rounded-xl border ${SEVERITY_STYLES[finding.severity]}`}
                >
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-bold opacity-70">{SEVERITY_ICONS[finding.severity]}</span>
                      <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                        {finding.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                      {finding.detail}
                    </p>
                  </div>
                  {finding.amount !== undefined && finding.amount > 0 && (
                    <span className="flex-shrink-0 text-xs font-bold tabular-nums">
                      {formatCurrency(finding.amount, 0)} ₺
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-accent-600 dark:text-accent-400 text-center py-2">
              Portföy sağlıklı görünüyor — kritik bulgu yok.
            </p>
          )}

          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Döviz" value={`%${xray.effectiveCurrencyPct.toFixed(0)}`} sub={formatCurrency(xray.effectiveCurrencyExposure, 0) + ' ₺'} />
            <Stat label="Ölü Para" value={`${xray.deadMoneyCount}`} sub={formatCurrency(xray.deadMoneyTotal, 0) + ' ₺'} />
            <Stat
              label="En Büyük"
              value={xray.topConcentration ? `%${xray.topConcentration.weight.toFixed(0)}` : '–'}
              sub={xray.topConcentration?.symbol || '–'}
            />
          </div>

          {xray.sectorBreakdown.length > 0 && (
            <div>
              <button
                onClick={() => setShowSectors(!showSectors)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700"
              >
                <Layers size={11} /> BIST Sektör Dağılımı
                {showSectors ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {showSectors && (
                <div className="mt-2 space-y-1">
                  {xray.sectorBreakdown.map(s => (
                    <div key={s.sector} className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-gray-700 dark:text-gray-300 w-24 truncate">
                        {s.sector}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-brand-400 to-brand-600"
                          style={{ width: `${Math.min(100, s.weight)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 tabular-nums w-10 text-right">
                        %{s.weight.toFixed(0)}
                      </span>
                      <span className="text-[10px] text-gray-400 tabular-nums w-20 text-right">
                        {formatCurrency(s.value, 0)} ₺
                      </span>
                    </div>
                  ))}
                  {xray.missingSectors.length > 0 && (
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 italic mt-1.5">
                      Eksik veya çok az: {xray.missingSectors.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-800/30 p-2 text-center">
      <div className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
      </div>
      <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">{value}</div>
      <div className="text-[9px] text-gray-500 truncate">{sub}</div>
    </div>
  );
}
