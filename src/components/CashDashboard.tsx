import { useState, useEffect, useCallback } from 'react';
import { Wallet, Plus, Minus, TrendingUp, DollarSign, ArrowDownCircle, ArrowUpCircle, RefreshCw, X } from 'lucide-react';
import { CashBalance, CashTransaction } from '../lib/supabase';
import { getCashBalance, getCashTransactions, updateCashBalance, formatCash } from '../services/cashService';
import { getExchangeRate } from '../services/currencyService';

const SUPPORTED_CURRENCIES = [
  { code: 'TRY', label: 'Türk Lirası', symbol: '₺' },
  { code: 'USD', label: 'Amerikan Doları', symbol: '$' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'GBP', label: 'İngiliz Sterlini', symbol: '£' },
  { code: 'CHF', label: 'İsviçre Frangı', symbol: 'Fr' },
  { code: 'RON', label: 'Rumen Leyi', symbol: 'Lei' },
  { code: 'RUB', label: 'Rus Rublesi', symbol: '₽' },
];

interface CashBalanceWithTRY extends CashBalance {
  tryValue: number;
  rate: number;
}

export function CashDashboard() {
  const [balances, setBalances] = useState<CashBalanceWithTRY[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [totalTRY, setTotalTRY] = useState(0);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState('TRY');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [activeCurrency, setActiveCurrency] = useState('TRY');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setRatesLoading(true);
    try {
      const [transactionsData] = await Promise.all([
        getCashTransactions(20),
      ]);
      setTransactions(transactionsData);

      const enriched: CashBalanceWithTRY[] = [];
      let total = 0;

      for (const cur of SUPPORTED_CURRENCIES) {
        const bal = await getCashBalance(cur.code);
        if (bal) {
          const rate = cur.code === 'TRY' ? 1 : await getExchangeRate(cur.code, 'TRY');
          const tryValue = bal.balance * rate;
          enriched.push({ ...bal, tryValue, rate });
          total += tryValue;
        }
      }

      setBalances(enriched);
      setTotalTRY(total);
    } finally {
      setRatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleDeposit() {
    if (!amount || parseFloat(amount) <= 0) return;
    if (loading) return;
    setErrorMsg(null);
    setLoading(true);
    const success = await updateCashBalance(selectedCurrency, parseFloat(amount), 'deposit', notes || 'Para yatırma');
    if (success) {
      setShowDepositModal(false);
      setAmount('');
      setNotes('');
      await loadData();
    } else {
      setErrorMsg('İşlem başarısız oldu. Lütfen tekrar deneyin.');
    }
    setLoading(false);
  }

  async function handleWithdraw() {
    if (!amount || parseFloat(amount) <= 0) return;
    if (loading) return;
    setErrorMsg(null);
    const activeBal = balances.find(b => b.currency === selectedCurrency);
    if (activeBal && parseFloat(amount) > activeBal.balance) {
      setErrorMsg('Yetersiz bakiye');
      return;
    }
    setLoading(true);
    const success = await updateCashBalance(selectedCurrency, parseFloat(amount), 'withdrawal', notes || 'Para çekme');
    if (success) {
      setShowWithdrawModal(false);
      setAmount('');
      setNotes('');
      await loadData();
    } else {
      setErrorMsg('İşlem başarısız oldu. Lütfen tekrar deneyin.');
    }
    setLoading(false);
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit': return <ArrowDownCircle className="text-green-600" size={20} />;
      case 'withdrawal': return <ArrowUpCircle className="text-red-600" size={20} />;
      case 'buy': return <TrendingUp className="text-blue-600" size={20} />;
      case 'sell': return <DollarSign className="text-green-600" size={20} />;
      case 'dividend': return <Plus className="text-green-600" size={20} />;
      default: return <Wallet className="text-slate-600" size={20} />;
    }
  };

  const getTransactionLabel = (type: string) => {
    const labels: Record<string, string> = {
      deposit: 'Para Yatırma',
      withdrawal: 'Para Çekme',
      buy: 'Alım',
      sell: 'Satım',
      dividend: 'Temettü',
    };
    return labels[type] || type;
  };

  const activeBal = balances.find(b => b.currency === activeCurrency);

  const formatTRY = (val: number) =>
    val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';

  const getCurrencyInfo = (code: string) =>
    SUPPORTED_CURRENCIES.find(c => c.code === code) || { code, label: code, symbol: code };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Wallet className="text-blue-600" size={24} />
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Nakit Cüzdan</h3>
            <p className="text-sm text-slate-500 dark:text-gray-400">Çok para birimli nakit takibi</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={ratesLoading}
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
            title="Kurları Güncelle"
          >
            <RefreshCw size={16} className={ratesLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => { setSelectedCurrency(activeCurrency); setShowDepositModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium shadow-md hover:shadow-lg"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Yatır</span>
          </button>
          <button
            onClick={() => { setSelectedCurrency(activeCurrency); setShowWithdrawModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-md hover:shadow-lg"
          >
            <Minus size={16} />
            <span className="hidden sm:inline">Çek</span>
          </button>
        </div>
      </div>

      <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl mb-4 text-white">
        <p className="text-sm opacity-80 mb-1">Toplam Nakit Değeri (TL)</p>
        <p className="text-3xl font-bold">{formatTRY(totalTRY)}</p>
        <p className="text-xs opacity-70 mt-1">Tüm para birimleri anlık kur ile dönüştürülmüştür</p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {SUPPORTED_CURRENCIES.map(cur => {
          const bal = balances.find(b => b.currency === cur.code);
          const hasBalance = bal && bal.balance > 0;
          return (
            <button
              key={cur.code}
              onClick={() => setActiveCurrency(cur.code)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                activeCurrency === cur.code
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                  : hasBalance
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100'
                  : 'bg-slate-50 dark:bg-gray-700 text-slate-500 dark:text-gray-400 border-slate-200 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-600'
              }`}
            >
              {cur.symbol} {cur.code}
              {hasBalance && <span className="ml-1 text-xs opacity-75">•</span>}
            </button>
          );
        })}
      </div>

      {activeBal && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="p-3 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-slate-600 dark:text-gray-400 mb-1 font-medium">Mevcut Bakiye</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {formatCash(activeBal.balance, activeBal.currency)}
            </p>
            {activeBal.currency !== 'TRY' && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                ≈ {formatTRY(activeBal.tryValue)}
              </p>
            )}
          </div>
          <div className="p-3 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-xs text-slate-600 dark:text-gray-400 mb-1 font-medium">Toplam Yatırılan</p>
            <p className="text-lg font-bold text-green-600">
              {formatCash(activeBal.total_deposits, activeBal.currency)}
            </p>
          </div>
          <div className="p-3 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
            <p className="text-xs text-slate-600 dark:text-gray-400 mb-1 font-medium">Toplam Çekilen</p>
            <p className="text-lg font-bold text-red-600">
              {formatCash(activeBal.total_withdrawals, activeBal.currency)}
            </p>
          </div>
          <div className={`p-3 bg-gradient-to-br rounded-lg border ${
            activeBal.realized_profit >= 0
              ? 'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10 border-green-200 dark:border-green-800'
              : 'from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/10 border-red-200 dark:border-red-800'
          }`}>
            <p className="text-xs text-slate-600 dark:text-gray-400 mb-1 font-medium">Gerçekleşen K/Z</p>
            <p className={`text-lg font-bold ${activeBal.realized_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCash(activeBal.realized_profit, activeBal.currency)}
            </p>
          </div>
        </div>
      )}

      {activeBal && activeBal.currency !== 'TRY' && activeBal.rate > 0 && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Güncel kur: 1 {activeBal.currency} = {activeBal.rate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ₺
          </p>
        </div>
      )}

      <div>
        <h4 className="text-sm font-bold text-slate-700 dark:text-gray-300 mb-3">Son İşlemler</h4>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {transactions.length === 0 ? (
            <p className="text-center text-slate-500 dark:text-gray-400 py-8">Henüz işlem yok</p>
          ) : (
            transactions.map((transaction) => {
              const curInfo = getCurrencyInfo(transaction.currency);
              return (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-gray-900 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getTransactionIcon(transaction.transaction_type)}
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">
                        {getTransactionLabel(transaction.transaction_type)}
                        <span className="ml-2 text-xs font-normal text-slate-400 dark:text-gray-500">
                          {curInfo.code}
                        </span>
                      </p>
                      {transaction.notes && (
                        <p className="text-xs text-slate-500 dark:text-gray-400 truncate max-w-xs">{transaction.notes}</p>
                      )}
                      <p className="text-xs text-slate-400 dark:text-gray-500">
                        {new Date(transaction.created_at).toLocaleDateString('tr-TR', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-sm ${
                      ['deposit', 'sell', 'dividend'].includes(transaction.transaction_type)
                        ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {['deposit', 'sell', 'dividend'].includes(transaction.transaction_type) ? '+' : '-'}
                      {formatCash(transaction.amount, transaction.currency)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">
                      Bakiye: {formatCash(transaction.balance_after, transaction.currency)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showDepositModal && (
        <CashTransactionModal
          title="Para Yatır"
          actionLabel="Yatır"
          actionColor="green"
          currencies={SUPPORTED_CURRENCIES}
          selectedCurrency={selectedCurrency}
          onCurrencyChange={setSelectedCurrency}
          amount={amount}
          onAmountChange={setAmount}
          notes={notes}
          onNotesChange={setNotes}
          loading={loading}
          onConfirm={handleDeposit}
          onClose={() => { setShowDepositModal(false); setAmount(''); setNotes(''); setErrorMsg(null); }}
          currentBalance={balances.find(b => b.currency === selectedCurrency)?.balance}
          errorMsg={errorMsg}
        />
      )}

      {showWithdrawModal && (
        <CashTransactionModal
          title="Para Çek"
          actionLabel="Çek"
          actionColor="red"
          currencies={SUPPORTED_CURRENCIES}
          selectedCurrency={selectedCurrency}
          onCurrencyChange={setSelectedCurrency}
          amount={amount}
          onAmountChange={setAmount}
          notes={notes}
          onNotesChange={setNotes}
          loading={loading}
          onConfirm={handleWithdraw}
          onClose={() => { setShowWithdrawModal(false); setAmount(''); setNotes(''); setErrorMsg(null); }}
          currentBalance={balances.find(b => b.currency === selectedCurrency)?.balance}
          isWithdraw
          errorMsg={errorMsg}
        />
      )}
    </div>
  );
}

interface CashTransactionModalProps {
  title: string;
  actionLabel: string;
  actionColor: 'green' | 'red';
  currencies: typeof SUPPORTED_CURRENCIES;
  selectedCurrency: string;
  onCurrencyChange: (c: string) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
  currentBalance?: number;
  isWithdraw?: boolean;
  errorMsg?: string | null;
}

function CashTransactionModal({
  title, actionLabel, actionColor, currencies, selectedCurrency, onCurrencyChange,
  amount, onAmountChange, notes, onNotesChange, loading, onConfirm, onClose,
  currentBalance, isWithdraw, errorMsg,
}: CashTransactionModalProps) {
  const curInfo = currencies.find(c => c.code === selectedCurrency);
  const btnClass = actionColor === 'green'
    ? 'bg-green-600 hover:bg-green-700 disabled:opacity-50'
    : 'bg-red-600 hover:bg-red-700 disabled:opacity-50';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X size={22} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300 font-medium">{errorMsg}</p>
            </div>
          )}
          {isWithdraw && currentBalance !== undefined && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                Mevcut Bakiye: <strong>{currentBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {curInfo?.symbol || selectedCurrency}</strong>
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Para Birimi</label>
            <select
              value={selectedCurrency}
              onChange={e => onCurrencyChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {currencies.map(c => (
                <option key={c.code} value={c.code}>{c.symbol} {c.code} - {c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Miktar ({curInfo?.symbol || selectedCurrency})
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={e => onAmountChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Not (Opsiyonel)</label>
            <input
              type="text"
              value={notes}
              onChange={e => onNotesChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Örn: Maaş yatırımı"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
            >
              İptal
            </button>
            <button
              onClick={onConfirm}
              disabled={loading || !amount || parseFloat(amount) <= 0}
              className={`flex-1 px-4 py-2 text-white rounded-lg font-medium disabled:cursor-not-allowed ${btnClass}`}
            >
              {loading ? 'İşleniyor...' : actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
