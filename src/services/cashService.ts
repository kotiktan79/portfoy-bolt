import { supabase, CashBalance, CashTransaction, TransactionType } from '../lib/supabase';
import { getExchangeRate } from './currencyService';
import { ANON_USER_ID } from '../config';

export async function getCashBalance(currency: string = 'TRY'): Promise<CashBalance | null> {
  try {
    const { data, error } = await supabase
      .from('cash_balances')
      .select('*')
      .eq('user_id', ANON_USER_ID)
      .eq('currency', currency)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const { data: newBalance, error: createError } = await supabase
        .from('cash_balances')
        .insert({
          user_id: ANON_USER_ID,
          currency,
          balance: 0,
          total_deposits: 0,
          total_withdrawals: 0,
          realized_profit: 0,
        })
        .select()
        .single();

      if (createError) throw createError;
      return newBalance;
    }

    return data;
  } catch (error) {
    console.error('Error getting cash balance:', error);
    return null;
  }
}

export async function updateCashBalance(
  currency: string,
  amount: number,
  transactionType: TransactionType,
  notes?: string,
  relatedHoldingId?: string,
  realizedDelta: number = 0
): Promise<boolean> {
  try {
    if (amount < 0 || !isFinite(amount)) {
      console.error('Invalid amount:', amount);
      return false;
    }

    const currentBalance = await getCashBalance(currency);
    if (!currentBalance) return false;

    const balanceBefore = currentBalance.balance;
    let balanceAfter = balanceBefore;
    let realizedProfit = currentBalance.realized_profit;
    let totalDeposits = currentBalance.total_deposits;
    let totalWithdrawals = currentBalance.total_withdrawals;

    switch (transactionType) {
      case 'deposit':
        balanceAfter = balanceBefore + amount;
        totalDeposits += amount;
        break;
      case 'withdrawal':
        if (balanceBefore < amount) {
          throw new Error('Yetersiz bakiye');
        }
        balanceAfter = balanceBefore - amount;
        totalWithdrawals += amount;
        break;
      case 'buy':
        if (balanceBefore < amount) {
          throw new Error('Yetersiz bakiye');
        }
        balanceAfter = balanceBefore - amount;
        break;
      case 'sell':
        balanceAfter = balanceBefore + amount;
        // Capital gain on the sale counts as realized income (the caller passes
        // proceeds − cost basis). Previously sells left realized_profit untouched,
        // so it only ever reflected dividends — understating realized income.
        realizedProfit += realizedDelta;
        break;
      case 'dividend':
        balanceAfter = balanceBefore + amount;
        realizedProfit += amount;
        break;
      default:
        console.error('Unknown transaction type:', transactionType);
        return false;
    }

    if (!isFinite(balanceAfter)) {
      console.error('Invalid balance after calculation:', balanceAfter);
      return false;
    }

    const { error: balanceError } = await supabase
      .from('cash_balances')
      .update({
        balance: balanceAfter,
        total_deposits: totalDeposits,
        total_withdrawals: totalWithdrawals,
        realized_profit: realizedProfit,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentBalance.id);

    if (balanceError) throw balanceError;

    const { error: transactionError } = await supabase
      .from('cash_transactions')
      .insert({
        user_id: ANON_USER_ID,
        transaction_type: transactionType,
        currency,
        amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        related_holding_id: relatedHoldingId,
        notes,
      });

    if (transactionError) throw transactionError;

    return true;
  } catch (error) {
    console.error('Error updating cash balance:', error);
    return false;
  }
}

export async function getCashTransactions(limit: number = 50): Promise<CashTransaction[]> {
  try {
    const { data, error } = await supabase
      .from('cash_transactions')
      .select('*')
      .eq('user_id', ANON_USER_ID)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting cash transactions:', error);
    return [];
  }
}

export async function getTotalCashValue(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('cash_balances')
      .select('balance, currency')
      .eq('user_id', ANON_USER_ID);

    if (error) throw error;
    if (!data || data.length === 0) return 0;

    // Fetch all exchange rates in parallel instead of sequentially
    const ratePromises = data.map(balance =>
      balance.currency === 'TRY'
        ? Promise.resolve(1)
        : getExchangeRate(balance.currency, 'TRY')
    );
    const rates = await Promise.all(ratePromises);

    let totalTRY = 0;
    for (let i = 0; i < data.length; i++) {
      const convertedValue = data[i].balance * rates[i];
      if (isFinite(convertedValue)) {
        totalTRY += convertedValue;
      }
    }

    return isFinite(totalTRY) ? totalTRY : 0;
  } catch (error) {
    console.error('Error getting total cash value:', error);
    return 0;
  }
}

export async function getAllCashBalanceTotals(): Promise<{
  totalDeposits: number;
  totalWithdrawals: number;
  totalBalance: number;
}> {
  try {
    const { data: cashBalances, error } = await supabase
      .from('cash_balances')
      .select('total_deposits, total_withdrawals, balance, currency')
      .eq('user_id', ANON_USER_ID);

    if (error) throw error;
    if (!cashBalances || cashBalances.length === 0) {
      return { totalDeposits: 0, totalWithdrawals: 0, totalBalance: 0 };
    }

    const ratePromises = cashBalances.map(cb =>
      cb.currency === 'TRY'
        ? Promise.resolve(1)
        : getExchangeRate(cb.currency, 'TRY')
    );
    const rates = await Promise.all(ratePromises);

    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalBalance = 0;
    for (let i = 0; i < cashBalances.length; i++) {
      const rate = rates[i];
      totalDeposits += (cashBalances[i].total_deposits || 0) * rate;
      totalWithdrawals += (cashBalances[i].total_withdrawals || 0) * rate;
      totalBalance += (cashBalances[i].balance || 0) * rate;
    }

    return { totalDeposits, totalWithdrawals, totalBalance };
  } catch (error) {
    console.error('Error getting cash balance totals:', error);
    return { totalDeposits: 0, totalWithdrawals: 0, totalBalance: 0 };
  }
}

export function formatCash(amount: number, currency: string = 'TRY'): string {
  const symbols: Record<string, string> = {
    TRY: '₺', USD: '$', EUR: '€', GBP: '£', CHF: 'Fr', RON: 'Lei', RUB: '₽',
  };
  const symbol = symbols[currency] || currency;
  return `${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
}
