// Kasa defteri: bakiye ve toplam yatırma, kasa hareketlerinden türetilir.
// cash_balances.total_deposits eski satırlarda bayat kalabiliyor. Fark gizlenmez.

export interface CashTxLike {
  currency?: string | null;
  transaction_type?: string | null;
  type?: string | null;
  amount?: number | string | null;
}

export interface LedgerRow {
  currency: string;
  deposits: number;
  withdrawals: number;
  buys: number;
  sells: number;
  transfers: number;
  balance: number;
}

export function ledgerFromTransactions(rows: CashTxLike[]): LedgerRow[] {
  const m = new Map<string, LedgerRow>();
  const row = (c: string) => {
    if (!m.has(c)) m.set(c, { currency: c, deposits: 0, withdrawals: 0, buys: 0, sells: 0, transfers: 0, balance: 0 });
    return m.get(c)!;
  };
  for (const r of rows) {
    const c = String(r.currency || 'TRY').toUpperCase();
    const kind = String(r.transaction_type || r.type || '').toLowerCase();
    const a = Number(r.amount) || 0;
    if (!a) continue;
    const x = row(c);
    if (kind === 'deposit') { x.deposits += a; x.balance += a; }
    else if (kind === 'withdrawal' || kind === 'withdraw') { x.withdrawals += a; x.balance -= a; }
    else if (kind === 'buy') { x.buys += a; x.balance -= a; }
    else if (kind === 'sell') { x.sells += a; x.balance += a; }
    else if (kind === 'transfer') { x.transfers += a; x.balance += a; }
  }
  return [...m.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Hareketlerden türeyen bakiye ile kayıtlı bakiye. Eşik altı fark yok sayılır. */
export function balanceGap(stored: number, derived: number, eps = 0.5): number | null {
  const d = derived - stored;
  return Math.abs(d) > eps ? d : null;
}
