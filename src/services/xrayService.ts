import { Holding } from '../lib/supabase';
import { getFxRatesFromHoldings, holdingValueTRY, holdingCostTRY } from '../lib/fx';

export interface XRayFinding {
  id: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  category: 'concentration' | 'dead-money' | 'currency' | 'sector' | 'staleness'
    | 'drift' | 'geographic' | 'tax-loss' | 'winner-ride' | 'diversification' | 'currency-mix';
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

export interface AllocationDrift {
  asset_type: string;
  currentPct: number;
  targetPct: number;
  drift: number; // current - target
  value: number;
}

export interface GeographicExposure {
  region: string;
  value: number;
  pct: number;
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

  // YENİ — profesyonel metrikler
  hhi: number;                   // Herfindahl-Hirschman concentration index (0-10000)
  diversificationScore: number;  // 0-100 (HHI'den türetilmiş)
  assetClassCount: number;       // kaç farklı asset class
  allocationDrift: AllocationDrift[];
  geographicExposure: GeographicExposure[];
  taxLossOpportunities: { symbol: string; value: number; pnl: number; pnlPct: number }[];
  bigWinners: { symbol: string; value: number; pnlPct: number; weight: number }[];
  currencyMix: { currency: string; value: number; pct: number }[];
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

// Hedef allokasyon — Bogleheads/dengeli portföy mantığı.
// Bu rakamlar kullanıcı profiline göre değişebilir; default "dengeli büyüme".
const DEFAULT_TARGETS: Record<string, number> = {
  stock: 25,
  fund: 15,
  crypto: 10,
  currency: 20,
  commodity: 10,
  eurobond: 15,
  cash: 5,
};

// Sembol → coğrafi bölge (Global = ABD/Avrupa yabancı hisseler, TR = BIST/TL)
const GLOBAL_SYMBOLS = new Set([
  'JNJ', 'KO', 'PG', 'SCHD', 'NESN', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
  'NVDA', 'META', 'V', 'MA', 'WMT', 'XOM',
  'ASML', 'ADYEN', 'PROSUS', 'LVMH', 'TTE', 'SAP', 'BMW', 'SIE',
  'V3YL', 'VWCE', 'VUSA', 'EUNL', 'IWDA',
  'IB01', 'IBTL', 'TLT', 'SGOV', 'BND', 'IUSB', 'JNK', 'HYG',
]);

function regionOf(h: Holding): string {
  const sym = (h.symbol || '').toUpperCase();
  if (h.asset_type === 'crypto') return 'Global (Kripto)';
  if (GLOBAL_SYMBOLS.has(sym)) {
    if ((h.currency || '').toUpperCase() === 'USD') return 'Global (USD)';
    if ((h.currency || '').toUpperCase() === 'EUR') return 'Avrupa (EUR)';
    return 'Global';
  }
  if (h.asset_type === 'commodity') return 'Global (Emtia)';
  if (h.asset_type === 'currency') {
    const c = (h.symbol || '').toUpperCase();
    if (c === 'USD' || c === 'USDC') return 'Global (USD)';
    if (c === 'EURO' || c === 'EUR') return 'Avrupa (EUR)';
    return 'Diğer Para';
  }
  if (h.asset_type === 'fund' && sym === 'EUROFON') return 'Avrupa (EUR)';
  return 'Türkiye (TRY)';
}

function isCurrencyHolding(h: Holding): boolean {
  if (h.asset_type === 'currency') return true;
  if (h.asset_type === 'fund' && FUND_CURRENCY_PROXY[h.symbol.toUpperCase()]) return true;
  if (h.asset_type === 'eurobond') return true;
  return false;
}

export function analyzeXRay(holdings: Holding[]): XRayReport {
  const findings: XRayFinding[] = [];
  const fxRates = getFxRatesFromHoldings(holdings);

  const positions = holdings
    .filter(h => h.quantity > 0 && h.asset_type !== 'cash')
    .map(h => ({
      ...h,
      value: holdingValueTRY(h, fxRates),
      cost: holdingCostTRY(h, fxRates),
    }));

  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  if (totalValue === 0) {
    return {
      findings: [], totalValue: 0, effectiveCurrencyExposure: 0, effectiveCurrencyPct: 0,
      topConcentration: null, deadMoneyCount: 0, deadMoneyTotal: 0,
      sectorBreakdown: [], missingSectors: [], healthScore: 0,
      hhi: 0, diversificationScore: 0, assetClassCount: 0,
      allocationDrift: [], geographicExposure: [], taxLossOpportunities: [],
      bigWinners: [], currencyMix: [],
    };
  }

  // ── 1. Konsantrasyon (mevcut) ──────────────────────────────
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

  // ── 2. Herfindahl-Hirschman Index (HHI) ──────────────────────
  // Σ (weight%)² — 10000 tek varlık, <1500 iyi çeşitlenmiş, >2500 yüksek konsantrasyon
  const hhi = concentrations.reduce((s, c) => s + c.weight * c.weight, 0);
  const diversificationScore = Math.max(0, Math.min(100, Math.round(100 - (hhi / 100))));

  if (hhi > 2500) {
    findings.push({
      id: 'hhi-high',
      severity: hhi > 3500 ? 'high' : 'medium',
      category: 'diversification',
      title: `HHI=${hhi.toFixed(0)} — yüksek konsantrasyon`,
      detail: `Herfindahl indexi >2500 ${hhi > 3500 ? 'çok yüksek' : 'yüksek'}. Çeşitlendirme skoru: ${diversificationScore}/100. Top 3 pozisyon: ${concentrations.slice(0, 3).map(c => `${c.symbol} (%${c.weight.toFixed(0)})`).join(', ')}.`,
    });
  }

  // ── 3. Asset Class Sayısı ────────────────────────────────────
  const assetClasses = new Set(positions.map(p => p.asset_type));
  const assetClassCount = assetClasses.size;

  if (assetClassCount < 3) {
    findings.push({
      id: 'low-asset-variety',
      severity: 'medium',
      category: 'diversification',
      title: `Sadece ${assetClassCount} farklı varlık sınıfı`,
      detail: `Sistematik risk yüksek. En az 4-5 sınıf (hisse + fon + kripto + döviz + emtia + tahvil) öneriliyor.`,
    });
  }

  // ── 4. Ölü Sermaye (mevcut) ──────────────────────────────────
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
      title: `${deadMoney.length} pozisyonda %${(deadMoneyTotal / totalValue * 100).toFixed(1)} ölü sermaye`,
      detail: `${deadMoney.slice(0, 3).map(p => p.symbol).join(', ')}${deadMoney.length > 3 ? '...' : ''} — son aylarda ±%2 içinde, çalışmıyor.`,
      amount: deadMoneyTotal,
      symbols: deadMoney.map(p => p.symbol),
    });
  }

  // ── 5. Döviz Maruziyeti (mevcut) ─────────────────────────────
  const currencyHoldings = positions.filter(isCurrencyHolding);
  const effectiveCurrencyExposure = currencyHoldings.reduce((s, p) => s + p.value, 0);
  const effectiveCurrencyPct = (effectiveCurrencyExposure / totalValue) * 100;

  if (effectiveCurrencyPct > 35) {
    const components = currencyHoldings
      .sort((a, b) => b.value - a.value).slice(0, 4).map(p => p.symbol).join(', ');
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

  // ── 6. Currency Mix — döviz içinde tek currency dominantsa ────
  // Kullanıcı 'currency' tipi holding'leri (USD/EURO) TRY currency-field ile saklıyor
  // (TL fiyat olarak). Bu yüzden symbol'a bakmak gerek, currency field'a değil.
  const detectCcy = (p: typeof positions[number]): string => {
    const sym = (p.symbol || '').toUpperCase();
    if (p.asset_type === 'currency') {
      // currency tipi: symbol = currency kodu
      if (sym === 'USD' || sym === 'USDC') return 'USD';
      if (sym === 'EURO' || sym === 'EUR') return 'EUR';
      if (sym === 'GBP') return 'GBP';
      if (sym === 'CHF') return 'CHF';
      if (sym === 'RON') return 'RON';
      if (sym === 'RUB') return 'RUB';
      return sym;
    }
    // eurobond/fund/stock için holding.currency field'ı doğru kaynak
    const cur = (p.currency || '').toUpperCase();
    if (cur === 'USD' || cur === 'EUR' || cur === 'GBP') return cur;
    // EUROFON gibi proxy
    if (p.asset_type === 'fund' && FUND_CURRENCY_PROXY[sym]) return FUND_CURRENCY_PROXY[sym];
    return 'EUR'; // default eurobond/intl
  };
  const currencyByCcy: Record<string, number> = {};
  for (const p of currencyHoldings) {
    const key = detectCcy(p);
    currencyByCcy[key] = (currencyByCcy[key] || 0) + p.value;
  }
  const currencyMix = Object.entries(currencyByCcy)
    .map(([currency, value]) => ({ currency, value, pct: (value / totalValue) * 100 }))
    .sort((a, b) => b.value - a.value);

  if (currencyMix.length > 0 && currencyMix[0].pct > 30 && effectiveCurrencyPct > 35) {
    findings.push({
      id: 'currency-mix',
      severity: currencyMix[0].pct > 45 ? 'medium' : 'low',
      category: 'currency-mix',
      title: `${currencyMix[0].currency} dövizin %${(currencyMix[0].value / effectiveCurrencyExposure * 100).toFixed(0)}'i`,
      detail: `Döviz içinde tek currency'e bağlısın. USD + EUR dengesi öneriliyor (50/50).`,
    });
  }

  // ── 7. Coğrafi Maruziyet ─────────────────────────────────────
  const regionMap: Record<string, number> = {};
  for (const p of positions) {
    const r = regionOf(p);
    regionMap[r] = (regionMap[r] || 0) + p.value;
  }
  const geographicExposure = Object.entries(regionMap)
    .map(([region, value]) => ({ region, value, pct: (value / totalValue) * 100 }))
    .sort((a, b) => b.value - a.value);

  const trPct = geographicExposure.filter(r => r.region.startsWith('Türkiye')).reduce((s, r) => s + r.pct, 0);
  if (trPct > 70) {
    findings.push({
      id: 'tr-concentration',
      severity: trPct > 85 ? 'medium' : 'low',
      category: 'geographic',
      title: `Türkiye maruziyeti %${trPct.toFixed(0)}`,
      detail: `Tek ülke riski. Global ETF/fon ile dengele (örn. V3YL, VWCE).`,
    });
  }

  // ── 8. Sektör Eksikliği (mevcut) ─────────────────────────────
  const stocks = positions.filter(p => p.asset_type === 'stock');
  const stockTotal = stocks.reduce((s, p) => s + p.value, 0);
  const sectorMap: Record<string, SectorBreakdown> = {};
  for (const s of stocks) {
    const sector = BIST_SECTORS[s.symbol.toUpperCase()] || 'Diğer';
    if (!sectorMap[sector]) sectorMap[sector] = { sector, value: 0, weight: 0, count: 0, symbols: [] };
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

  // ── 9. Asset Class Hedef Sapması (Drift) ─────────────────────
  const valueByClass: Record<string, number> = {};
  for (const p of positions) {
    valueByClass[p.asset_type] = (valueByClass[p.asset_type] || 0) + p.value;
  }
  const allocationDrift: AllocationDrift[] = Object.keys(DEFAULT_TARGETS).map(at => {
    const value = valueByClass[at] || 0;
    const currentPct = (value / totalValue) * 100;
    const targetPct = DEFAULT_TARGETS[at];
    return { asset_type: at, value, currentPct, targetPct, drift: currentPct - targetPct };
  }).filter(d => d.currentPct > 0.5 || d.targetPct > 0);

  const bigDrifts = allocationDrift.filter(d => Math.abs(d.drift) > 10);
  if (bigDrifts.length > 0) {
    const top = bigDrifts.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))[0];
    findings.push({
      id: 'allocation-drift',
      severity: Math.abs(top.drift) > 20 ? 'medium' : 'low',
      category: 'drift',
      title: `${bigDrifts.length} varlık sınıfı hedeften sapmış`,
      detail: `En büyük sapma: ${top.asset_type} %${top.currentPct.toFixed(0)} (hedef %${top.targetPct}, sapma ${top.drift > 0 ? '+' : ''}${top.drift.toFixed(0)} puan). Rebalance düşün.`,
    });
  }

  // ── 10. Vergi-Avantajlı Satış Fırsatı (Tax Loss Harvest) ─────
  const taxLossOpportunities = positions
    .filter(p => p.cost > 0)
    .map(p => {
      const pnl = p.value - p.cost;
      const pnlPct = (pnl / p.cost) * 100;
      return { symbol: p.symbol, value: p.value, pnl, pnlPct };
    })
    .filter(p => p.pnlPct < -10 && p.value > 5000)
    .sort((a, b) => a.pnlPct - b.pnlPct);

  if (taxLossOpportunities.length > 0) {
    const totalLoss = taxLossOpportunities.reduce((s, p) => s + p.pnl, 0);
    findings.push({
      id: 'tax-loss-harvest',
      severity: 'info',
      category: 'tax-loss',
      title: `${taxLossOpportunities.length} pozisyonda kayıp realizasyon fırsatı`,
      detail: `${taxLossOpportunities.slice(0, 3).map(p => `${p.symbol} (%${p.pnlPct.toFixed(0)})`).join(', ')} — toplam ${Math.abs(totalLoss).toFixed(0)} ₺ realize edilmemiş zarar. Kâr realize edilen pozisyonlarla netleştirilebilir.`,
      amount: Math.abs(totalLoss),
      symbols: taxLossOpportunities.map(p => p.symbol),
    });
  }

  // ── 11. Winner-ride: Büyük kârda büyük pozisyonlar ───────────
  const bigWinners = positions
    .filter(p => p.cost > 0)
    .map(p => {
      const pnl = p.value - p.cost;
      const pnlPct = (pnl / p.cost) * 100;
      const weight = (p.value / totalValue) * 100;
      return { symbol: p.symbol, value: p.value, pnlPct, weight };
    })
    .filter(p => p.pnlPct > 50 && p.weight > 5)
    .sort((a, b) => b.pnlPct - a.pnlPct);

  if (bigWinners.length > 0) {
    findings.push({
      id: 'winners-ride',
      severity: 'info',
      category: 'winner-ride',
      title: `${bigWinners.length} pozisyon %50+ kârda, kâr alınmadı`,
      detail: `${bigWinners.slice(0, 3).map(p => `${p.symbol} (+%${p.pnlPct.toFixed(0)}, ağırlık %${p.weight.toFixed(0)})`).join(', ')} — kâr realizasyonu / trim düşünülebilir.`,
      symbols: bigWinners.map(p => p.symbol),
    });
  }

  // ── 12. Stale Prices (mevcut) ────────────────────────────────
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

  // ── Health Score ─────────────────────────────────────────────
  let healthScore = 100;
  if (topConcentration && topConcentration.weight > 35) healthScore -= 25;
  else if (topConcentration && topConcentration.weight > 25) healthScore -= 10;
  healthScore -= Math.min(20, (deadMoneyTotal / totalValue) * 200);
  if (effectiveCurrencyPct > 50) healthScore -= 15;
  else if (effectiveCurrencyPct > 35) healthScore -= 8;
  healthScore -= Math.min(15, missingSectors.length * 3);
  if (hhi > 3500) healthScore -= 15;
  else if (hhi > 2500) healthScore -= 8;
  if (assetClassCount < 3) healthScore -= 8;
  if (trPct > 85) healthScore -= 8;
  else if (trPct > 70) healthScore -= 4;
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
    hhi: Math.round(hhi),
    diversificationScore,
    assetClassCount,
    allocationDrift,
    geographicExposure,
    taxLossOpportunities,
    bigWinners,
    currencyMix,
  };
}
