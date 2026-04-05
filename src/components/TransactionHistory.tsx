import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { Transaction, getAllTransactions } from '../services/transactionService';
import { formatCurrency } from '../services/priceService';
import { format } from 'date-fns';

export function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTransactions();
  }, []);

  async function loadTransactions() {
    setLoading(true);
    const data = await getAllTransactions();
    setTransactions(data.slice(0, 10));
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Son İşlemler</h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700"></div>
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Son İşlemler</h3>
        <div className="text-center py-8 text-slate-500">
          <Calendar className="mx-auto mb-2" size={32} />
          <p>Henüz işlem kaydı yok</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Son İşlemler</h3>
      <div className="space-y-3">
        {transactions.map((transaction) => (
          <div
            key={transaction.id}
            className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  transaction.transaction_type === 'buy'
                    ? 'bg-green-100 text-green-600'
                    : 'bg-red-100 text-red-600'
                }`}
              >
                {transaction.transaction_type === 'buy' ? (
                  <TrendingUp size={20} />
                ) : (
                  <TrendingDown size={20} />
                )}
              </div>
              <div>
                <p className="font-medium text-slate-900">
                  {transaction.transaction_type === 'buy' ? 'ALIŞ' : 'SATIŞ'}
                </p>
                <p className="text-sm text-slate-600">
                  {format(new Date(transaction.transaction_date), 'dd MMM yyyy, HH:mm')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold text-slate-900">
                {formatCurrency(transaction.quantity)} adet
              </p>
              <p className="text-sm text-slate-600">
                {formatCurrency(transaction.price)} ₺ × {transaction.quantity}
              </p>
              <p className="text-xs text-slate-500">
                Toplam: {formatCurrency(transaction.total_amount)} ₺
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
