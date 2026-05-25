import { supabase, Holding } from '../lib/supabase';
import { getAllTransactions, Transaction } from './transactionService';
import { getFxRatesFromHoldings, holdingValueTRY, holdingCostTRY } from '../lib/fx';

interface PortfolioBackup {
  holdings: Holding[];
  transactions: Transaction[];
  exportDate: string;
  version: string;
}

export async function exportPortfolioToJSON(): Promise<void> {
  const { data: holdings } = await supabase
    .from('holdings')
    .select('*')
    .order('created_at', { ascending: false });

  const transactions = await getAllTransactions();

  const backup: PortfolioBackup = {
    holdings: holdings || [],
    transactions: transactions || [],
    exportDate: new Date().toISOString(),
    version: '1.0',
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `portfolio-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportHoldingsToCSV(): Promise<void> {
  const { data: holdings } = await supabase
    .from('holdings')
    .select('*')
    .order('created_at', { ascending: false });

  if (!holdings || holdings.length === 0) {
    throw new Error('No holdings to export');
  }

  const headers = [
    'Symbol',
    'Type',
    'Quantity',
    'Purchase Price',
    'Current Price',
    'Total Value',
    'P&L',
    'P&L %',
    'Created At',
  ];

  const fxRates = getFxRatesFromHoldings(holdings);
  const rows = holdings.map((h) => {
    const totalValue = holdingValueTRY(h, fxRates);
    const totalCost = holdingCostTRY(h, fxRates);
    const pnl = totalValue - totalCost;
    const pnlPercentage = totalCost > 0 ? ((pnl / totalCost) * 100).toFixed(2) : '0.00';

    return [
      h.symbol,
      h.asset_type,
      h.quantity,
      h.purchase_price,
      h.current_price,
      totalValue.toFixed(2),
      pnl.toFixed(2),
      pnlPercentage,
      new Date(h.created_at).toLocaleString('tr-TR'),
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `holdings-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportTransactionsToCSV(): Promise<void> {
  const transactions = await getAllTransactions();

  if (!transactions || transactions.length === 0) {
    throw new Error('No transactions to export');
  }

  const headers = [
    'Date',
    'Type',
    'Quantity',
    'Price',
    'Total',
    'Fee',
    'Notes',
  ];

  const rows = transactions.map((t) => [
    new Date(t.transaction_date).toLocaleString('tr-TR'),
    t.transaction_type,
    t.quantity,
    t.price,
    t.total_amount.toFixed(2),
    t.fee.toFixed(2),
    t.notes || '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importPortfolioFromJSON(file: File): Promise<{
  success: boolean;
  message: string;
  imported?: { holdings: number; transactions: number };
}> {
  try {
    const text = await file.text();
    const backup: PortfolioBackup = JSON.parse(text);

    if (!backup.holdings || !Array.isArray(backup.holdings)) {
      throw new Error('Invalid backup file format');
    }

    let holdingsImported = 0;
    let transactionsImported = 0;
    const holdingIdMap = new Map<string, string>();

    for (const holding of backup.holdings) {
      const { data, error } = await supabase
        .from('holdings')
        .insert({
          symbol: holding.symbol,
          asset_type: holding.asset_type,
          quantity: holding.quantity,
          purchase_price: holding.purchase_price,
          current_price: holding.current_price,
        })
        .select('id')
        .maybeSingle();

      if (!error && data) {
        holdingsImported++;
        if (holding.id) holdingIdMap.set(holding.id, data.id);
      }
    }

    if (backup.transactions && Array.isArray(backup.transactions)) {
      for (const transaction of backup.transactions) {
        const newHoldingId = holdingIdMap.get(transaction.holding_id);
        if (!newHoldingId) continue;

        const { error } = await supabase.from('transactions').insert({
          holding_id: newHoldingId,
          transaction_type: transaction.transaction_type,
          quantity: transaction.quantity,
          price: transaction.price,
          total_amount: transaction.total_amount,
          fee: transaction.fee,
          notes: transaction.notes,
          transaction_date: transaction.transaction_date,
        });

        if (!error) transactionsImported++;
      }
    }

    return {
      success: true,
      message: `Successfully imported ${holdingsImported} holdings and ${transactionsImported} transactions`,
      imported: { holdings: holdingsImported, transactions: transactionsImported },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to import backup',
    };
  }
}
