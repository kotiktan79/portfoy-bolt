import { useCallback, useEffect, useState } from 'react';
import { CalendarRange, Download, RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  computeAnnualReport,
  exportAnnualReportCSV,
  AnnualReport,
} from '../services/annualReportService';
import { useDarkMode } from '../hooks/useDarkMode';
import { chartChrome, fmtAxisTRY, fmtTRY0, fmtSignedTRY0, fmtUSD0 } from '../lib/chartTheme';

const INCOME_TYPE_LABELS: Record<string, string> = {
  dividend: 'Temettü',
  interest: 'Faiz',
  staking: 'Staking',
  coupon: 'Kupon',
  profit_taking: 'Kâr Realizasyonu',
  other: 'Diğer',
};

export default function AnnualReportCard() {
  const { isDark } = useDarkMode();
  const chrome = chartChrome(isDark);
  const [report, setReport] = useState<AnnualReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    // Ağ takılırsa sonsuz iskelet yerine 20 sn'de hata durumuna düş
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('annual-report-timeout')), 20000)
    );
    Promise.race([computeAnnualReport(), timeout])
      .then((r) => { if (!cancelled) setReport(r); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Seri kimliği sabittir: realize kâr = mavi, pasif gelir = yeşil (chartTheme slotları)
  const realizedColor = isDark ? '#3987e5' : '#2a78d6';
  const incomeColor = isDark ? '#199e70' : '#1baf7a';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="text-brand-600 dark:text-brand-400" size={22} />
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Yıllık Kazanç Raporu</h3>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              Realize kâr (FIFO) + pasif gelir + maaş çekimleri + dış para akışı, yıl bazında
            </p>
          </div>
        </div>
        <button
          onClick={() => report && exportAnnualReportCSV(report)}
          disabled={!report || report.years.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-200 hover:bg-slate-200 dark:hover:bg-gray-600 disabled:opacity-40 transition-colors"
        >
          <Download size={14} /> CSV
        </button>
      </div>

      {loading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-slate-100 dark:bg-gray-700 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : failed ? (
        <div className="p-6 flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-slate-500 dark:text-gray-400">
            Rapor yüklenemedi (ağ yavaş veya kesildi).
          </p>
          <button
            onClick={retry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors"
          >
            <RefreshCw size={14} /> Tekrar dene
          </button>
        </div>
      ) : !report || report.years.length === 0 ? (
        <p className="p-6 text-sm text-slate-400 dark:text-gray-500 italic">
          Henüz kapanan lot, gelir kaydı veya nakit hareketi yok.
        </p>
      ) : (
        <>
          {/* Yıl bazlı çubuklar — iki seri, kimlik renkleri sabit.
              Her iki seri de sıfırsa grafik atlanır (₺0-₺4'lük anlamsız eksen olmasın). */}
          {report.years.some(y => Math.round(y.realizedPnlTRY) !== 0 || Math.round(y.incomeTRY) !== 0) && (
          <div className="px-5 pt-5">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={report.years.map((y) => ({
                year: String(y.year),
                realized: Math.round(y.realizedPnlTRY),
                income: Math.round(y.incomeTRY),
              }))} margin={{ top: 10, right: 10, left: 10, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke={chrome.grid} />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: chrome.axis }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12, fill: chrome.axis }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtAxisTRY}
                  width={70}
                />
                <Tooltip
                  cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    return (
                      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 space-y-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                        {payload.map((p) => (
                          <p key={p.dataKey as string} className="text-sm font-bold" style={{ color: p.color }}>
                            {p.name}: {fmtSignedTRY0(Number(p.value))}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={0} stroke={chrome.neutralLine} />
                <Bar dataKey="realized" name="Realize kâr" fill={realizedColor} radius={[4, 4, 0, 0]} maxBarSize={48} />
                <Bar dataKey="income" name="Pasif gelir" fill={incomeColor} radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}

          {/* Tablo */}
          <div className="p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-700">
                  <th className="py-2 pr-3">Yıl</th>
                  <th className="py-2 pr-3 text-right">Realize kâr</th>
                  <th className="py-2 pr-3 text-right">Pasif gelir</th>
                  <th className="py-2 pr-3 text-right">Maaş çekimi</th>
                  <th className="py-2 pr-3 text-right">Yatırılan</th>
                  <th className="py-2 text-right">Çekilen</th>
                </tr>
              </thead>
              <tbody>
                {report.years.map((y) => (
                  <tr key={y.year} className="border-b border-slate-100 dark:border-gray-700/50 align-top">
                    <td className="py-2 pr-3 font-semibold text-gray-900 dark:text-white">{y.year}</td>
                    <td className="py-2 pr-3 text-right">
                      <span className={`font-semibold ${y.realizedPnlTRY >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {fmtSignedTRY0(y.realizedPnlTRY)}
                      </span>
                      <p className="text-[10px] text-slate-500 dark:text-gray-400">
                        {y.closedLotCount} lot · uzun {fmtSignedTRY0(y.realizedLongTermTRY)} / kısa {fmtSignedTRY0(y.realizedShortTermTRY)}
                      </p>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className="font-semibold text-gray-900 dark:text-white">{fmtTRY0(y.incomeTRY)}</span>
                      {Object.keys(y.incomeByType).length > 0 && (
                        <p className="text-[10px] text-slate-500 dark:text-gray-400">
                          {Object.entries(y.incomeByType)
                            .sort((a, b) => b[1] - a[1])
                            .map(([t, v]) => `${INCOME_TYPE_LABELS[t] || t} ${fmtTRY0(v)}`)
                            .join(' · ')}
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {y.salaryWithdrawnUSD > 0 ? fmtUSD0(y.salaryWithdrawnUSD) : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-600 dark:text-gray-300">{fmtTRY0(y.depositsTRY)}</td>
                    <td className="py-2 text-right text-slate-600 dark:text-gray-300">
                      {y.withdrawalsTRY > 0 ? `−${fmtTRY0(y.withdrawalsTRY)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold text-gray-900 dark:text-white">
                  <td className="py-2 pr-3">Toplam</td>
                  <td className={`py-2 pr-3 text-right ${report.totalRealizedTRY >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {fmtSignedTRY0(report.totalRealizedTRY)}
                  </td>
                  <td className="py-2 pr-3 text-right">{fmtTRY0(report.totalIncomeTRY)}</td>
                  <td className="py-2 pr-3 text-right text-emerald-600 dark:text-emerald-400">
                    {report.totalSalaryUSD > 0 ? fmtUSD0(report.totalSalaryUSD) : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right">{fmtTRY0(report.totalDepositsTRY)}</td>
                  <td className="py-2 text-right">
                    {report.totalWithdrawalsTRY > 0 ? `−${fmtTRY0(report.totalWithdrawalsTRY)}` : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
            <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-3">
              💡 Realize kâr FIFO lot eşleştirmesiyle satış yılına yazılır; TRY çevrimi satış günü
              kuruyla, nakit hareketleri işlem günü kuruyla yapılır (kur verisi olmayan eski tarihler
              en yakın mevcut kura düşer). Yatırılan para kâr değildir, karşılaştırma için gösterilir.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
