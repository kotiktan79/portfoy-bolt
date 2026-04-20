import { supabase, Holding } from '../lib/supabase';
import { Transaction } from './transactionService';

export interface ClosedLot {
  symbol: string;
  assetType: string;
  buyDate: string;
  sellDate: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  buyCost: number;
  sellProceeds: number;
  buyFee: number;
  sellFee: number;
  realizedPnl: number;
  realizedPnlPct: number;
  holdingDays: number;
  isLongTerm: boolean;
}

export interface OpenLot {
  symbol: string;
  assetType: string;
  buyDate: string;
  quantity: number;
  buyPrice: number;
  buyCost: number;
  buyFee: number;
  holdingDays: number;
}

export interface SymbolPnLSummary {
  symbol: string;
  assetType: string;
  closedLots: ClosedLot[];
  openLots: OpenLot[];
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  remainingQuantity: number;
  averageCostBasis: number;
}

export interface RealizedPnLReport {
  symbols: SymbolPnLSummary[];
  totalRealized: number;
  totalUnrealized: number;
  yearToDateRealized: number;
  ytdLongTerm: number;
  ytdShortTerm: number;
  closedLotsCount: number;
}

const LONG_TERM_DAYS = 365;

interface BuyEntry {
  date: string;
  pricePerUnit: number;
  remaining: number;
  feePerUnit: number;
}

function fifoMatch(transactions: Transaction[]): { closed: ClosedLot[]; open: BuyEntry[] } {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
  );

  const buyQueue: BuyEntry[] = [];
  const closed: ClosedLot[] = [];

  for (const tx of sorted) {
    if (tx.transaction_type === 'buy') {
      const total = tx.total_amount || tx.price * tx.quantity;
      const feePerUnit = tx.quantity > 0 ? (tx.fee || 0) / tx.quantity : 0;
      const pricePerUnit = tx.quantity > 0 ? total / tx.quantity : tx.price;
      buyQueue.push({
        date: tx.transaction_date,
        pricePerUnit,
        remaining: tx.quantity,
        feePerUnit,
      });
    } else if (tx.transaction_type === 'sell') {
      let remainingToSell = tx.quantity;
      const sellPricePerUnit = tx.price;
      const sellFeePerUnit = tx.quantity > 0 ? (tx.fee || 0) / tx.quantity : 0;

      while (remainingToSell > 0 && buyQueue.length > 0) {
        const head = buyQueue[0];
        const matched = Math.min(head.remaining, remainingToSell);

        const buyCost = matched * head.pricePerUnit;
        const sellProceeds = matched * sellPricePerUnit;
        const buyFee = matched * head.feePerUnit;
        const sellFee = matched * sellFeePerUnit;
        const realizedPnl = sellProceeds - buyCost - buyFee - sellFee;
        const realizedPnlPct = buyCost > 0 ? (realizedPnl / buyCost) * 100 : 0;

        const buyDate = head.date;
        const sellDate = tx.transaction_date;
        const holdingDays = Math.floor(
          (new Date(sellDate).getTime() - new Date(buyDate).getTime()) / (1000 * 60 * 60 * 24)
        );

        closed.push({
          symbol: '',
          assetType: '',
          buyDate,
          sellDate,
          quantity: matched,
          buyPrice: head.pricePerUnit,
          sellPrice: sellPricePerUnit,
          buyCost,
          sellProceeds,
          buyFee,
          sellFee,
          realizedPnl,
          realizedPnlPct,
          holdingDays,
          isLongTerm: holdingDays >= LONG_TERM_DAYS,
        });

        head.remaining -= matched;
        remainingToSell -= matched;
        if (head.remaining <= 0.0000001) buyQueue.shift();
      }
    }
  }

  return { closed, open: buyQueue.filter(b => b.remaining > 0) };
}

export async function computeRealizedPnL(): Promise<RealizedPnLReport> {
  const [holdingsRes, txRes] = await Promise.all([
    supabase.from('holdings').select('*'),
    supabase.from('transactions').select('*').order('transaction_date', { ascending: true }),
  ]);

  const holdings: Holding[] = holdingsRes.data || [];
  const transactions: Transaction[] = txRes.data || [];

  const txByHolding = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (!tx.holding_id) continue;
    if (!txByHolding.has(tx.holding_id)) txByHolding.set(tx.holding_id, []);
    txByHolding.get(tx.holding_id)!.push(tx);
  }

  const symbols: SymbolPnLSummary[] = [];
  const today = new Date();
  const yearStart = new Date(today.getFullYear(), 0, 1).toISOString();

  for (const h of holdings) {
    const txs = txByHolding.get(h.id) || [];
    if (txs.length === 0) continue;

    const { closed, open } = fifoMatch(txs);
    closed.forEach(lot => {
      lot.symbol = h.symbol;
      lot.assetType = h.asset_type;
    });

    const openLots: OpenLot[] = open.map(b => ({
      symbol: h.symbol,
      assetType: h.asset_type,
      buyDate: b.date,
      quantity: b.remaining,
      buyPrice: b.pricePerUnit,
      buyCost: b.remaining * b.pricePerUnit,
      buyFee: b.remaining * b.feePerUnit,
      holdingDays: Math.floor((today.getTime() - new Date(b.date).getTime()) / (1000 * 60 * 60 * 24)),
    }));

    const totalRealizedPnl = closed.reduce((s, l) => s + l.realizedPnl, 0);
    const remainingQuantity = openLots.reduce((s, l) => s + l.quantity, 0);
    const totalCost = openLots.reduce((s, l) => s + l.buyCost + l.buyFee, 0);
    const totalUnrealizedPnl = remainingQuantity * (h.current_price || 0) - totalCost;
    const averageCostBasis = remainingQuantity > 0 ? totalCost / remainingQuantity : 0;

    symbols.push({
      symbol: h.symbol,
      assetType: h.asset_type,
      closedLots: closed.sort((a, b) => new Date(b.sellDate).getTime() - new Date(a.sellDate).getTime()),
      openLots,
      totalRealizedPnl,
      totalUnrealizedPnl,
      remainingQuantity,
      averageCostBasis,
    });
  }

  const allClosed = symbols.flatMap(s => s.closedLots);
  const ytdClosed = allClosed.filter(l => l.sellDate >= yearStart);

  return {
    symbols: symbols.sort((a, b) => Math.abs(b.totalRealizedPnl) - Math.abs(a.totalRealizedPnl)),
    totalRealized: allClosed.reduce((s, l) => s + l.realizedPnl, 0),
    totalUnrealized: symbols.reduce((s, sym) => s + sym.totalUnrealizedPnl, 0),
    yearToDateRealized: ytdClosed.reduce((s, l) => s + l.realizedPnl, 0),
    ytdLongTerm: ytdClosed.filter(l => l.isLongTerm).reduce((s, l) => s + l.realizedPnl, 0),
    ytdShortTerm: ytdClosed.filter(l => !l.isLongTerm).reduce((s, l) => s + l.realizedPnl, 0),
    closedLotsCount: allClosed.length,
  };
}
