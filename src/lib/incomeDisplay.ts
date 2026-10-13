// Gelir sekmesi. Kâr motoruna dokunmaz: kasa dışı kupon da listelenir, cetvele yazılmaz.

export interface IncomeSource {
  id: string;
  income_date?: string | null;
  payment_date?: string | null;
  income_type?: string | null;
  source_symbol?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  amount_try?: number | string | null;
  notes?: string | null;
  is_projected?: boolean | null;
  destination?: string | null;
  holding_id?: string | null;
}

export interface IncomeView {
  id: string;
  date: string;
  kind: string;
  label: string;
  source: string;
  amount: number;
  currency: string;
  amountTry: number;
  inProfitEngine: boolean;
  projected: boolean;
  note: string | null;
}

const LABELS: Record<string, string> = {
  coupon: 'Kupon',
  dividend: 'Temettü',
  interest: 'Faiz',
  staking: 'Getiri',
  profit_taking: 'Kâr realizasyonu',
  other: 'Diğer',
};

export function incomeViews(records: IncomeSource[], dividends: IncomeSource[] = []): IncomeView[] {
  const fromRecords: IncomeView[] = records
    .filter(r => !r.is_projected)
    .map(r => {
      const kind = String(r.income_type || 'other');
      return {
        id: String(r.id),
        date: String(r.income_date || '').slice(0, 10),
        kind,
        label: LABELS[kind] || 'Gelir',
        source: String(r.source_symbol || '').trim(),
        amount: Number(r.amount) || 0,
        currency: String(r.currency || 'TRY').toUpperCase(),
        amountTry: Number(r.amount_try) || 0,
        inProfitEngine: r.destination === 'kasa' && (kind === 'dividend' || kind === 'coupon'),
        projected: false,
        note: r.notes ? String(r.notes) : null,
      };
    });
  const fromDiv: IncomeView[] = dividends.map(d => ({
    id: `div-${d.id}`,
    date: String(d.payment_date || '').slice(0, 10),
    kind: 'dividend',
    label: 'Temettü',
    source: '',
    amount: Number(d.amount) || 0,
    currency: 'TRY',
    amountTry: Number(d.amount) || 0,
    inProfitEngine: false,
    projected: false,
    note: d.notes ? String(d.notes) : null,
  }));
  return [...fromRecords, ...fromDiv]
    .filter(r => r.date)
    .sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label, 'tr'));
}
