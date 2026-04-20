/**
 * Smart Investment Engine - Tandor Finans
 *
 * Profesyonel seviyede portföy analizi ve yatırım kararları.
 * Teknik analiz + risk yönetimi + portföy optimizasyonu.
 */

import { Holding } from '../lib/supabase';
import { formatCurrency } from './priceService';

// ── Types ────────────────────────────────────────────────────

export interface HoldingAnalysis {
  symbol: string;
  assetType: string;
  currentPrice: number;
  purchasePrice: number;
  quantity: number;
  value: number;
  invested: number;
  pnl: number;
  pnlPct: number;
  weight: number;
  action: 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'sell';
  actionReason: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  targetPrice: number;
  stopLoss: number;
}

export interface PortfolioReport {
  // Summary
  totalValue: number;
  totalInvested: number;
  totalPnl: number;
  totalPnlPct: number;
  cashBalance: number;
  grandTotal: number;

  // Health
  healthScore: number;
  healthGrade: string;
  healthFactors: {
    diversification: number;
    concentration: number;
    profitability: number;
    riskManagement: number;
    cashCushion: number;
  };

  // Holdings analysis
  holdings: HoldingAnalysis[];

  // Actions
  urgentActions: ActionRecommendation[];
  opportunities: ActionRecommendation[];

  // Allocation
  currentAllocation: AllocationItem[];
  idealAllocation: AllocationItem[];
  rebalanceActions: RebalanceAction[];

  // Withdrawal
  withdrawal: WithdrawalAnalysis;

  // New money
  newMoneyPlan: (amount: number) => NewMoneyAllocation[];
}

export interface ActionRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  type: 'sell' | 'buy' | 'reduce' | 'add' | 'rebalance' | 'protect' | 'hold';
  symbol?: string;
  title: string;
  detail: string;
  amount?: number;
  impact: string;
}

export interface AllocationItem {
  type: string;
  typeName: string;
  weight: number;
  value: number;
  count: number;
}

export interface RebalanceAction {
  symbol: string;
  action: 'buy' | 'sell';
  amount: number;
  reason: string;
}

export interface WithdrawalAnalysis {
  safeMonthly: number;     // %2 yıllık - portföyü tüketmez
  moderateMonthly: number; // %4 yıllık - 25 yıl dayanır
  aggressiveMonthly: number; // %6 yıllık - 16 yıl
  fromProfitsOnly: number; // sadece kârdan
  maxSafe: number;         // nakitten çekilebilir
  recommendation: string;
}

export interface NewMoneyAllocation {
  symbol: string;
  type: string;
  amount: number;
  reason: string;
}

// ── Constants ────────────────────────────────────────────────

const TYPE_NAMES: Record<string, string> = {
  stock: 'Hisse', crypto: 'Kripto', currency: 'Döviz',
  fund: 'Fon', eurobond: 'Eurobond', commodity: 'Emtia', cash: 'Nakit',
};

// İdeal portföy dağılımı (uzun vadeli büyüme + gelir)
// %60 büyüme (hisse + kripto) + %40 gelir/koruma (temettü + altın + döviz + tahvil)
const IDEAL_ALLOCATION: Record<string, { min: number; max: number; target: number }> = {
  stock:     { min: 30, max: 55, target: 45 },  // büyüme + temettü hisseleri
  commodity: { min: 10, max: 25, target: 15 },  // altın - enflasyon koruması
  crypto:    { min: 5,  max: 15, target: 10 },  // BTC/ETH uzun vadeli
  currency:  { min: 5,  max: 15, target: 10 },  // kur koruması
  fund:      { min: 0,  max: 15, target: 10 },  // fon/tahvil - sabit gelir
  eurobond:  { min: 0,  max: 15, target: 10 },  // eurobond - döviz gelir
};

// BIST hisseler - büyüme + temettü
const BIST_PICKS = [
  { symbol: 'THYAO', name: 'Türk Hava Yolları', sector: 'Havacılık', type: 'growth' as const },
  { symbol: 'ASELS', name: 'Aselsan', sector: 'Savunma', type: 'growth' as const },
  { symbol: 'BIMAS', name: 'BİM', sector: 'Perakende', type: 'growth' as const },
  { symbol: 'TUPRS', name: 'Tüpraş', sector: 'Enerji', type: 'dividend' as const },
  { symbol: 'KCHOL', name: 'Koç Holding', sector: 'Holding', type: 'growth' as const },
  { symbol: 'GARAN', name: 'Garanti BBVA', sector: 'Banka', type: 'dividend' as const },
  { symbol: 'AKBNK', name: 'Akbank', sector: 'Banka', type: 'dividend' as const },
  { symbol: 'ENKAI', name: 'Enka İnşaat', sector: 'İnşaat', type: 'dividend' as const },
  { symbol: 'TCELL', name: 'Turkcell', sector: 'Telekomünikasyon', type: 'dividend' as const },
  { symbol: 'TOASO', name: 'Tofaş', sector: 'Otomotiv', type: 'growth' as const },
  { symbol: 'SAHOL', name: 'Sabancı Holding', sector: 'Holding', type: 'growth' as const },
  { symbol: 'SISE', name: 'Şişecam', sector: 'Cam', type: 'growth' as const },
  { symbol: 'EREGL', name: 'Ereğli Demir Çelik', sector: 'Metal', type: 'dividend' as const },
  { symbol: 'PGSUS', name: 'Pegasus', sector: 'Havacılık', type: 'growth' as const },
  { symbol: 'KOZAL', name: 'Koza Altın', sector: 'Madencilik', type: 'growth' as const },
];


const CRYPTO_PICKS = [
  { symbol: 'BTC', name: 'Bitcoin', tier: 1 },
  { symbol: 'ETH', name: 'Ethereum', tier: 1 },
  { symbol: 'SOL', name: 'Solana', tier: 2 },
  { symbol: 'BNB', name: 'BNB', tier: 2 },
];

// ── Main Engine ──────────────────────────────────────────────

export function analyzePortfolio(
  holdings: Holding[],
  cashBalance: number = 0
): PortfolioReport {
  const investmentHoldings = holdings.filter(h => h.asset_type !== 'cash');

  const totalValue = investmentHoldings.reduce((s, h) => s + h.current_price * h.quantity, 0);
  const totalInvested = investmentHoldings.reduce((s, h) => s + h.purchase_price * h.quantity, 0);
  const totalPnl = totalValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const grandTotal = totalValue + cashBalance;

  // ── Per-holding analysis ──
  const ownedSymbols = new Set(investmentHoldings.map(h => h.symbol));
  const holdingAnalysis: HoldingAnalysis[] = investmentHoldings.map(h => {
    const value = h.current_price * h.quantity;
    const invested = h.purchase_price * h.quantity;
    const pnl = value - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    const weight = totalValue > 0 ? (value / totalValue) * 100 : 0;

    // Determine action based on multiple factors
    const { action, actionReason, riskLevel, targetPrice, stopLoss } = determineAction(h, pnlPct, weight);

    return {
      symbol: h.symbol, assetType: h.asset_type,
      currentPrice: h.current_price, purchasePrice: h.purchase_price,
      quantity: h.quantity, value, invested, pnl, pnlPct, weight,
      action, actionReason, riskLevel, targetPrice, stopLoss,
    };
  }).sort((a, b) => b.value - a.value);

  // ── Allocation analysis ──
  const typeMap: Record<string, { value: number; count: number }> = {};
  holdingAnalysis.forEach(h => {
    if (!typeMap[h.assetType]) typeMap[h.assetType] = { value: 0, count: 0 };
    typeMap[h.assetType].value += h.value;
    typeMap[h.assetType].count++;
  });

  const currentAllocation: AllocationItem[] = Object.entries(typeMap)
    .map(([type, d]) => ({
      type, typeName: TYPE_NAMES[type] || type,
      weight: totalValue > 0 ? (d.value / totalValue) * 100 : 0,
      value: d.value, count: d.count,
    }))
    .sort((a, b) => b.weight - a.weight);

  const idealAllocation: AllocationItem[] = Object.entries(IDEAL_ALLOCATION)
    .map(([type, a]) => ({
      type, typeName: TYPE_NAMES[type] || type,
      weight: a.target, value: grandTotal * (a.target / 100), count: 0,
    }));

  // ── Rebalance actions ──
  const rebalanceActions = calculateRebalanceActions(holdingAnalysis, currentAllocation, totalValue, ownedSymbols);

  // ── Health score ──
  const healthFactors = calculateHealthFactors(holdingAnalysis, currentAllocation, totalPnlPct, cashBalance, grandTotal);
  const healthScore = Math.round(
    healthFactors.diversification * 0.25 +
    healthFactors.concentration * 0.25 +
    healthFactors.profitability * 0.20 +
    healthFactors.riskManagement * 0.15 +
    healthFactors.cashCushion * 0.15
  );
  const healthGrade = healthScore >= 85 ? 'A+' : healthScore >= 75 ? 'A' : healthScore >= 65 ? 'B+' : healthScore >= 55 ? 'B' : healthScore >= 40 ? 'C' : 'D';

  // ── Actions ──
  const urgentActions = generateUrgentActions(holdingAnalysis, currentAllocation, cashBalance, grandTotal, ownedSymbols);
  const opportunities = generateOpportunities(holdingAnalysis, currentAllocation, cashBalance, grandTotal, ownedSymbols);

  // ── Withdrawal ──
  const withdrawal = calculateWithdrawal(grandTotal, totalPnl, cashBalance, totalPnlPct);

  // ── New money allocation ──
  const newMoneyPlan = (amount: number) => calculateNewMoneyPlan(amount, currentAllocation, totalValue, ownedSymbols);

  return {
    totalValue, totalInvested, totalPnl, totalPnlPct, cashBalance, grandTotal,
    healthScore, healthGrade, healthFactors,
    holdings: holdingAnalysis,
    urgentActions, opportunities,
    currentAllocation, idealAllocation, rebalanceActions,
    withdrawal, newMoneyPlan,
  };
}

// ── Helper Functions ─────────────────────────────────────────

function determineAction(
  holding: Holding, pnlPct: number, weight: number
): { action: HoldingAnalysis['action']; actionReason: string; riskLevel: HoldingAnalysis['riskLevel']; targetPrice: number; stopLoss: number } {

  let action: HoldingAnalysis['action'] = 'hold';
  let actionReason = 'Mevcut pozisyonu koruyun';
  let riskLevel: HoldingAnalysis['riskLevel'] = 'medium';

  const price = holding.current_price;
  let targetPrice = price * 1.15; // Default %15 hedef
  let stopLoss = price * 0.90; // Default %10 stop-loss

  // Ağır zarar → SAT
  if (pnlPct < -25) {
    action = 'sell';
    actionReason = `%${Math.abs(pnlPct).toFixed(0)} zararda. Kayıp büyümeden pozisyonu kapatın.`;
    riskLevel = 'critical';
    stopLoss = price * 0.95;
  }
  // Orta zarar → İZLE/AZALT
  else if (pnlPct < -10) {
    action = 'reduce';
    actionReason = `%${Math.abs(pnlPct).toFixed(0)} zararda. Pozisyonun yarısını kapatıp riski azaltın.`;
    riskLevel = 'high';
    stopLoss = holding.purchase_price * 0.85;
  }
  // Büyük kâr → KÂR AL
  else if (pnlPct > 60) {
    action = 'reduce';
    actionReason = `%+${pnlPct.toFixed(0)} kârda. Kârın %30-50'sini realize edin.`;
    riskLevel = 'medium';
    targetPrice = price * 1.10;
    stopLoss = holding.purchase_price * 1.30; // Kâr koruması
  }
  // İyi kâr → KISMEN SAT
  else if (pnlPct > 30) {
    action = 'hold';
    actionReason = `%+${pnlPct.toFixed(0)} kârda. Trailing stop-loss ile koruyun.`;
    riskLevel = 'low';
    targetPrice = price * 1.20;
    stopLoss = holding.purchase_price * 1.15;
  }
  // Hafif düşüş → ALIM FIRSATI
  else if (pnlPct > -5 && pnlPct < 0) {
    action = 'buy';
    actionReason = 'Hafif düşüş - maliyet düşürme fırsatı.';
    riskLevel = 'medium';
  }
  // Yatay → TUT
  else {
    action = 'hold';
    actionReason = 'Stabil. İzlemeye devam edin.';
    riskLevel = 'low';
  }

  // Ağırlık çok yüksekse her durumda azalt
  if (weight > 35) {
    action = 'reduce';
    actionReason = `Portföyün %${weight.toFixed(0)}'i tek varlıkta. Risk çok yüksek - azaltın.`;
    riskLevel = 'critical';
  }

  return { action, actionReason, riskLevel, targetPrice, stopLoss };
}

function calculateHealthFactors(
  holdings: HoldingAnalysis[],
  allocation: AllocationItem[],
  totalPnlPct: number,
  cashBalance: number,
  grandTotal: number
) {
  // Diversification: 0-100
  const typeCount = allocation.length;
  const diversification = Math.min(100, typeCount * 18 + Math.min(holdings.length * 4, 30));

  // Concentration: 0-100 (lower concentration = higher score)
  const maxWeight = holdings.length > 0 ? Math.max(...holdings.map(h => h.weight)) : 100;
  const concentration = maxWeight > 50 ? 10 : maxWeight > 35 ? 40 : maxWeight > 25 ? 70 : 90;

  // Profitability: 0-100
  const profitability = totalPnlPct > 20 ? 90 : totalPnlPct > 10 ? 75 : totalPnlPct > 0 ? 60 : totalPnlPct > -10 ? 40 : 20;

  // Risk management: 0-100
  const criticalCount = holdings.filter(h => h.riskLevel === 'critical').length;
  const highCount = holdings.filter(h => h.riskLevel === 'high').length;
  const riskManagement = Math.max(0, 100 - criticalCount * 30 - highCount * 15);

  // Cash cushion: 0-100
  const cashPct = grandTotal > 0 ? (cashBalance / grandTotal) * 100 : 0;
  const cashCushion = cashPct >= 5 && cashPct <= 25 ? 90 : cashPct > 25 ? 60 : cashPct > 0 ? 50 : 20;

  return { diversification, concentration, profitability, riskManagement, cashCushion };
}

function generateUrgentActions(
  holdings: HoldingAnalysis[],
  _allocation: AllocationItem[],
  _cashBalance: number,
  _grandTotal: number,
  ownedSymbols: Set<string>
): ActionRecommendation[] {
  const actions: ActionRecommendation[] = [];

  // 1. Satılması gerekenler
  const sellTargets = holdings.filter(h => h.action === 'sell');
  sellTargets.forEach(h => {
    const alt = getAlternativeFor(h.assetType, ownedSymbols);
    actions.push({
      priority: 'critical', type: 'sell', symbol: h.symbol,
      title: `${h.symbol} SAT → ${alt.symbol} AL`,
      detail: `${h.actionReason} Satış tutarı: ${formatCurrency(h.value)} ₺. Yerine ${alt.symbol} (${alt.name}) alın.`,
      amount: h.value,
      impact: `Zarar durdurma + ${alt.symbol}'a geçiş`,
    });
  });

  // 2. Azaltılması gerekenler (yoğunlaşma)
  const reduceTargets = holdings.filter(h => h.weight > 35);
  reduceTargets.forEach(h => {
    const reduceAmount = h.value * ((h.weight - 20) / 100);
    const alts = getMultipleAlternatives(h.assetType, ownedSymbols, 2);
    actions.push({
      priority: 'high', type: 'reduce', symbol: h.symbol,
      title: `${h.symbol} azalt → ${alts.map(a => a.symbol).join(' + ')}`,
      detail: `%${h.weight.toFixed(0)} ağırlık çok yüksek. ${formatCurrency(reduceAmount)} ₺ satıp: ${alts.map(a => `${a.symbol} (${formatCurrency(reduceAmount / alts.length)} ₺)`).join(', ')}`,
      amount: reduceAmount,
      impact: 'Risk dağıtımı iyileşir',
    });
  });

  // 3. Kâr realizasyonu
  const profitTargets = holdings.filter(h => h.pnlPct > 50 && h.action === 'reduce');
  profitTargets.forEach(h => {
    const profitAmount = h.pnl * 0.3;
    actions.push({
      priority: 'medium', type: 'reduce', symbol: h.symbol,
      title: `${h.symbol}'den ${formatCurrency(profitAmount)} ₺ kâr al`,
      detail: `%+${h.pnlPct.toFixed(0)} kârda. Kârın %30'unu realize edin. Stop-loss: ${formatCurrency(h.stopLoss)} ₺`,
      amount: profitAmount,
      impact: `${formatCurrency(profitAmount)} ₺ güvenceye alınır`,
    });
  });

  return actions;
}

function generateOpportunities(
  holdings: HoldingAnalysis[],
  allocation: AllocationItem[],
  cashBalance: number,
  grandTotal: number,
  ownedSymbols: Set<string>
): ActionRecommendation[] {
  const actions: ActionRecommendation[] = [];
  const allocationMap: Record<string, number> = {};
  allocation.forEach(a => { allocationMap[a.type] = a.weight; });

  // 1. Eksik varlık türleri
  for (const [type, ideal] of Object.entries(IDEAL_ALLOCATION)) {
    const current = allocationMap[type] || 0;
    if (current < ideal.min) {
      const deficit = (ideal.target - current) / 100 * grandTotal;
      const picks = type === 'stock'
        ? BIST_PICKS.filter(p => !ownedSymbols.has(p.symbol)).slice(0, 3)
        : type === 'crypto'
        ? CRYPTO_PICKS.filter(p => !ownedSymbols.has(p.symbol)).slice(0, 2)
        : [{ symbol: type === 'commodity' ? 'ALTIN' : type === 'currency' ? 'USD' : type, name: TYPE_NAMES[type] || type }];

      actions.push({
        priority: 'medium', type: 'buy',
        title: `${TYPE_NAMES[type]} eksik → ${picks.map(p => p.symbol).join(', ')} al`,
        detail: `${TYPE_NAMES[type]} ağırlığı %${current.toFixed(0)} (ideal: %${ideal.target}). Alım: ${picks.map(p => `${p.symbol}: ${formatCurrency(deficit / picks.length)} ₺`).join(', ')}`,
        amount: deficit,
        impact: `Çeşitlendirme skoru yükselir`,
      });
    }
  }

  // 2. Maliyet düşürme fırsatları
  const dips = holdings.filter(h => h.pnlPct > -10 && h.pnlPct < -2 && h.action === 'buy');
  dips.forEach(h => {
    const buyAmount = Math.min(cashBalance * 0.15, h.value * 0.2);
    if (buyAmount > 500) {
      const newAvgPrice = ((h.invested + buyAmount) / (h.quantity + buyAmount / h.currentPrice));
      actions.push({
        priority: 'low', type: 'add', symbol: h.symbol,
        title: `${h.symbol} ek alım (maliyet düşür)`,
        detail: `%${Math.abs(h.pnlPct).toFixed(1)} düşüşte. ${formatCurrency(buyAmount)} ₺ ek alımla ortalama maliyet ${formatCurrency(h.purchasePrice)} → ${formatCurrency(newAvgPrice)} ₺'ye düşer.`,
        amount: buyAmount,
        impact: `Maliyet %${(((h.purchasePrice - newAvgPrice) / h.purchasePrice) * 100).toFixed(1)} düşer`,
      });
    }
  });

  // 3. Yüksek nakit uyarısı
  if (cashBalance > grandTotal * 0.25 && cashBalance > 5000) {
    const investAmount = cashBalance * 0.5;
    actions.push({
      priority: 'medium', type: 'buy',
      title: `${formatCurrency(investAmount)} ₺ nakiti yatırıma çevir`,
      detail: `Nakit oranı %${((cashBalance / grandTotal) * 100).toFixed(0)}. Enflasyon nakiti eritiyor. Dengeli dağıtım yapın.`,
      amount: investAmount,
      impact: 'Enflasyona karşı koruma',
    });
  }

  return actions;
}

function calculateRebalanceActions(
  holdings: HoldingAnalysis[],
  allocation: AllocationItem[],
  totalValue: number,
  ownedSymbols: Set<string>
): RebalanceAction[] {
  const actions: RebalanceAction[] = [];
  const allocationMap: Record<string, number> = {};
  allocation.forEach(a => { allocationMap[a.type] = a.weight; });

  for (const [type, ideal] of Object.entries(IDEAL_ALLOCATION)) {
    const current = allocationMap[type] || 0;
    const diff = current - ideal.target;

    if (Math.abs(diff) > 5) {
      const amount = Math.abs(diff / 100 * totalValue);
      if (diff > 0) {
        // Fazla → en kârlıdan sat
        const candidates = holdings.filter(h => h.assetType === type).sort((a, b) => b.pnlPct - a.pnlPct);
        if (candidates.length > 0) {
          actions.push({
            symbol: candidates[0].symbol,
            action: 'sell',
            amount,
            reason: `${TYPE_NAMES[type]} %${current.toFixed(0)} → %${ideal.target} hedef`,
          });
        }
      } else {
        // Eksik → öner
        const pick = type === 'stock'
          ? BIST_PICKS.find(p => !ownedSymbols.has(p.symbol))?.symbol || 'THYAO'
          : type === 'crypto' ? 'BTC'
          : type === 'commodity' ? 'ALTIN'
          : 'USD';
        actions.push({
          symbol: pick,
          action: 'buy',
          amount,
          reason: `${TYPE_NAMES[type]} %${current.toFixed(0)} → %${ideal.target} hedef`,
        });
      }
    }
  }

  return actions;
}

function calculateWithdrawal(
  grandTotal: number, _totalPnl: number, cashBalance: number, annualReturnPct: number
): WithdrawalAnalysis {
  const safeMonthly = grandTotal * 0.02 / 12;
  const moderateMonthly = grandTotal * 0.04 / 12;
  const aggressiveMonthly = grandTotal * 0.06 / 12;
  const fromProfitsOnly = annualReturnPct > 0 ? grandTotal * (annualReturnPct / 100) / 12 : 0;
  const maxSafe = cashBalance * 0.8; // %80'i çekilebilir

  let recommendation: string;
  if (grandTotal < 50000) {
    recommendation = `Portföy henüz küçük. Çekim yerine birikim yapın. Aylık ${formatCurrency(grandTotal * 0.1)} ₺ ek yatırım hedefleyin.`;
  } else if (cashBalance > grandTotal * 0.3) {
    recommendation = `Nakit fazlası var. Önce ${formatCurrency(cashBalance * 0.4)} ₺ nakiti yatırıma çevirin, sonra aylık ${formatCurrency(moderateMonthly)} ₺ çekin.`;
  } else {
    recommendation = `Güvenli çekim: aylık ${formatCurrency(safeMonthly)} ₺. Portföy büyümeye devam eder. Acil durumda max ${formatCurrency(maxSafe)} ₺ nakitten çekin.`;
  }

  return { safeMonthly, moderateMonthly, aggressiveMonthly, fromProfitsOnly, maxSafe, recommendation };
}

function calculateNewMoneyPlan(
  amount: number,
  currentAllocation: AllocationItem[],
  _totalValue: number,
  ownedSymbols: Set<string>
): NewMoneyAllocation[] {
  const plan: NewMoneyAllocation[] = [];
  const currentMap: Record<string, number> = {};
  currentAllocation.forEach(a => { currentMap[a.type] = a.weight; });

  // Her varlık türü için eksiklik hesapla
  const gaps: Array<{ type: string; gap: number; target: number }> = [];
  for (const [type, ideal] of Object.entries(IDEAL_ALLOCATION)) {
    const current = currentMap[type] || 0;
    const gap = ideal.target - current;
    if (gap > 0) gaps.push({ type, gap, target: ideal.target });
  }

  // Gap'e orantılı dağıt
  const totalGap = gaps.reduce((s, g) => s + g.gap, 0);

  if (totalGap <= 0) {
    // Portföy dengeli - eşit dağıt
    const types = ['stock', 'commodity', 'crypto'];
    types.forEach(type => {
      const picks = getPicksForType(type, ownedSymbols, 1);
      if (picks.length > 0) {
        plan.push({
          symbol: picks[0].symbol, type,
          amount: amount / types.length,
          reason: `Dengeli dağılım - ${TYPE_NAMES[type]}`,
        });
      }
    });
  } else {
    gaps.sort((a, b) => b.gap - a.gap);
    for (const { type, gap } of gaps) {
      const alloc = amount * (gap / totalGap);
      if (alloc < 200) continue;

      const picks = getPicksForType(type, ownedSymbols, type === 'stock' ? 2 : 1);
      const perPick = alloc / picks.length;

      picks.forEach(pick => {
        plan.push({
          symbol: pick.symbol, type,
          amount: perPick,
          reason: `${TYPE_NAMES[type]} eksik (%${(currentMap[type] || 0).toFixed(0)} → %${IDEAL_ALLOCATION[type]?.target || 0} hedef)`,
        });
      });
    }
  }

  return plan.sort((a, b) => b.amount - a.amount);
}

// ── Utility ──────────────────────────────────────────────────

function getPicksForType(type: string, ownedSymbols: Set<string>, count: number): Array<{ symbol: string; name: string }> {
  if (type === 'stock') {
    return BIST_PICKS.filter(p => !ownedSymbols.has(p.symbol)).slice(0, count);
  }
  if (type === 'crypto') {
    return CRYPTO_PICKS.filter(p => !ownedSymbols.has(p.symbol)).slice(0, count);
  }
  if (type === 'commodity') return [{ symbol: 'ALTIN', name: 'Altın' }];
  if (type === 'currency') return [{ symbol: 'USD', name: 'Amerikan Doları' }];
  if (type === 'fund') return [{ symbol: 'IPV', name: 'İş Portföy' }];
  if (type === 'eurobond') return [{ symbol: 'US900123CJ75', name: 'Türkiye Eurobond' }];
  return [];
}

function getAlternativeFor(assetType: string, ownedSymbols: Set<string>): { symbol: string; name: string } {
  // Farklı türden alternatif öner
  if (assetType === 'stock' || assetType === 'crypto') {
    return { symbol: 'ALTIN', name: 'Altın (güvenli liman)' };
  }
  const stockPick = BIST_PICKS.find(p => !ownedSymbols.has(p.symbol));
  return stockPick ? { symbol: stockPick.symbol, name: stockPick.name } : { symbol: 'THYAO', name: 'Türk Hava Yolları' };
}

function getMultipleAlternatives(assetType: string, ownedSymbols: Set<string>, count: number): Array<{ symbol: string; name: string }> {
  const alts: Array<{ symbol: string; name: string }> = [];

  if (assetType !== 'commodity') alts.push({ symbol: 'ALTIN', name: 'Altın' });
  if (assetType !== 'stock') {
    const stocks = BIST_PICKS.filter(p => !ownedSymbols.has(p.symbol));
    if (stocks.length > 0) alts.push({ symbol: stocks[0].symbol, name: stocks[0].name });
  }
  if (assetType !== 'crypto') alts.push({ symbol: 'BTC', name: 'Bitcoin' });
  if (assetType !== 'currency') alts.push({ symbol: 'USD', name: 'Dolar' });

  return alts.slice(0, count);
}
