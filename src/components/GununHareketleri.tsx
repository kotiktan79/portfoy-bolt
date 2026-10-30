import { useMemo, type ReactNode } from 'react';
import type { LiveGain } from '../lib/eurPnl';
import { summarizeMovers, shareOfPortfolioPct, type DailyMover } from '../lib/dailyMovers';

// Ana sayfa: 'Bugün en çok yükselen / düşen' — EURO, taban = dünkü kapanış (2026-10-30).
// Ek sorgu YOK: HomePage'in zaten çektiği canlı euro kârından (getLiveEurGain) okur, aynı tazeleme ritmi.

function eur(n: number): string {
  const abs = Math.abs(n);
  const s = new Intl.NumberFormat('de-DE', { maximumFractionDigits: abs < 10 ? 2 : 0, minimumFractionDigits: 0 }).format(abs);
  return `${n >= 0 ? '+' : '−'}€${s}`;
}
function pct(n: number, digits = 1): string {
  const s = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Math.abs(n));
  return `${n >= 0 ? '+' : '−'}%${s}`;
}
function shortDate(day: string): string {
  const [, m, d] = day.slice(0, 10).split('-');
  return d && m ? `${d}.${m}` : day;
}

function Row({ m, base }: { m: DailyMover; base: number | null | undefined }) {
  const d = m.eurDelta ?? 0;
  const share = shareOfPortfolioPct(d, base);
  const up = d >= 0;
  return (
    <li className="flex items-baseline justify-between gap-2 py-1.5" data-testid="mover-row">
      <div className="min-w-0">
        <span className="font-semibold text-gray-900 dark:text-white">{m.symbol}</span>
        <span className="ml-2 text-sm text-slate-500 dark:text-gray-400">
          fiyat {pct(m.pricePct ?? 0)}
          {m.fxEUR !== null && Math.abs(m.fxEUR) >= 1 && <> · kur payı {eur(m.fxEUR)}</>}
        </span>
      </div>
      <div className="shrink-0 text-right">
        <span className={`font-bold tabular-nums ${up ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-400'}`}>{eur(d)}</span>
        {share !== null && <span className="block text-xs text-slate-500 dark:text-gray-400">portföyün {pct(share, 2)}</span>}
      </div>
    </li>
  );
}

export interface GununHareketleriProps {
  live: LiveGain | null;
  /** son kapanış serveti (€) — yüzde tabanı, Hero ile aynı */
  baseWealthEUR?: number | null;
  state?: 'loading' | 'ok' | 'error';
}

export function GununHareketleri({ live, baseWealthEUR, state = 'ok' }: GununHareketleriProps) {
  const sum = useMemo(() => (live?.movers ? summarizeMovers(live.movers, 3) : null), [live]);
  const base = baseWealthEUR ?? null;

  let body: ReactNode;
  if (!live) {
    body = <p className="mt-3 text-base text-slate-500 dark:text-gray-400">{state === 'error' ? 'Veri yok: canlı fiyatlar okunamadı.' : 'Bakılıyor…'}</p>;
  } else if (!sum || sum.counted === 0) {
    body = <p className="mt-3 text-base text-slate-600 dark:text-gray-300">Veri yok: dünkü kapanış fiyatları bulunamadı.</p>;
  } else {
    const totalShare = shareOfPortfolioPct(sum.totalEUR, base);
    const otherEUR = live.gainEUR - sum.totalEUR;
    body = (
      <div className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">En çok yükselen</h3>
            {sum.gainers.length ? <ul>{sum.gainers.map(m => <Row key={m.symbol} m={m} base={base} />)}</ul>
              : <p className="py-1.5 text-sm text-slate-500 dark:text-gray-400">Bugün yükselen yok.</p>}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">En çok düşen</h3>
            {sum.losers.length ? <ul>{sum.losers.map(m => <Row key={m.symbol} m={m} base={base} />)}</ul>
              : <p className="py-1.5 text-sm text-slate-500 dark:text-gray-400">Bugün düşen yok.</p>}
          </div>
        </div>
        <div className="border-t border-slate-200 dark:border-gray-700 pt-2 text-sm text-slate-700 dark:text-gray-200">
          <p data-testid="movers-total">
            Pozisyonların toplamı: <span className={`font-bold ${sum.totalEUR >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-400'}`}>{eur(sum.totalEUR)}</span>
            {totalShare !== null && <> · portföyün {pct(totalShare, 2)}</>}
          </p>
          {Math.abs(otherEUR) >= 1 && (
            <p className="text-slate-500 dark:text-gray-400" data-testid="movers-other">
              Nakit döviz ve diğer: {eur(otherEUR)} · genel toplam {eur(live.gainEUR)}
            </p>
          )}
          {sum.noData.length > 0 && (
            <p className="text-slate-500 dark:text-gray-400" data-testid="movers-nodata">
              Veri yok: {sum.noData.map(m => m.symbol).join(', ')}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="gunun-hareketleri-title" className="card-primary p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="gunun-hareketleri-title" className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
          Bugün en çok yükselen / düşen
        </h2>
        <span className="text-xs text-slate-500 dark:text-gray-400">
          euro, kur dahil{live ? ` · ${shortDate(live.sinceDate)} kapanışından beri` : ''}
        </span>
      </div>
      {body}
    </section>
  );
}

export default GununHareketleri;
