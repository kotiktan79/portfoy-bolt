import { supabase, Holding } from '../lib/supabase';
import { Transaction } from './transactionService';
import { getFxRatesFromHoldings, fxToTRY } from '../lib/fx';

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
  // Satışın öncesinde eşleşecek buy kaydı yoktu — maliyet bazı holdings
  // satırındaki ortalama maliyetten YAKLAŞIK alındı. UI bunu ≈ ile işaretler.
  approxBasis?: boolean;
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
  currency: string;
  closedLots: ClosedLot[];
  openLots: OpenLot[];
  totalRealizedPnl: number;       // in the symbol's own currency
  totalUnrealizedPnl: number;     // in the symbol's own currency
  totalRealizedPnlTRY: number;    // FX-converted to TRY
  totalUnrealizedPnlTRY: number;  // FX-converted to TRY
  remainingQuantity: number;
  averageCostBasis: number;
}

// Report-level totals are denominated in TRY (a single base) — per-symbol PnL
// is computed in each holding's own currency, so summing them raw would add
// dollars to lira. Everything aggregated here is FX-converted first.
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

// fallbackBasis: pozisyon transactions'a buy olarak girilmemişse (doğrudan
// holdings'e yazılmışsa) satılan miktarın maliyet bazı olarak kullanılır.
function fifoMatch(
  transactions: Transaction[],
  fallbackBasis?: { price: number; date: string }
): { closed: ClosedLot[]; open: BuyEntry[] } {
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

      // Buy kuyruğu tükendi ama satılacak miktar kaldı → yaklaşık maliyet bazı.
      // (Aksi halde bu satış sessizce düşer ve realize kâr 0 görünürdü.)
      if (remainingToSell > 0.0000001 && fallbackBasis && fallbackBasis.price > 0) {
        const matched = remainingToSell;
        const buyCost = matched * fallbackBasis.price;
        const sellProceeds = matched * sellPricePerUnit;
        const sellFee = matched * sellFeePerUnit;
        const realizedPnl = sellProceeds - buyCost - sellFee;
        const holdingDays = Math.max(
          0,
          Math.floor(
            (new Date(tx.transaction_date).getTime() - new Date(fallbackBasis.date).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        );
        closed.push({
          symbol: '',
          assetType: '',
          buyDate: fallbackBasis.date,
          sellDate: tx.transaction_date,
          quantity: matched,
          buyPrice: fallbackBasis.price,
          sellPrice: sellPricePerUnit,
          buyCost,
          sellProceeds,
          buyFee: 0,
          sellFee,
          realizedPnl,
          realizedPnlPct: buyCost > 0 ? (realizedPnl / buyCost) * 100 : 0,
          holdingDays,
          isLongTerm: holdingDays >= LONG_TERM_DAYS,
          approxBasis: true,
        });
        remainingToSell = 0;
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

  const fxRates = getFxRatesFromHoldings(holdings);
  const symbols: SymbolPnLSummary[] = [];
  const today = new Date();
  const yearStart = new Date(today.getFullYear(), 0, 1).toISOString();

  for (const h of holdings) {
    const txs = txByHolding.get(h.id) || [];
    if (txs.length === 0) continue;

    const { closed, open } = fifoMatch(txs, {
      price: h.purchase_price || 0,
      date: h.created_at,
    });
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

    const currency = (h.currency || 'TRY').toUpperCase();
    const toTRY = (v: number) => fxToTRY(v, currency, fxRates);

    symbols.push({
      symbol: h.symbol,
      assetType: h.asset_type,
      currency,
      closedLots: closed.sort((a, b) => new Date(b.sellDate).getTime() - new Date(a.sellDate).getTime()),
      openLots,
      totalRealizedPnl,
      totalUnrealizedPnl,
      totalRealizedPnlTRY: toTRY(totalRealizedPnl),
      totalUnrealizedPnlTRY: toTRY(totalUnrealizedPnl),
      remainingQuantity,
      averageCostBasis,
    });
  }

  // Aggregate in TRY. ytd* sums need each lot converted by its symbol's FX rate,
  // so map lots back to their owning symbol's currency.
  const ytdRealizedTRY = (filter: (l: ClosedLot) => boolean): number =>
    symbols.reduce((s, sym) => {
      const rate = fxToTRY(1, sym.currency, fxRates);
      const ytd = sym.closedLots
        .filter(l => l.sellDate >= yearStart && filter(l))
        .reduce((acc, l) => acc + l.realizedPnl, 0);
      return s + ytd * rate;
    }, 0);

  const closedLotsCount = symbols.reduce((s, sym) => s + sym.closedLots.length, 0);

  return {
    symbols: symbols.sort((a, b) => Math.abs(b.totalRealizedPnlTRY) - Math.abs(a.totalRealizedPnlTRY)),
    totalRealized: symbols.reduce((s, sym) => s + sym.totalRealizedPnlTRY, 0),
    totalUnrealized: symbols.reduce((s, sym) => s + sym.totalUnrealizedPnlTRY, 0),
    yearToDateRealized: ytdRealizedTRY(() => true),
    ytdLongTerm: ytdRealizedTRY(l => l.isLongTerm),
    ytdShortTerm: ytdRealizedTRY(l => !l.isLongTerm),
    closedLotsCount,
  };
}
