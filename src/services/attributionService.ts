import { Holding } from '../lib/supabase';

export interface AttributionItem {
  symbol: string;
  assetType: string;
  cost: number;
  value: number;
  pnl: number;
  pnlPct: number;
  contributionPct: number;
  weight: number;
}

export interface AttributionReport {
  totalCost: number;
  totalValue: number;
  totalPnl: number;
  totalPnlPct: number;
  items: AttributionItem[];
  winners: AttributionItem[];
  losers: AttributionItem[];
  drags: AttributionItem[];
  top5ContributionPct: number;
  bottom5ContributionPct: number;
}

const DRAG_PNL_PCT = 5;
const DRAG_MIN_VALUE = 10000;

export function computeAttribution(holdings: Holding[]): AttributionReport {
  const items: AttributionItem[] = [];
  let totalCost = 0;
  let totalValue = 0;

  for (const h of holdings) {
    const cost = (h.purchase_price || 0) * (h.quantity || 0);
    const value = (h.current_price || 0) * (h.quantity || 0);
    if (cost === 0 && value === 0) continue;
    totalCost += cost;
    totalValue += value;
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    items.push({
      symbol: h.symbol,
      assetType: h.asset_type,
      cost,
      value,
      pnl,
      pnlPct,
      contributionPct: 0,
      weight: 0,
    });
  }

  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  for (const it of items) {
    it.contributionPct = totalCost > 0 ? (it.pnl / totalCost) * 100 : 0;
    it.weight = totalValue > 0 ? (it.value / totalValue) * 100 : 0;
  }

  const sortedByContrib = [...items].sort((a, b) => b.pnl - a.pnl);
  const winners = sortedByContrib.filter(i => i.pnl > 0).slice(0, 8);
  const losers = sortedByContrib.filter(i => i.pnl < 0).reverse().slice(0, 5);
  const drags = items
    .filter(i => i.pnlPct < DRAG_PNL_PCT && i.value >= DRAG_MIN_VALUE && i.cost > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const top5ContributionPct = winners.slice(0, 5).reduce((s, i) => s + i.contributionPct, 0);
  const bottom5ContributionPct = losers.slice(0, 5).reduce((s, i) => s + i.contributionPct, 0);

  return {
    totalCost,
    totalValue,
    totalPnl,
    totalPnlPct,
    items: sortedByContrib,
    winners,
    losers,
    drags,
    top5ContributionPct,
    bottom5ContributionPct,
  };
}
