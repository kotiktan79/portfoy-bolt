// DENGELEME — satışsız önce, ±10 puanda somut işlem, altın satılmaz, kasa yok (2026-10-13).
// Bantlar portfolioPolicy.TARGET_ALLOCATION. Saf fonksiyon; ekran ve test aynı sonucu alır.

import {
  TARGET_ALLOCATION, CLASS_LABELS, PHYSICAL_FIXED_TYPES, STOCK_MIX_HINT,
  type AllocationClass,
} from '../config/portfolioPolicy';

/** Hedefin bu kadar puan dışına çıkınca somut al/sat tutarı önerilir. */
export const TRADE_DRIFT_POINTS = 10;

export interface RebalanceRow {
  key: AllocationClass;
  label: string;
  valueEUR: number;
  currentPct: number;
  targetPct: number;
  min: number;
  max: number;
  /** Mevcut − hedef, puan. */
  drift: number;
  outsideBand: boolean;
  hint?: string;
}

export interface RebalanceAction {
  id: string;
  order: number;
  kind: 'annual' | 'salary' | 'direct' | 'transfer' | 'trade' | 'dilute';
  title: string;
  detail: string;
  amountEUR: number;
}

const CLASS_ORDER: AllocationClass[] = ['stock', 'safe', 'commodity', 'crypto', 'fund', 'currency'];

export function isJanuary(d: Date, tz = 'Europe/Bucharest'): boolean {
  const m = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: '2-digit' }).format(d);
  return m === '01';
}

export function planRebalance(opts: {
  valuesEUR: Partial<Record<AllocationClass, number>>;
  /** XEON'un euro değeri. Hisse alt banda inince aktarım bununla sınırlanır. */
  xeonEUR?: number;
  asOf?: Date;
}): { rows: RebalanceRow[]; actions: RebalanceAction[]; annual: boolean; totalEUR: number } {
  const values: Record<AllocationClass, number> = {
    stock: 0, safe: 0, commodity: 0, crypto: 0, fund: 0, currency: 0,
  };
  for (const key of CLASS_ORDER) values[key] = Math.max(0, Number(opts.valuesEUR[key]) || 0);
  const total = CLASS_ORDER.reduce((s, k) => s + values[k], 0);

  const rows: RebalanceRow[] = CLASS_ORDER.map(key => {
    const band = TARGET_ALLOCATION[key];
    const valueEUR = values[key];
    const currentPct = total > 0 ? (valueEUR / total) * 100 : 0;
    const drift = currentPct - band.target;
    return {
      key,
      label: CLASS_LABELS[key],
      valueEUR,
      currentPct,
      targetPct: band.target,
      min: band.min,
      max: band.max,
      drift,
      outsideBand: total > 0 && (currentPct < band.min || currentPct > band.max),
      hint: key === 'stock' ? STOCK_MIX_HINT : undefined,
    };
  });

  const actions: RebalanceAction[] = [];
  const annual = opts.asOf ? isJanuary(opts.asOf) : false;
  if (annual) {
    actions.push({
      id: 'annual',
      order: 0,
      kind: 'annual',
      title: 'Yıllık dengeleme zamanı',
      detail: 'Ocak ayı. Bantları kontrol et; önce maaşı fazla sınıftan al, yeni parayı geride kalana yönlendir.',
      amountEUR: 0,
    });
  }

  if (total > 0) {
    const overweight = rows
      .filter(r => r.key !== 'currency' && r.currentPct > r.max)
      .sort((a, b) => b.drift - a.drift)[0];
    if (overweight) {
      actions.push({
        id: 'salary',
        order: 1,
        kind: 'salary',
        title: `Bu ay maaşını ${overweight.label.toLocaleLowerCase('tr-TR')} kârından al`,
        detail: `${overweight.label} %${overweight.currentPct.toFixed(1)} (bant %${overweight.min}–${overweight.max}). Satış yok; maaş bu sınıftan gelsin.`,
        amountEUR: 0,
      });
    }

    const laggard = rows
      .filter(r => r.drift < -0.05)
      .sort((a, b) => a.drift - b.drift)[0];
    if (laggard) {
      const gap = Math.max(0, (laggard.targetPct / 100) * total - laggard.valueEUR);
      actions.push({
        id: 'direct',
        order: 2,
        kind: 'direct',
        title: `Yeni parayı ${laggard.label.toLocaleLowerCase('tr-TR')} sınıfına yönlendir`,
        detail: `${laggard.label} %${laggard.currentPct.toFixed(1)}, hedef %${laggard.targetPct}. Nakdi ve yeni alımı buraya koy.`,
        amountEUR: gap,
      });
    }

    const stock = rows.find(r => r.key === 'stock')!;
    if (stock.currentPct < stock.min) {
      const need = Math.max(0, (stock.min / 100) * total - stock.valueEUR);
      const xeon = opts.xeonEUR == null ? need : Math.max(0, opts.xeonEUR);
      const amount = Math.min(need, xeon);
      if (amount > 0.5) {
        actions.push({
          id: 'xeon-to-stock',
          order: 3,
          kind: 'transfer',
          title: 'XEON\'dan hisseye aktar',
          detail: `Hisse %${stock.currentPct.toFixed(1)}, alt bant %${stock.min}. XEON'dan hisseye €${Math.round(amount).toLocaleString('de-DE')} aktar (alt banda çıkarmak için).`,
          amountEUR: amount,
        });
      }
    }

    for (const r of rows) {
      if (r.drift > TRADE_DRIFT_POINTS) {
        const excess = Math.max(0, r.valueEUR - (r.targetPct / 100) * total);
        if (PHYSICAL_FIXED_TYPES.has(r.key)) {
          actions.push({
            id: `dilute-${r.key}`,
            order: 4,
            kind: 'dilute',
            title: `${r.label}: yeni alım yapma, seyrelt`,
            detail: `${r.label} hedefin ${r.drift.toFixed(1)} puan üstünde. Fiziki altın elde tutulur. Yeni alım yapma, seyrelt: yeni para buraya gitmesin, gerisi büyüdükçe payı düşer.`,
            amountEUR: 0,
          });
        } else {
          actions.push({
            id: `sell-${r.key}`,
            order: 4,
            kind: 'trade',
            title: `${r.label} azalt`,
            detail: `Sapma +${r.drift.toFixed(1)} puan (±${TRADE_DRIFT_POINTS} geçti). Hedefe inmek için €${Math.round(excess).toLocaleString('de-DE')} azalt.`,
            amountEUR: excess,
          });
        }
      } else if (r.drift < -TRADE_DRIFT_POINTS) {
        const short = Math.max(0, (r.targetPct / 100) * total - r.valueEUR);
        actions.push({
          id: `buy-${r.key}`,
          order: 4,
          kind: 'trade',
          title: `${r.label} al`,
          detail: `Sapma ${r.drift.toFixed(1)} puan (±${TRADE_DRIFT_POINTS} geçti). Hedefe çıkmak için €${Math.round(short).toLocaleString('de-DE')} al.`,
          amountEUR: short,
        });
      }
    }
  }

  actions.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'tr'));
  return { rows, actions, annual, totalEUR: total };
}
