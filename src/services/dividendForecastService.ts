import { Holding } from '../lib/supabase';

export interface DividendProfile {
  yieldPct: number;
  payMonths: number[];
  notes?: string;
}

export interface MonthlyDividend {
  month: number;
  monthLabel: string;
  total: number;
  payments: DividendPayment[];
}

export interface DividendPayment {
  symbol: string;
  amount: number;
  yieldPct: number;
  type: 'dividend' | 'staking' | 'coupon';
}

export interface DividendForecast {
  months: MonthlyDividend[];
  annualTotal: number;
  averageMonthly: number;
  effectiveYieldPct: number;
  coverageCount: number;
  uncoveredCount: number;
}

const MONTH_LABELS = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

const BIST_DIVIDEND_PROFILES: Record<string, DividendProfile> = {
  GARAN: { yieldPct: 5.0, payMonths: [3, 9], notes: 'Mart + Eylül' },
  AKBNK: { yieldPct: 5.5, payMonths: [3, 9], notes: 'Mart + Eylül' },
  ISCTR: { yieldPct: 6.0, payMonths: [4], notes: 'Nisan' },
  YKBNK: { yieldPct: 5.0, payMonths: [4], notes: 'Nisan' },
  HALKB: { yieldPct: 4.0, payMonths: [4], notes: 'Nisan' },
  VAKBN: { yieldPct: 4.0, payMonths: [4], notes: 'Nisan' },
  KCHOL: { yieldPct: 2.5, payMonths: [5], notes: 'Mayıs' },
  SAHOL: { yieldPct: 2.5, payMonths: [5], notes: 'Mayıs' },
  DOHOL: { yieldPct: 2.0, payMonths: [5], notes: 'Mayıs' },
  BIMAS: { yieldPct: 2.5, payMonths: [5], notes: 'Mayıs' },
  MGROS: { yieldPct: 2.0, payMonths: [5], notes: 'Mayıs' },
  TUPRS: { yieldPct: 6.5, payMonths: [5, 11], notes: 'Mayıs + Kasım' },
  PETKM: { yieldPct: 4.0, payMonths: [5], notes: 'Mayıs' },
  ASELS: { yieldPct: 1.5, payMonths: [5], notes: 'Mayıs' },
  THYAO: { yieldPct: 0.5, payMonths: [5], notes: 'Düşük temettü' },
  PGSUS: { yieldPct: 0, payMonths: [], notes: 'Temettü dağıtmıyor' },
  ENKAI: { yieldPct: 2.5, payMonths: [4], notes: 'Nisan' },
  TCELL: { yieldPct: 6.0, payMonths: [5, 9], notes: 'Mayıs + Eylül' },
  TTKOM: { yieldPct: 5.5, payMonths: [5], notes: 'Mayıs' },
  EREGL: { yieldPct: 4.0, payMonths: [4], notes: 'Nisan' },
  KRDMD: { yieldPct: 3.0, payMonths: [5], notes: 'Mayıs' },
  SISE: { yieldPct: 3.0, payMonths: [5], notes: 'Mayıs' },
  CCOLA: { yieldPct: 1.5, payMonths: [4], notes: 'Nisan' },
  TOASO: { yieldPct: 4.0, payMonths: [4], notes: 'Nisan' },
  FROTO: { yieldPct: 3.5, payMonths: [4], notes: 'Nisan' },
  AKSEN: { yieldPct: 1.5, payMonths: [5], notes: 'Mayıs' },
  EKGYO: { yieldPct: 5.0, payMonths: [5], notes: 'Mayıs' },
  ARCLK: { yieldPct: 2.5, payMonths: [4], notes: 'Nisan' },
  TAVHL: { yieldPct: 3.0, payMonths: [5], notes: 'Mayıs' },
  KOZAL: { yieldPct: 3.0, payMonths: [5], notes: 'Mayıs' },
  HEKTS: { yieldPct: 2.0, payMonths: [5], notes: 'Mayıs' },
  GUBRF: { yieldPct: 3.0, payMonths: [4], notes: 'Nisan' },
  SASA: { yieldPct: 0, payMonths: [], notes: 'Temettü dağıtmıyor' },
  VESTL: { yieldPct: 1.0, payMonths: [5], notes: 'Mayıs' },
  KOZAA: { yieldPct: 2.0, payMonths: [5], notes: 'Mayıs' },
};

const CRYPTO_STAKING_PROFILES: Record<string, DividendProfile> = {
  ETH: { yieldPct: 3.5, payMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], notes: 'Sürekli staking' },
  SOL: { yieldPct: 6.5, payMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], notes: 'Sürekli staking' },
  BNB: { yieldPct: 2.0, payMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], notes: 'Sürekli staking' },
  ADA: { yieldPct: 3.5, payMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], notes: 'Sürekli staking' },
  DOT: { yieldPct: 10.0, payMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], notes: 'Sürekli staking' },
  AVAX: { yieldPct: 8.0, payMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], notes: 'Sürekli staking' },
  ATOM: { yieldPct: 15.0, payMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], notes: 'Sürekli staking' },
};

// Eurobond / sabit getirili tahvil — yıllık ~%5 USD kupon, 6 ayda bir (Şub + Ağu varsayımı)
const EUROBOND_PROFILE: DividendProfile = {
  yieldPct: 5.0,
  payMonths: [2, 8],
  notes: 'Yıllık ~%5 USD kupon (6 ayda bir)',
};

export function forecastDividends(holdings: Holding[]): DividendForecast {
  const startDate = new Date();
  const monthsArr: MonthlyDividend[] = [];

  for (let i = 0; i < 12; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    monthsArr.push({
      month: d.getMonth() + 1,
      monthLabel: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`,
      total: 0,
      payments: [],
    });
  }

  let coverageCount = 0;
  let uncoveredCount = 0;
  let totalAnnualValue = 0;

  for (const h of holdings) {
    const sym = h.symbol.toUpperCase();
    const value = (h.current_price || 0) * (h.quantity || 0);
    if (value <= 0) continue;
    totalAnnualValue += value;

    let profile: DividendProfile | null = null;
    let type: DividendPayment['type'] = 'dividend';

    if (h.asset_type === 'stock') {
      profile = BIST_DIVIDEND_PROFILES[sym] || null;
    } else if (h.asset_type === 'crypto') {
      profile = CRYPTO_STAKING_PROFILES[sym] || null;
      type = 'staking';
    } else if (h.asset_type === 'eurobond') {
      profile = EUROBOND_PROFILE;
      type = 'coupon';
    }

    if (!profile || profile.yieldPct === 0 || profile.payMonths.length === 0) {
      uncoveredCount++;
      continue;
    }
    coverageCount++;

    const annual = value * (profile.yieldPct / 100);
    const perPayment = annual / profile.payMonths.length;

    for (let i = 0; i < 12; i++) {
      const monthNum = monthsArr[i].month;
      if (profile.payMonths.includes(monthNum)) {
        monthsArr[i].payments.push({
          symbol: h.symbol,
          amount: perPayment,
          yieldPct: profile.yieldPct,
          type,
        });
        monthsArr[i].total += perPayment;
      }
    }
  }

  for (const m of monthsArr) {
    m.payments.sort((a, b) => b.amount - a.amount);
  }

  const annualTotal = monthsArr.reduce((s, m) => s + m.total, 0);
  const averageMonthly = annualTotal / 12;
  const effectiveYieldPct = totalAnnualValue > 0 ? (annualTotal / totalAnnualValue) * 100 : 0;

  return {
    months: monthsArr,
    annualTotal,
    averageMonthly,
    effectiveYieldPct,
    coverageCount,
    uncoveredCount,
  };
}
