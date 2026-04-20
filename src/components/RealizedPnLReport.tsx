import { useEffect, useState } from 'react';
import { Receipt, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { computeRealizedPnL, RealizedPnLReport as ReportData, ClosedLot } from '../services/taxLotService';
import { formatCurrency } from '../services/priceService';

const TYPE_LABELS: Record<string, string> = {
  stock: 'Hisse', crypto: 'Kripto', currency: 'Döviz',
  fund: 'Fon', eurobond: 'Eurobond', commodity: 'Emtia',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function PnLClass(v: number) {
  return v > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : v < 0
    ? 'text-red-600 dark:text-red-400'
    : 'text-gray-500';
}

export default function RealizedPnLReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const report = await computeRealizedPnL();
      setData(report);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <div className="flex items-center justify-center py-8 text-gray-500">
          <RefreshCw className="animate-spin mr-2" size={16} /> Hesaplanıyor…
        </div>
      </div>
    );
  }

  if (!data || data.closedLotsCount === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-gray-800 flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-md">
            <Receipt className="text-white" size={18} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Gerçekleşmiş Kâr/Zarar</h3>
            <p className="text-xs text-gray-500">FIFO bazlı tax-lot eşleşmesi</p>
          </div>
        </div>
        <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Henüz hiç satış yapılmamış — gerçekleşmiş kâr/zarar yok.
        </div>
      </div>
    );
  }

  const symbolsWithSells = data.symbols.filter(s => s.closedLots.length > 0);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-gray-800 flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-md">
          <Receipt className="text-white" size={18} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Gerçekleşmiş Kâr/Zarar (FIFO)</h3>
          <p className="text-xs text-gray-500">
            {data.closedLotsCount} kapalı lot · uzun vade = ≥365 gün
          </p>
        </div>
        <button
          onClick={load}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-slate-100 dark:hover:bg-gray-800"
          title="Yenile"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryCard label="Toplam Realize" value={data.totalRealized} sub="Tüm zamanlar" />
          <SummaryCard label="Bu Yıl (YTD)" value={data.yearToDateRealized} sub="Vergi bazı" />
          <SummaryCard label="Uzun Vade" value={data.ytdLongTerm} sub="≥365 gün YTD" />
          <SummaryCard label="Kısa Vade" value={data.ytdShortTerm} sub="<365 gün YTD" />
        </div>

        <div className="space-y-1.5">
          <h4 className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Sembol Bazında Kapalı Lotlar
          </h4>
          {symbolsWithSells.map(sym => {
            const isExpanded = expandedSymbol === sym.symbol;
            return (
              <div
                key={sym.symbol}
                className="rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedSymbol(isExpanded ? null : sym.symbol)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <span className="font-bold text-gray-900 dark:text-gray-100 w-20 text-left">
                    {sym.symbol}
                  </span>
                  <span className="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-gray-800">
                    {TYPE_LABELS[sym.assetType] || sym.assetType}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {sym.closedLots.length} kapalı · {sym.openLots.length} açık
                  </span>
                  <span className={`ml-auto text-sm font-bold ${PnLClass(sym.totalRealizedPnl)}`}>
                    {sym.totalRealizedPnl >= 0 ? '+' : ''}
                    {formatCurrency(sym.totalRealizedPnl)} ₺
                  </span>
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-900/40 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-gray-800/60">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-semibold text-gray-500">Alış</th>
                          <th className="text-left px-2 py-1.5 font-semibold text-gray-500">Satış</th>
                          <th className="text-right px-2 py-1.5 font-semibold text-gray-500">Adet</th>
                          <th className="text-right px-2 py-1.5 font-semibold text-gray-500">Alış ₺</th>
                          <th className="text-right px-2 py-1.5 font-semibold text-gray-500">Satış ₺</th>
                          <th className="text-right px-2 py-1.5 font-semibold text-gray-500">Tutma</th>
                          <th className="text-right px-2 py-1.5 font-semibold text-gray-500">K/Z</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-gray-800">
                        {sym.closedLots.map((lot, i) => (
                          <LotRow key={i} lot={lot} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  const cls = PnLClass(value);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-gray-800 p-3 bg-slate-50/50 dark:bg-gray-800/30">
      <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
      </div>
      <div className={`text-base font-bold mt-0.5 ${cls}`}>
        {value >= 0 ? '+' : ''}
        {formatCurrency(value)} ₺
      </div>
      <div className="text-[10px] text-gray-500">{sub}</div>
    </div>
  );
}

function LotRow({ lot }: { lot: ClosedLot }) {
  return (
    <tr>
      <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 tabular-nums">{formatDate(lot.buyDate)}</td>
      <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 tabular-nums">{formatDate(lot.sellDate)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
        {lot.quantity.toFixed(lot.quantity < 1 ? 6 : 2)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-400">
        {formatCurrency(lot.buyPrice)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-400">
        {formatCurrency(lot.sellPrice)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">
        {lot.holdingDays}g{' '}
        <span className={`text-[9px] font-semibold ${lot.isLongTerm ? 'text-emerald-500' : 'text-amber-500'}`}>
          {lot.isLongTerm ? 'UV' : 'KV'}
        </span>
      </td>
      <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${PnLClass(lot.realizedPnl)}`}>
        {lot.realizedPnl >= 0 ? '+' : ''}
        {formatCurrency(lot.realizedPnl)}
        <div className="text-[9px] font-normal">
          %{lot.realizedPnlPct >= 0 ? '+' : ''}
          {lot.realizedPnlPct.toFixed(1)}
        </div>
      </td>
    </tr>
  );
}
