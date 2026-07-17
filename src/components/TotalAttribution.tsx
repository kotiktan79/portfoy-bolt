import { useMemo } from 'react';
import { Trophy, TrendingDown, Anchor } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { computeAttribution, AttributionItem } from '../services/attributionService';
import { assetName } from '../lib/chartTheme';
import { formatCurrency } from '../services/priceService';

// Açık pozisyonların TOPLAM (kuruluştan bugüne) kâr katkısı — MonthlyAttribution'ın
// ay-bazlı fiyat hareketinden farklı olarak maliyet bazına göre hesaplanır.
export function TotalAttribution({ holdings }: { holdings: Holding[] }) {
  const report = useMemo(() => computeAttribution(holdings), [holdings]);

  if (report.items.length === 0) return null;

  const pnlColor = report.totalPnl >= 0
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="text-brand-600 dark:text-brand-400" size={22} />
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Toplam Kâr — Kim Ne Getirdi?</h3>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              Açık pozisyonlar, maliyet bazına göre (kuruluştan bugüne)
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-xl font-extrabold ${pnlColor}`}>
            {report.totalPnl >= 0 ? '+' : ''}{formatCurrency(report.totalPnl)} ₺
          </p>
          <p className="text-xs text-slate-500 dark:text-gray-400">
            %{report.totalPnlPct.toFixed(1)} · İlk 5 pozisyon toplam kârın {report.top5ContributionPct.toFixed(1)} puanını taşıyor
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-gray-700">
        <AttributionColumn
          title="EN ÇOK KAZANDIRAN"
          icon={<Trophy size={12} />}
          titleClass="text-green-700 dark:text-green-400"
          items={report.winners.slice(0, 6)}
          emptyText="Kârda pozisyon yok"
        />
        <AttributionColumn
          title="EN ÇOK KAYBETTİREN"
          icon={<TrendingDown size={12} />}
          titleClass="text-red-700 dark:text-red-400"
          items={report.losers.slice(0, 6)}
          emptyText="Zararda pozisyon yok"
        />
        <AttributionColumn
          title="SÜRÜKLENENLER"
          icon={<Anchor size={12} />}
          titleClass="text-amber-700 dark:text-amber-400"
          items={report.drags.slice(0, 6)}
          emptyText="Büyük ve durgun pozisyon yok"
          footnote="Değeri ₺10.000 üstü olup getirisi %5'in altında kalanlar — sermayeyi bağlayıp taşımayanlar."
        />
      </div>
    </div>
  );
}

function AttributionColumn({
  title,
  icon,
  titleClass,
  items,
  emptyText,
  footnote,
}: {
  title: string;
  icon: React.ReactNode;
  titleClass: string;
  items: AttributionItem[];
  emptyText: string;
  footnote?: string;
}) {
  return (
    <div className="p-5">
      <p className={`text-xs font-bold mb-3 flex items-center gap-1 ${titleClass}`}>
        {icon} {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-gray-500 italic">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.symbol + it.assetType} className="flex items-center justify-between text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-slate-700 dark:text-gray-200 truncate">{it.symbol}</p>
                <p className="text-[10px] text-slate-500 dark:text-gray-400">
                  {assetName(it.assetType)} · ağırlık %{it.weight.toFixed(1)}
                </p>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className={`font-bold ${it.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {it.pnl >= 0 ? '+' : ''}{formatCurrency(it.pnl)} ₺
                </p>
                <p className="text-[10px] text-slate-500 dark:text-gray-400">
                  %{it.pnlPct.toFixed(1)} · katkı {it.contributionPct >= 0 ? '+' : ''}{it.contributionPct.toFixed(1)} pp
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {footnote && (
        <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-3">{footnote}</p>
      )}
    </div>
  );
}
