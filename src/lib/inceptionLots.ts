// Kuruluş kârının günü = Bükreş takvim günü. UTC gece yarısından sonraki kayıt
// (22 Eki 23:56 UTC = 23 Eki 02:56 Bükreş) ertesi günün kuruna gider.
import { dayInTZ } from './eurPnl';

export function inceptionDay(ts: string | null | undefined): string {
  const d = dayInTZ(String(ts || ''));
  return d || String(ts || '').slice(0, 10);
}

export interface InceptionTx {
  transaction_date: string;
  realized_profit?: number | string | null;
  holding_id?: string | number | null;
}
export interface InceptionCashSell {
  created_at: string;
  currency?: string | null;
  notes?: string | null;
  related_holding_id?: string | number | null;
}
export interface RealizedEvent { day: string; native: number; currency: string }

const noteNative = (notes: string | null | undefined): number | null => {
  const m = String(notes || '').match(/Zarar[:\s]*\+?(-?[\d.]+)/) || String(notes || '').match(/K\/Z\s*\+?(-?[\d.]+)/);
  return m ? Number(m[1]) : null;
};

/** Satışlar önce işlem satırından. Aynı gün, aynı yerli tutar (ve varsa aynı pozisyon) nakit notunda tekrar varsa elenir. */
export function realizedEvents(
  txs: InceptionTx[],
  cash: InceptionCashSell[],
  ccyById: Map<string, string>,
): RealizedEvent[] {
  const out: RealizedEvent[] = [];
  const txNative = new Set<string>();
  for (const t of txs) {
    const native = Number(t.realized_profit) || 0;
    if (!native) continue;
    const day = inceptionDay(t.transaction_date);
    if (!day) continue;
    const currency = ccyById.get(String(t.holding_id)) || 'TRY';
    txNative.add(`${day}|n|${Math.round(native)}`);
    if (t.holding_id != null) txNative.add(`${day}|${t.holding_id}|${Math.round(native)}`);
    out.push({ day, native, currency });
  }
  for (const c of cash) {
    const native = noteNative(c.notes);
    if (native == null || !native) continue;
    const day = inceptionDay(c.created_at);
    if (!day) continue;
    const hid = c.related_holding_id == null ? '' : String(c.related_holding_id);
    if (txNative.has(`${day}|n|${Math.round(native)}`) || (hid && txNative.has(`${day}|${hid}|${Math.round(native)}`))) continue;
    const currency = (hid && ccyById.get(hid)) || String(c.currency || 'TRY').toUpperCase();
    out.push({ day, native, currency });
  }
  return out;
}
