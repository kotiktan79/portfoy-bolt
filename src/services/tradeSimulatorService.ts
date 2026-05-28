import { Holding, AssetType } from '../lib/supabase';
import { getFxRatesFromHoldings, holdingValueTRY } from '../lib/fx';

export interface ProposedTrade {
  id: string;
  action: 'sell' | 'buy';
  symbol: string;
  assetType: AssetType;
  amountTry: number;
  notes?: string;
}

export interface SimulationResult {
  beforeHoldings: Holding[];
  afterHoldings: Holding[];
  netCashFlow: number;
  warnings: string[];
}

export function applyTrades(holdings: Holding[], trades: ProposedTrade[]): SimulationResult {
  const warnings: string[] = [];
  const cloned: Holding[] = holdings.map(h => ({ ...h }));
  const fxRates = getFxRatesFromHoldings(holdings);
  // Holding'in birim fiyatının TRY karşılığı (USD/EUR pozisyonlar için FX'li)
  const unitPriceTRY = (h: Holding) => (h.quantity > 0 ? holdingValueTRY(h, fxRates) / h.quantity : 0);

  let netCashFlow = 0;

  for (const trade of trades) {
    if (trade.amountTry <= 0) continue;

    if (trade.action === 'sell') {
      netCashFlow += trade.amountTry;

      const target = cloned.find(
        h => h.symbol.toUpperCase() === trade.symbol.toUpperCase()
      );

      if (!target) {
        warnings.push(`${trade.symbol}: portföyde yok, satış simüle edilemedi`);
        continue;
      }

      const currentValue = holdingValueTRY(target, fxRates);
      const unitTRY = unitPriceTRY(target) || 1;
      if (trade.amountTry >= currentValue) {
        target.quantity = 0;
        if (trade.amountTry > currentValue + 0.01) {
          warnings.push(
            `${trade.symbol}: satış (₺${Math.round(trade.amountTry)}) mevcut değerden (₺${Math.round(currentValue)}) büyük — tüm pozisyon kapatıldı`
          );
        }
      } else {
        const sellQty = trade.amountTry / unitTRY;
        target.quantity = Math.max(0, target.quantity - sellQty);
      }
    } else {
      netCashFlow -= trade.amountTry;

      const existing = cloned.find(
        h => h.symbol.toUpperCase() === trade.symbol.toUpperCase()
      );

      if (existing) {
        const buyQty = trade.amountTry / (unitPriceTRY(existing) || 1);
        existing.quantity = (existing.quantity || 0) + buyQty;
      } else {
        const synthetic: Holding = {
          id: `sim-${trade.id}`,
          symbol: trade.symbol.toUpperCase(),
          asset_type: trade.assetType,
          purchase_price: 1,
          quantity: trade.amountTry,
          current_price: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        cloned.push(synthetic);
        warnings.push(
          `${trade.symbol}: yeni pozisyon, fiyat verisi yok — ₺${Math.round(trade.amountTry)} olarak eklendi`
        );
      }
    }
  }

  return {
    beforeHoldings: holdings,
    afterHoldings: cloned.filter(h => h.quantity > 0),
    netCashFlow,
    warnings,
  };
}
