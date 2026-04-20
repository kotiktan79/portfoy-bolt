import { Holding } from '../lib/supabase';

export interface XRayFinding {
  id: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  category: 'concentration' | 'dead-money' | 'currency' | 'sector' | 'staleness';
  title: string;
  detail: string;
  amount?: number;
  symbols?: string[];
}

export interface SectorBreakdown {
  sector: string;
  value: number;
  weight: number;
  count: number;
  symbols: string[];
}

export interface XRayReport {
  findings: XRayFinding[];
  totalValue: number;
  effectiveCurrencyExposure: number;
  effectiveCurrencyPct: number;
  topConcentration: { symbol: string; weight: number; value: number } | null;
  deadMoneyCount: number;
  deadMoneyTotal: number;
  sectorBreakdown: SectorBreakdown[];
  missingSectors: string[];
  healthScore: number;
}

const BIST_SECTORS: Record<string, string> = {
  GARAN: 'Bankacılık', AKBNK: 'Bankacılık', ISCTR: 'Bankacılık', YKBNK: 'Bankacılık',
  HALKB: 'Bankacılık', VAKBN: 'Bankacılık',
  KCHOL: 'Holding', SAHOL: 'Holding', DOHOL: 'Holding',
  BIMAS: 'Perakende', MGROS: 'Perakende', CCOLA: 'Perakende',
  TUPRS: 'Enerji', PETKM: 'Enerji', AKSEN: 'Enerji',
  ASELS: 'Savunma',
  THYAO: 'Havacılık', PGSUS: 'Havacılık', TAVHL: 'Havacılık',
  ENKAI: 'İnşaat', EKGYO: 'İnşaat',
  TCELL: 'Telekom', TTKOM: 'Telekom',
  EREGL: 'Metal', KRDMD: 'Metal',
  SISE: 'Cam',
  TOASO: 'Otomotiv', FROTO: 'Otomotiv',
  ARCLK: 'Beyaz Eşya', VESTL: 'Beyaz Eşya',
  KOZAL: 'Madencilik', KOZAA: 'Madencilik',
  HEKTS: 'Tarım', GUBRF: 'Tarım',
  SASA: 'Kimya',
};

const KEY_SECTORS = ['Bankacılık', 'Holding', 'Perakende', 'Enerji', 'Savunma', 'Telekom'];

const FUND_CURRENCY_PROXY: Record<string, string> = {
  EUROFON: 'EUR',
};

function isCurrencyHolding(h: Holding): boolean {
  if (h.asset_type === 'currency') return true;
  if (h.asset_type === 'fund' && FUND_CURRENCY_PROXY[h.symbol.toUpperCase()]) return true;
  if (h.asset_type === 'eurobond') return true;
  return false;
}

export function analyzeXRay(holdings: Holding[]): XRayReport {
  const findings: XRayFinding[] = [];

  const positions = holdings
    .filter(h => h.quantity > 0)
    .map(h => ({
      ...h,
      value: (h.current_price || 0) * (h.quantity || 0),
      cost: (h.purchase_price || 0) * (h.quantity || 0),
    }));

  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  if (totalValue === 0) {
    return {
      findings: [],
      totalValue: 0,
      effectiveCurrencyExposure: 0,
      effectiveCurrencyPct: 0,
      topConcentration: null,
      deadMoneyCount: 0,
      deadMoneyTotal: 0,
      sectorBreakdown: [],
      missingSectors: [],
      healthScore: 0,
    };
  }

  const concentrations = positions
    .map(p => ({ symbol: p.symbol, value: p.value, weight: (p.value / totalValue) * 100 }))
    .sort((a, b) => b.weight - a.weight);

  const topConcentration = concentrations[0] || null;

  if (topConcentration && topConcentration.weight > 25) {
    findings.push({
      id: 'concentration-top',
      severity: topConcentration.weight > 35 ? 'high' : 'medium',
      category: 'concentration',
      title: `${topConcentration.symbol} portföyün %${topConcentration.weight.toFixed(1)}'i`,
      detail: `Tek varlıkta yoğunlaşma riski. Önerilen üst sınır %25.`,
      amount: topConcentration.value,
      symbols: [topConcentration.symbol],
    });
  }

  const deadMoney = positions
    .filter(p => {
      if (p.cost === 0) return false;
      const pnlPct = ((p.value - p.cost) / p.cost) * 100;
      return pnlPct < 2 && pnlPct > -2 && p.value > 5000;
    })
    .sort((a, b) => b.value - a.value);

  const deadMoneyTotal = deadMoney.reduce((s, p) => s + p.value, 0);

  if (deadMoney.length > 0) {
    findings.push({
      id: 'dead-money',
      severity: deadMoneyTotal > totalValue * 0.05 ? 'high' : deadMoneyTotal > 50000 ? 'medium' : 'low',
      category: 'dead-money',
      title: `${deadMoney.length} pozisyonda ${(deadMoneyTotal / totalValue * 100).toFixed(1)}% ölü sermaye`,
      detail: `${deadMoney.slice(0, 3).map(p => p.symbol).join(', ')}${deadMoney.length > 3 ? '...' : ''} — son aylarda ±%2 içinde, çalışmıyor.`,
      amount: deadMoneyTotal,
      symbols: deadMoney.map(p => p.symbol),
    });
  }

  const currencyHoldings = positions.filter(isCurrencyHolding);
  const effectiveCurrencyExposure = currencyHoldings.reduce((s, p) => s + p.value, 0);
  const effectiveCurrencyPct = (effectiveCurrencyExposure / totalValue) * 100;

  if (effectiveCurrencyPct > 35) {
    const components = currencyHoldings
      .sort((a, b) => b.value - a.value)
      .slice(0, 4)
      .map(p => p.symbol)
      .join(', ');
    findings.push({
      id: 'currency-exposure',
      severity: effectiveCurrencyPct > 50 ? 'high' : 'medium',
      category: 'currency',
      title: `Döviz maruziyeti %${effectiveCurrencyPct.toFixed(1)}`,
      detail: `${components} dahil — tipik hedef %15-25. Eurobond ve EUR endeksli fonlar dahil.`,
      amount: effectiveCurrencyExposure,
      symbols: currencyHoldings.map(p => p.symbol),
    });
  }

  const stocks = positions.filter(p => p.asset_type === 'stock');
  const stockTotal = stocks.reduce((s, p) => s + p.value, 0);
  const sectorMap: Record<string, SectorBreakdown> = {};
  for (const s of stocks) {
    const sector = BIST_SECTORS[s.symbol.toUpperCase()] || 'Diğer';
    if (!sectorMap[sector]) {
      sectorMap[sector] = { sector, value: 0, weight: 0, count: 0, symbols: [] };
    }
    sectorMap[sector].value += s.value;
    sectorMap[sector].count++;
    sectorMap[sector].symbols.push(s.symbol);
  }
  for (const sector of Object.values(sectorMap)) {
    sector.weight = stockTotal > 0 ? (sector.value / stockTotal) * 100 : 0;
  }
  const sectorBreakdown = Object.values(sectorMap).sort((a, b) => b.value - a.value);

  const missingSectors = KEY_SECTORS.filter(s => !sectorMap[s] || sectorMap[s].value < stockTotal * 0.03);

  if (missingSectors.length > 0 && stocks.length >= 5) {
    findings.push({
      id: 'missing-sectors',
      severity: missingSectors.length > 3 ? 'medium' : 'low',
      category: 'sector',
      title: `${missingSectors.length} ana sektör eksik veya çok az`,
      detail: `${missingSectors.join(', ')} — BIST temettü/büyüme dengesini aşağı çekiyor.`,
    });
  }

  const stale = positions.filter(p => {
    if (!p.updated_at) return false;
    const days = (Date.now() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    return days > 7;
  });

  if (stale.length > positions.length * 0.3) {
    findings.push({
      id: 'stale-prices',
      severity: 'low',
      category: 'staleness',
      title: `${stale.length} pozisyon fiyatı 7+ gün eski`,
      detail: 'Fiyat güncelleme cron çalışmıyor olabilir. /api/cron/daily-snapshot kontrol et.',
      symbols: stale.map(p => p.symbol),
    });
  }

  let healthScore = 100;
  if (topConcentration && topConcentration.weight > 35) healthScore -= 25;
  else if (topConcentration && topConcentration.weight > 25) healthScore -= 10;
  healthScore -= Math.min(20, (deadMoneyTotal / totalValue) * 200);
  if (effectiveCurrencyPct > 50) healthScore -= 20;
  else if (effectiveCurrencyPct > 35) healthScore -= 10;
  healthScore -= Math.min(15, missingSectors.length * 3);
  healthScore = Math.max(0, Math.round(healthScore));

  return {
    findings: findings.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2, info: 3 };
      return order[a.severity] - order[b.severity];
    }),
    totalValue,
    effectiveCurrencyExposure,
    effectiveCurrencyPct,
    topConcentration,
    deadMoneyCount: deadMoney.length,
    deadMoneyTotal,
    sectorBreakdown,
    missingSectors,
    healthScore,
  };
}
