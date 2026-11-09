import { manualPriceWarning } from '../lib/manualPrice';
import type { Holding } from '../lib/supabase';

export function ManualPriceWarning({ holding }: { holding: Holding }) {
  const text = manualPriceWarning(holding);
  return text ? <span className="block text-[11px] text-amber-700 dark:text-amber-300">{text}</span> : null;
}

export function ManualPriceSummary({ holdings }: { holdings: Holding[] }) {
  const stale = holdings.filter(h => manualPriceWarning(h));
  if (!stale.length) return null;
  return <div role="status" className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
    <strong>{stale.length} pozisyonun manuel fiyatı güncellenmeli.</strong>
    <p className="text-xs mt-1">Fiyatı 7 günden eski veya giriş tarihi bilinmeyen pozisyonlar var.</p>
  </div>;
}
