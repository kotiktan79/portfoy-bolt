// ÖLÇÜ SAYFASI — 2026-10-07
// Kullanıcı: "ben eskisi gibi görmek istiyorum, bu dediğini ayrı bir sekmede göster."
// Ana ekran eski ölçüye (TL maliyet-bazlı) döndü; euro cetveli, kur-nötr ve düzleştirilmiş
// çekim önerisi bu sayfada yan yana duruyor. Hiçbir kural değişmedi, maaş hâlâ euro cetvelinden.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Info } from 'lucide-react';
import { getMeasureCompare, type MeasureCompare, SMOOTHED_RATE, SMOOTH_WINDOW } from '../services/measureCompareService';

const tl = (v: number | null) => v == null ? '—' : `${v >= 0 ? '+' : '−'}₺${Math.abs(Math.round(v)).toLocaleString('tr-TR')}`;
const eu = (v: number | null) => v == null ? '—' : `${v >= 0 ? '+' : '−'}€${Math.abs(Math.round(v)).toLocaleString('tr-TR')}`;
const euPlain = (v: number) => `€${Math.round(v).toLocaleString('tr-TR')}`;
const tone = (v: number | null) => v == null ? 'text-slate-400' : v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
const ayAd = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'][Number(m) - 1]} ${y.slice(2)}`;
};

export default function MeasurePage() {
  const navigate = useNavigate();
  const [d, setD] = useState<MeasureCompare | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getMeasureCompare().then(setD).catch(e => setErr(String(e?.message || e)));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950">
      <div className="px-4 py-5 max-w-5xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Geri"
            className="h-9 w-9 rounded-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 flex items-center justify-center text-slate-500">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Ölçü Karşılaştırma</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Aynı dönem, dört farklı ölçü. Maaş hâlâ euro cetvelinden ödenir.</p>
          </div>
        </div>

        {err && <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3 text-sm text-rose-700 dark:text-rose-300">Hata: {err}</div>}
        {!d && !err && <div className="h-40 animate-pulse rounded-xl bg-slate-200 dark:bg-gray-800" />}

        {d && (
          <>
            {/* ÖZET KARTLAR */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card title="Eski ölçü (TL)" sub="değer − maliyet, dönem toplamı" val={tl(d.totals.tlPnlDelta)} t={tone(d.totals.tlPnlDelta)} />
              <Card title="Euro cetveli" sub="bugünkü kural, nominal" val={eu(d.totals.eurGain)} t={tone(d.totals.eurGain)} />
              <Card title="Kur-nötr" sub="kurlar sabit tutulsa" val={eu(d.totals.fxNeutral)} t={tone(d.totals.fxNeutral)} />
              <Card title="Kurun payı" sub="euro cetveli − kur-nötr" val={eu(d.totals.fxShare)} t={tone(d.totals.fxShare)} />
            </div>

            {/* AY AY TABLO */}
            <div className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-gray-800">
                <h2 className="font-semibold text-slate-900 dark:text-white text-sm">Ay ay</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-gray-950/50">
                      <th className="text-left px-3 py-2 font-medium">ay</th>
                      <th className="text-right px-3 py-2 font-medium">eski ölçü (TL)</th>
                      <th className="text-right px-3 py-2 font-medium">euro cetveli</th>
                      <th className="text-right px-3 py-2 font-medium">kur-nötr</th>
                      <th className="text-right px-3 py-2 font-medium">kur payı</th>
                      <th className="text-right px-3 py-2 font-medium">maaş (kural)</th>
                      <th className="text-right px-3 py-2 font-medium">maaş (düzleşt.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map(r => (
                      <tr key={r.month} className="border-t border-slate-100 dark:border-gray-800">
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">{ayAd(r.month)}</td>
                        <td className={`px-3 py-2 text-right ${tone(r.tlPnlDelta)}`}>{tl(r.tlPnlDelta)}</td>
                        <td className={`px-3 py-2 text-right ${tone(r.eurGain)}`}>{eu(r.eurGain)}</td>
                        <td className={`px-3 py-2 text-right ${tone(r.fxNeutral)}`}>{eu(r.fxNeutral)}</td>
                        <td className={`px-3 py-2 text-right ${tone(r.fxShare)}`}>{eu(r.fxShare)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-white">{euPlain(r.eurSalary)}</td>
                        <td className="px-3 py-2 text-right text-brand-600 dark:text-brand-400">{euPlain(r.smoothedSalary)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-950/50 font-semibold">
                      <td className="px-3 py-2 text-slate-900 dark:text-white">toplam</td>
                      <td className={`px-3 py-2 text-right ${tone(d.totals.tlPnlDelta)}`}>{tl(d.totals.tlPnlDelta)}</td>
                      <td className={`px-3 py-2 text-right ${tone(d.totals.eurGain)}`}>{eu(d.totals.eurGain)}</td>
                      <td className={`px-3 py-2 text-right ${tone(d.totals.fxNeutral)}`}>{eu(d.totals.fxNeutral)}</td>
                      <td className={`px-3 py-2 text-right ${tone(d.totals.fxShare)}`}>{eu(d.totals.fxShare)}</td>
                      <td className="px-3 py-2 text-right text-slate-900 dark:text-white">{euPlain(d.totals.eurSalaryPaid)}</td>
                      <td className="px-3 py-2 text-right text-brand-600 dark:text-brand-400">{euPlain(d.totals.smoothedPaid)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* DÜZLEŞTİRİLMİŞ ÇEKİM ÖNERİSİ */}
            <div className="rounded-2xl bg-white dark:bg-gray-900 border border-brand-200 dark:border-brand-900 p-4">
              <h2 className="font-semibold text-slate-900 dark:text-white text-sm mb-1">Düzleştirilmiş çekim (öneri, uygulanmadı)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                %{(SMOOTHED_RATE * 100).toFixed(1)} × son {SMOOTH_WINDOW} ayın ortalama euro serveti ÷ 12. Kur ve piyasa gürültüsü pencerede sönümlenir.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 dark:bg-gray-950/50 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">bugün verirdi</div>
                  <div className="text-2xl font-bold text-brand-600 dark:text-brand-400">{euPlain(d.smoothedNow)}<span className="text-sm font-normal text-slate-500">/ay</span></div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-gray-950/50 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">€1.000/ay için gereken servet</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{euPlain(d.wealthForCap)}</div>
                </div>
              </div>
            </div>

            {/* NOTLAR — her ölçünün sınırı açıkça yazılı */}
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Info size={14} className="text-amber-600 dark:text-amber-400" />
                <h2 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">Bu sayfanın sınırları</h2>
              </div>
              <ul className="space-y-1.5 text-xs text-amber-900/90 dark:text-amber-200/80 list-disc pl-4">
                {d.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ title, sub, val, t }: { title: string; sub: string; val: string; t: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</div>
      <div className={`text-lg font-bold tabular-nums ${t}`}>{val}</div>
      <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}
