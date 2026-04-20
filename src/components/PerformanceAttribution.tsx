import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Trophy } from 'lucide-react';
import { usePortfolio } from '../contexts/PortfolioContext';
import { computeAttribution, AttributionItem } from '../services/attributionService';
import { formatCurrency } from '../services/priceService';
import { Card, CardHeader, CardBody } from './ui/Card';

const TYPE_LABELS: Record<string, string> = {
  stock: 'Hisse', crypto: 'Kripto', currency: 'Döviz',
  fund: 'Fon', eurobond: 'Eurobond', commodity: 'Emtia',
};

export default function PerformanceAttribution() {
  const { holdings } = usePortfolio();
  const report = useMemo(() => computeAttribution(holdings), [holdings]);

  if (report.totalCost === 0) return null;

  const maxAbsPnl = Math.max(
    ...report.items.map(i => Math.abs(i.pnl)),
    1
  );

  return (
    <Card>
      <CardHeader
        icon={Trophy}
        iconTone="brand"
        title="Performans Atfı"
        subtitle={`+%${report.totalPnlPct.toFixed(1)} getirinin nereden geldiği — top 5: %${report.top5ContributionPct.toFixed(1)}`}
        rightSlot={
          <div className={`text-base font-bold ${report.totalPnl >= 0 ? 'text-accent-600' : 'text-red-600'}`}>
            {report.totalPnl >= 0 ? '+' : ''}
            {formatCurrency(report.totalPnl, 0)} ₺
          </div>
        }
      />
      <CardBody>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-[11px] font-bold text-accent-600 dark:text-accent-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <TrendingUp size={11} /> Kazandıranlar (Top 8)
            </h4>
            <div className="space-y-1.5">
              {report.winners.map(item => (
                <AttributionRow key={item.symbol} item={item} max={maxAbsPnl} positive />
              ))}
              {report.winners.length === 0 && (
                <p className="text-xs text-gray-400 italic">Kazandıran pozisyon yok.</p>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <TrendingDown size={11} /> Kaybettirenler
            </h4>
            <div className="space-y-1.5">
              {report.losers.map(item => (
                <AttributionRow key={item.symbol} item={item} max={maxAbsPnl} positive={false} />
              ))}
              {report.losers.length === 0 && (
                <p className="text-xs text-accent-600 italic">Kaybettiren pozisyon yok — tümü artıda.</p>
              )}
            </div>
          </div>
        </div>

        {report.drags.length > 0 && (
          <div>
            <h4 className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Minus size={11} /> Yük Olanlar (≥₺10K, &lt;%5 getiri)
            </h4>
            <div className="space-y-1.5">
              {report.drags.map(item => (
                <DragRow key={item.symbol} item={item} />
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-2 italic">
              Bu pozisyonlar ortalama portföy getirisinin altında — redeploy adayları.
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function AttributionRow({ item, max, positive }: { item: AttributionItem; max: number; positive: boolean }) {
  const widthPct = (Math.abs(item.pnl) / max) * 100;
  const barColor = positive ? 'bg-accent-400 dark:bg-accent-700' : 'bg-red-400 dark:bg-red-700';
  const textColor = positive ? 'text-accent-700 dark:text-accent-400' : 'text-red-700 dark:text-red-400';

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-bold text-gray-900 dark:text-gray-100 w-16 truncate">{item.symbol}</span>
      <span className="text-[9px] text-gray-500 px-1 py-0.5 rounded bg-slate-100 dark:bg-gray-800 w-12 text-center">
        {TYPE_LABELS[item.assetType] || item.assetType}
      </span>
      <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${widthPct}%` }} />
      </div>
      <span className={`font-bold tabular-nums w-20 text-right ${textColor}`}>
        {item.pnl >= 0 ? '+' : ''}
        {formatCurrency(item.pnl, 0)} ₺
      </span>
      <span className={`text-[10px] tabular-nums w-12 text-right ${textColor}`}>
        %{item.pnlPct >= 0 ? '+' : ''}
        {item.pnlPct.toFixed(0)}
      </span>
      <span className="text-[10px] text-gray-400 tabular-nums w-12 text-right">
        +%{item.contributionPct.toFixed(2)}
      </span>
    </div>
  );
}

function DragRow({ item }: { item: AttributionItem }) {
  return (
    <div className="flex items-center gap-2 text-xs bg-amber-50/50 dark:bg-amber-950/20 rounded px-2 py-1.5 border border-amber-200/50 dark:border-amber-900/30">
      <span className="font-bold text-gray-900 dark:text-gray-100 w-16 truncate">{item.symbol}</span>
      <span className="text-[9px] text-gray-500 px-1 py-0.5 rounded bg-white dark:bg-gray-800 w-12 text-center">
        {TYPE_LABELS[item.assetType] || item.assetType}
      </span>
      <span className="text-gray-500 dark:text-gray-400 tabular-nums">
        {formatCurrency(item.value, 0)} ₺
      </span>
      <span className="ml-auto text-amber-700 dark:text-amber-400 font-semibold tabular-nums">
        %{item.pnlPct >= 0 ? '+' : ''}
        {item.pnlPct.toFixed(1)}
      </span>
      <span className="text-[10px] text-gray-400 tabular-nums w-12 text-right">
        ağırlık %{item.weight.toFixed(1)}
      </span>
    </div>
  );
}
