import { Holding } from '../lib/supabase';
import { formatCurrency } from './priceService';
import { computePortfolioMetrics, computeHoldingMetrics } from '../lib/portfolioMetrics';
import { RiskProfile } from './aiAdvisorService';
import { BuySellSignal, PortfolioScore, SmartSuggestion } from './advancedAI';

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  suggestions?: string[];
  data?: {
    type: 'table' | 'metric' | 'action';
    rows?: Array<Record<string, string>>;
    metrics?: Array<{ label: string; value: string; color?: string }>;
    actions?: Array<{ label: string; route?: string }>;
  };
  timestamp: Date;
}

interface PortfolioData {
  holdings: Holding[];
  riskProfile: RiskProfile | null;
  signals: BuySellSignal[];
  score: PortfolioScore | null;
  suggestions: SmartSuggestion[];
}

function getHoldingStats(holdings: Holding[]) {
  const portfolio = computePortfolioMetrics(holdings);
  const perHolding = computeHoldingMetrics(holdings);
  const totalValue = portfolio.totalValueTRY;
  const totalInvestment = portfolio.totalCostTRY;
  const totalPnl = portfolio.totalPnLTRY;
  const totalPnlPct = portfolio.totalPnLPct;

  const byType: Record<string, { count: number; value: number; pnl: number }> = {};
  const detailed = perHolding.map(m => {
    const h = m.holding;
    if (!byType[h.asset_type]) byType[h.asset_type] = { count: 0, value: 0, pnl: 0 };
    byType[h.asset_type].count++;
    byType[h.asset_type].value += m.valueTRY;
    byType[h.asset_type].pnl += m.pnlTRY;

    return { ...h, value: m.valueTRY, invested: m.costTRY, pnl: m.pnlTRY, pnlPct: m.pnlPct, weight: m.weight };
  });

  const sorted = [...detailed].sort((a, b) => b.value - a.value);
  const winners = detailed.filter(h => h.pnlPct > 0).sort((a, b) => b.pnlPct - a.pnlPct);
  const losers = detailed.filter(h => h.pnlPct < 0).sort((a, b) => a.pnlPct - b.pnlPct);

  return { totalValue, totalInvestment, totalPnl, totalPnlPct, byType, detailed, sorted, winners, losers };
}

const TYPE_NAMES: Record<string, string> = {
  stock: 'Hisse', crypto: 'Kripto', currency: 'Döviz',
  fund: 'Fon', eurobond: 'Eurobond', commodity: 'Emtia', cash: 'Nakit',
};

export function generateSmartResponse(question: string, data: PortfolioData): ChatMessage {
  const q = question.toLowerCase().trim();
  const stats = getHoldingStats(data.holdings);
  const { totalValue, totalInvestment, totalPnl, totalPnlPct, byType, sorted, winners, losers, detailed } = stats;

  // ── Ne yapmalıyım? / Strateji önerisi ────────────────────────
  if (q.includes('ne yapmalı') || q.includes('öneri') || q.includes('strateji') || q.includes('tavsiye')) {
    const actions: string[] = [];
    const actionButtons: Array<{ label: string; route?: string }> = [];

    // Concentration check
    if (sorted.length > 0) {
      const topWeight = sorted[0].weight;
      if (topWeight > 35) {
        actions.push(`⚠️ **${sorted[0].symbol}** portföyünüzün %${topWeight.toFixed(0)}'ini oluşturuyor. Bu yoğunlaşmayı azaltmalısınız.`);
        actionButtons.push({ label: 'Rebalance Yap', route: '/rebalancing' });
      }
    }

    // Big losers
    const bigLosers = losers.filter(l => l.pnlPct < -15);
    if (bigLosers.length > 0) {
      actions.push(`🔴 ${bigLosers.map(l => `**${l.symbol}** (%${l.pnlPct.toFixed(1)})`).join(', ')} ciddi zararda. Stop-loss veya pozisyon kapatma değerlendirin.`);
    }

    // Big winners - take profit
    const bigWinners = winners.filter(w => w.pnlPct > 40);
    if (bigWinners.length > 0) {
      actions.push(`🟢 ${bigWinners.map(w => `**${w.symbol}** (%+${w.pnlPct.toFixed(1)})`).join(', ')} yüksek kârda. Kâr realizasyonu düşünün.`);
    }

    // Diversification
    const typeCount = Object.keys(byType).filter(t => t !== 'cash').length;
    if (typeCount < 3) {
      actions.push(`📊 Sadece ${typeCount} farklı varlık türünüz var. Çeşitlendirme yaparak riski dağıtın.`);
      actionButtons.push({ label: 'Dağılım Analizi', route: '/allocation' });
    }

    // Strong signals
    const strongBuys = data.signals.filter(s => s.signal === 'strong_buy');
    const strongSells = data.signals.filter(s => s.signal === 'strong_sell');
    if (strongBuys.length > 0) {
      actions.push(`📈 **${strongBuys.map(s => s.symbol).join(', ')}** için güçlü alım sinyali var.`);
    }
    if (strongSells.length > 0) {
      actions.push(`📉 **${strongSells.map(s => s.symbol).join(', ')}** için güçlü satış sinyali var.`);
    }

    // Risk
    if (data.riskProfile && data.riskProfile.score > 70) {
      actions.push(`🛡️ Risk skorunuz ${data.riskProfile.score.toFixed(0)}/100 - oldukça yüksek. Daha güvenli varlıklar ekleyerek dengeleyebilirsiniz.`);
    }

    if (actions.length === 0) {
      actions.push('✅ Portföyünüz şu an dengeli görünüyor. Mevcut pozisyonlarınızı koruyun ve piyasayı izlemeye devam edin.');
    }

    actionButtons.push({ label: 'AI Danışman', route: '/ai-advisor' });

    return {
      role: 'ai',
      content: `**Portföy Stratejik Değerlendirme:**\n\n${actions.join('\n\n')}`,
      suggestions: ['En kârlı varlıklarım hangileri?', 'Risk profilim nasıl?', 'Hangi varlığı almalıyım?'],
      data: { type: 'action', actions: actionButtons },
      timestamp: new Date(),
    };
  }

  // ── Risk analizi ──────────────────────────────────────────────
  if (q.includes('risk')) {
    const rp = data.riskProfile;
    if (!rp) return simpleResponse('Risk analizi henüz tamamlanmadı. Sayfayı yenileyip tekrar deneyin.', ['Ne yapmalıyım?']);

    const levelName = rp.level === 'conservative' ? 'Muhafazakar' : rp.level === 'moderate' ? 'Dengeli' : rp.level === 'aggressive' ? 'Agresif' : 'Çok Agresif';

    let advice = '';
    if (rp.score > 70) {
      advice = '\n\n**Tavsiye:** Risk seviyeniz yüksek. Portföyün %20-30\'unu daha güvenli varlıklara (tahvil, altın, TL mevduat) kaydırarak riski dengeleyebilirsiniz.';
    } else if (rp.score > 50) {
      advice = '\n\n**Tavsiye:** Dengeli bir risk seviyendesiniz. Mevcut dağılımı koruyun, ama yoğunlaşma olan varlıkları izleyin.';
    } else {
      advice = '\n\n**Tavsiye:** Düşük risk profilisiniz. Getiri artırmak istiyorsanız hisse veya kripto oranını artırabilirsiniz.';
    }

    return {
      role: 'ai',
      content: `**Risk Profili: ${levelName}**\n\nGenel skor: **${rp.score.toFixed(0)}/100**${advice}`,
      suggestions: ['Riskimi nasıl azaltırım?', 'Hangi varlıklar güvenli?', 'Ne yapmalıyım?'],
      data: {
        type: 'metric',
        metrics: [
          { label: 'Çeşitlendirme', value: `${rp.factors.diversification.toFixed(0)}%`, color: rp.factors.diversification > 60 ? 'green' : 'red' },
          { label: 'Volatilite', value: `${rp.factors.volatility.toFixed(0)}%`, color: rp.factors.volatility < 50 ? 'green' : 'red' },
          { label: 'Yoğunlaşma', value: `${rp.factors.concentration.toFixed(0)}%`, color: rp.factors.concentration < 40 ? 'green' : 'red' },
          { label: 'Dağılım', value: `${rp.factors.asset_allocation.toFixed(0)}%`, color: rp.factors.asset_allocation > 50 ? 'green' : 'red' },
        ],
      },
      timestamp: new Date(),
    };
  }

  // ── Kârlı / zararlı varlıklar ────────────────────────────────
  if (q.includes('kâr') || q.includes('kar') || q.includes('kazanç') || q.includes('winner') || q.includes('en iyi')) {
    if (winners.length === 0) return simpleResponse('Henüz kârda olan varlığınız yok.', ['Ne yapmalıyım?']);

    const top5 = winners.slice(0, 5);
    const content = `**En Kârlı Varlıklarınız:**\n\n${top5.map((h, i) =>
      `${i + 1}. **${h.symbol}** — %+${h.pnlPct.toFixed(1)} (${formatCurrency(h.pnl)} ₺ kâr)`
    ).join('\n')}`;

    const advice = top5[0].pnlPct > 50
      ? `\n\n💡 **${top5[0].symbol}** %${top5[0].pnlPct.toFixed(0)} kârda. Kârın bir kısmını realize etmeyi düşünün.`
      : '';

    return {
      role: 'ai',
      content: content + advice,
      suggestions: ['Zarardaki varlıklarım?', 'Kâr realizasyonu yapmalı mıyım?', 'Portföy dağılımım nasıl?'],
      timestamp: new Date(),
    };
  }

  if (q.includes('zarar') || q.includes('kayıp') || q.includes('loser') || q.includes('düşen')) {
    if (losers.length === 0) return simpleResponse('Zararda olan varlığınız yok, tebrikler! 🎉', ['Kârlı varlıklarım?']);

    const top5 = losers.slice(0, 5);
    const content = `**Zarardaki Varlıklarınız:**\n\n${top5.map((h, i) =>
      `${i + 1}. **${h.symbol}** — %${h.pnlPct.toFixed(1)} (${formatCurrency(Math.abs(h.pnl))} ₺ zarar)`
    ).join('\n')}`;

    const advice = top5[0].pnlPct < -20
      ? `\n\n⚠️ **${top5[0].symbol}** %${Math.abs(top5[0].pnlPct).toFixed(0)} zararda. Bu seviyede stop-loss belirlemenizi veya pozisyonu gözden geçirmenizi öneririm.`
      : '';

    return {
      role: 'ai',
      content: content + advice,
      suggestions: ['Bu varlıkları satmalı mıyım?', 'Stop-loss nedir?', 'Ne yapmalıyım?'],
      timestamp: new Date(),
    };
  }

  // ── Al/Sat önerileri ──────────────────────────────────────────
  if (q.includes('al') || q.includes('sat') || q.includes('sinyal') || q.includes('buy') || q.includes('sell')) {
    if (data.signals.length === 0) return simpleResponse('Henüz sinyal hesaplanamadı. Analizi yenileyip tekrar deneyin.', ['Ne yapmalıyım?']);

    const buys = data.signals.filter(s => s.signal === 'strong_buy' || s.signal === 'buy');
    const sells = data.signals.filter(s => s.signal === 'strong_sell' || s.signal === 'sell');
    const holds = data.signals.filter(s => s.signal === 'hold');

    let content = '**Al/Sat Sinyalleri:**\n\n';

    if (buys.length > 0) {
      content += `🟢 **AL:** ${buys.map(s => `${s.symbol} (güç: %${s.strength.toFixed(0)})`).join(', ')}\n`;
      buys.forEach(s => {
        content += `   → ${s.symbol}: ${s.reasons.slice(0, 2).join('. ')}`;
        if (s.targetPrice) content += ` | Hedef: ${formatCurrency(s.targetPrice)} ₺`;
        content += '\n';
      });
    }

    if (sells.length > 0) {
      content += `\n🔴 **SAT:** ${sells.map(s => `${s.symbol} (güç: %${s.strength.toFixed(0)})`).join(', ')}\n`;
      sells.forEach(s => {
        content += `   → ${s.symbol}: ${s.reasons.slice(0, 2).join('. ')}`;
        if (s.stopLoss) content += ` | Stop-Loss: ${formatCurrency(s.stopLoss)} ₺`;
        content += '\n';
      });
    }

    if (holds.length > 0) {
      content += `\n⚪ **TUT:** ${holds.map(s => s.symbol).join(', ')}`;
    }

    return {
      role: 'ai',
      content,
      suggestions: ['En güçlü alım fırsatı hangisi?', 'Ne yapmalıyım?', 'Risk profilim?'],
      timestamp: new Date(),
    };
  }

  // ── Portföy dağılımı ──────────────────────────────────────────
  if (q.includes('dağılım') || q.includes('ağırlık') || q.includes('yüzde') || q.includes('allocation')) {
    let content = `**Portföy Dağılımı** (Toplam: ${formatCurrency(totalValue)} ₺)\n\n`;

    // By type
    content += '**Varlık Türüne Göre:**\n';
    Object.entries(byType)
      .sort((a, b) => b[1].value - a[1].value)
      .forEach(([type, info]) => {
        const pct = totalValue > 0 ? (info.value / totalValue) * 100 : 0;
        content += `• ${TYPE_NAMES[type] || type}: ${formatCurrency(info.value)} ₺ (%${pct.toFixed(1)}) — ${info.count} varlık\n`;
      });

    // Top 5 by weight
    content += '\n**En Büyük Pozisyonlar:**\n';
    sorted.slice(0, 5).forEach((h, i) => {
      content += `${i + 1}. ${h.symbol} — %${h.weight.toFixed(1)} (${formatCurrency(h.value)} ₺)\n`;
    });

    return {
      role: 'ai',
      content,
      suggestions: ['Çeşitlendirme yeterli mi?', 'Rebalance gerekiyor mu?', 'Risk profilim?'],
      data: { type: 'action', actions: [{ label: 'Dağılım Sayfası', route: '/allocation' }, { label: 'Rebalance', route: '/rebalancing' }] },
      timestamp: new Date(),
    };
  }

  // ── Performans / getiri ───────────────────────────────────────
  if (q.includes('performans') || q.includes('getiri') || q.includes('durum') || q.includes('özet') || q.includes('nasıl')) {
    const grade = data.score?.grade || '?';
    const overall = data.score?.overall?.toFixed(0) || '?';

    let content = `**Portföy Performans Özeti:**\n\n`;
    content += `📊 Portföy Notu: **${grade}** (${overall}/100)\n`;
    content += `💰 Toplam Değer: **${formatCurrency(totalValue)} ₺**\n`;
    content += `📈 Toplam Yatırım: ${formatCurrency(totalInvestment)} ₺\n`;
    content += `${totalPnl >= 0 ? '🟢' : '🔴'} Kâr/Zarar: **${formatCurrency(totalPnl)} ₺** (%${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(1)})\n`;
    content += `📋 Varlık Sayısı: ${data.holdings.length}\n`;

    if (data.score) {
      content += `\n**Detaylı Puanlar:**\n`;
      content += `• Çeşitlendirme: ${data.score.breakdown.diversification.toFixed(0)}/100\n`;
      content += `• Performans: ${data.score.breakdown.performance.toFixed(0)}/100\n`;
      content += `• Risk Yönetimi: ${data.score.breakdown.riskManagement.toFixed(0)}/100\n`;
    }

    return {
      role: 'ai',
      content,
      suggestions: ['Ne yapmalıyım?', 'Kârlı varlıklarım?', 'Zarardaki varlıklarım?'],
      data: {
        type: 'metric',
        metrics: [
          { label: 'Portföy Notu', value: grade, color: grade.startsWith('A') ? 'green' : grade.startsWith('B') ? 'blue' : 'red' },
          { label: 'Toplam Kâr', value: `${formatCurrency(totalPnl)} ₺`, color: totalPnl >= 0 ? 'green' : 'red' },
          { label: 'Getiri', value: `%${totalPnlPct.toFixed(1)}`, color: totalPnlPct >= 0 ? 'green' : 'red' },
          { label: 'Varlık Sayısı', value: `${data.holdings.length}` },
        ],
      },
      timestamp: new Date(),
    };
  }

  // ── Belirli varlık hakkında soru ──────────────────────────────
  const matchedHolding = detailed.find(h =>
    q.includes(h.symbol.toLowerCase()) || q.includes(h.symbol.toLowerCase().replace('.is', ''))
  );

  if (matchedHolding) {
    const h = matchedHolding;
    const signal = data.signals.find(s => s.symbol === h.symbol);
    const signalText = signal
      ? `Teknik sinyal: **${signal.signal.replace('_', ' ').toUpperCase()}** (güç: %${signal.strength.toFixed(0)})`
      : 'Teknik sinyal mevcut değil';

    let content = `**${h.symbol} Detay Analizi:**\n\n`;
    content += `💰 Güncel Fiyat: ${formatCurrency(h.current_price)} ₺\n`;
    content += `📊 Alış Fiyatı: ${formatCurrency(h.purchase_price)} ₺\n`;
    content += `📦 Miktar: ${h.quantity}\n`;
    content += `💎 Toplam Değer: ${formatCurrency(h.value)} ₺\n`;
    content += `${h.pnl >= 0 ? '🟢' : '🔴'} Kâr/Zarar: ${formatCurrency(h.pnl)} ₺ (%${h.pnlPct >= 0 ? '+' : ''}${h.pnlPct.toFixed(1)})\n`;
    content += `⚖️ Portföy Ağırlığı: %${h.weight.toFixed(1)}\n`;
    content += `📡 ${signalText}\n`;

    if (signal && signal.reasons.length > 0) {
      content += `\n**Sinyal Nedenleri:**\n`;
      signal.reasons.forEach(r => { content += `• ${r}\n`; });
    }

    if (h.weight > 30) {
      content += `\n⚠️ Bu varlık portföyünüzün %${h.weight.toFixed(0)}'ini oluşturuyor. Yoğunlaşma riski var.`;
    }

    return {
      role: 'ai',
      content,
      suggestions: [`${h.symbol} satmalı mıyım?`, 'Portföy dağılımım?', 'Ne yapmalıyım?'],
      timestamp: new Date(),
    };
  }

  // ── Rebalance ─────────────────────────────────────────────────
  if (q.includes('rebalance') || q.includes('dengeleme') || q.includes('yeniden dağ')) {
    const topWeight = sorted.length > 0 ? sorted[0].weight : 0;
    const needsRebalance = topWeight > 25 || Object.keys(byType).length < 3;

    let content = needsRebalance
      ? `**Rebalance Önerilir!**\n\n`
      : `**Portföyünüz makul dengede.**\n\n`;

    if (topWeight > 25) {
      content += `En büyük pozisyon ${sorted[0].symbol} (%${topWeight.toFixed(0)}). İdeal olarak tek varlık %20'yi geçmemelidir.\n\n`;
    }

    content += `**Mevcut Dağılım:**\n`;
    sorted.slice(0, 7).forEach(h => {
      const ideal = 100 / sorted.length;
      const diff = h.weight - ideal;
      const arrow = diff > 5 ? '↓ Azalt' : diff < -5 ? '↑ Artır' : '✓ İyi';
      content += `• ${h.symbol}: %${h.weight.toFixed(1)} (${arrow})\n`;
    });

    return {
      role: 'ai',
      content,
      suggestions: ['Nasıl rebalance yapmalıyım?', 'Risk profilim?', 'Ne yapmalıyım?'],
      data: { type: 'action', actions: [{ label: 'Rebalance Aracı', route: '/rebalancing' }] },
      timestamp: new Date(),
    };
  }

  // ── Stop loss ─────────────────────────────────────────────────
  if (q.includes('stop') || q.includes('loss') || q.includes('zarar durdur')) {
    let content = `**Stop-Loss Önerileri:**\n\nStop-loss, varlık belirli bir fiyatın altına düştüğünde otomatik satış yaparak zararı sınırlar.\n\n`;

    const relevantSignals = data.signals.filter(s => s.stopLoss);
    if (relevantSignals.length > 0) {
      content += `**Varlıklarınız için önerilen stop-loss seviyeleri:**\n`;
      relevantSignals.forEach(s => {
        const h = detailed.find(d => d.symbol === s.symbol);
        if (h && s.stopLoss) {
          const dropPct = ((s.stopLoss - h.current_price) / h.current_price * 100).toFixed(1);
          content += `• **${s.symbol}**: ${formatCurrency(s.stopLoss)} ₺ (güncel fiyattan %${dropPct})\n`;
        }
      });
    } else {
      content += 'Genel kural: Alış fiyatınızın %7-10 altına stop-loss koyun.\n';
      losers.slice(0, 3).forEach(h => {
        const stopPrice = h.purchase_price * 0.9;
        content += `• **${h.symbol}**: ${formatCurrency(stopPrice)} ₺ (alış fiyatının %10 altı)\n`;
      });
    }

    return {
      role: 'ai',
      content,
      suggestions: ['Zarardaki varlıklarım?', 'Ne yapmalıyım?', 'Risk profilim?'],
      timestamp: new Date(),
    };
  }

  // ── Fallback - genel yardım ───────────────────────────────────
  return {
    role: 'ai',
    content: `Portföyünüz hakkında şunları sorabilirsiniiz:\n\n• **"Ne yapmalıyım?"** — Stratejik değerlendirme ve aksiyon önerileri\n• **"Risk profilim?"** — Risk analizi ve skorlar\n• **"Performansım nasıl?"** — Genel portföy performans özeti\n• **"Kârlı varlıklarım?"** — En çok kazandıran varlıklar\n• **"Zarardaki varlıklarım?"** — Kayıpta olan pozisyonlar\n• **"Al/Sat sinyalleri?"** — Teknik analiz önerileri\n• **"Dağılım?"** — Portföy ağırlık dağılımı\n• **"Rebalance?"** — Dengeleme ihtiyacı analizi\n• **"THYAO"** (varlık adı) — Belirli varlık detay analizi\n• **"Stop-loss?"** — Zarar durdurma seviyeleri`,
    suggestions: ['Ne yapmalıyım?', 'Performansım nasıl?', 'Al/Sat sinyalleri?', 'Risk profilim?'],
    timestamp: new Date(),
  };
}

function simpleResponse(content: string, suggestions: string[]): ChatMessage {
  return { role: 'ai', content, suggestions, timestamp: new Date() };
}
