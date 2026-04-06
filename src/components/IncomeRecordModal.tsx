import { useState } from 'react';
import { X, DollarSign, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface IncomeRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  holdings?: Array<{ symbol: string; asset_type: string }>;
}

const INCOME_TYPES = [
  { value: 'dividend', label: 'Temettü', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'interest', label: 'Faiz', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'staking', label: 'Staking', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  { value: 'coupon', label: 'Kupon', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'profit_taking', label: 'Kâr Realizasyonu', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  { value: 'other', label: 'Diğer', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
];

const CURRENCIES = ['TRY', 'USD', 'EUR'];

export default function IncomeRecordModal({ isOpen, onClose, onSaved, holdings = [] }: IncomeRecordModalProps) {
  const [incomeType, setIncomeType] = useState('dividend');
  const [sourceSymbol, setSourceSymbol] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('TRY');
  const [amountTry, setAmountTry] = useState('');
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isProjected, setIsProjected] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleCurrencyChange = (newCurrency: string) => {
    setCurrency(newCurrency);
    if (newCurrency === 'TRY' && amount) {
      setAmountTry(amount);
    }
  };

  const handleAmountChange = (val: string) => {
    setAmount(val);
    if (currency === 'TRY') setAmountTry(val);
  };

  const handleSave = async () => {
    if (!amount || !amountTry) return;
    setSaving(true);

    const selectedHolding = holdings.find(h => h.symbol === sourceSymbol);

    const { error } = await supabase.from('income_records').insert([{
      income_date: incomeDate,
      income_type: incomeType,
      source_symbol: sourceSymbol || null,
      source_asset_type: selectedHolding?.asset_type || null,
      amount: parseFloat(amount),
      currency,
      amount_try: parseFloat(amountTry),
      notes: notes || null,
      is_projected: isProjected,
    }]);

    setSaving(false);

    if (!error) {
      // Aylık maaş tablosunu güncelle
      await updateMonthlySalary(incomeDate, incomeType, parseFloat(amountTry));
      onSaved();
      resetForm();
      onClose();
    }
  };

  const resetForm = () => {
    setIncomeType('dividend');
    setSourceSymbol('');
    setAmount('');
    setCurrency('TRY');
    setAmountTry('');
    setIncomeDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setIsProjected(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Gelir Kaydet</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Gelir Tipi */}
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Gelir Tipi</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {INCOME_TYPES.map(type => (
                <button
                  key={type.value}
                  onClick={() => setIncomeType(type.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    incomeType === type.value
                      ? type.color + ' ring-2 ring-offset-1 ring-blue-400'
                      : 'bg-slate-100 dark:bg-gray-800 text-gray-500'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Kaynak Varlık */}
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kaynak Varlık</label>
            <select
              value={sourceSymbol}
              onChange={e => setSourceSymbol(e.target.value)}
              className="w-full mt-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
            >
              <option value="">Seçiniz (opsiyonel)</option>
              {holdings.map(h => (
                <option key={h.symbol} value={h.symbol}>{h.symbol}</option>
              ))}
            </select>
          </div>

          {/* Tutar + Para Birimi */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tutar</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={e => handleAmountChange(e.target.value)}
                placeholder="0.00"
                className="w-full mt-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Birim</label>
              <select
                value={currency}
                onChange={e => handleCurrencyChange(e.target.value)}
                className="w-full mt-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* TRY Karşılığı (farklı para biriminde ise) */}
          {currency !== 'TRY' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">TL Karşılığı</label>
              <input
                type="number"
                step="0.01"
                value={amountTry}
                onChange={e => setAmountTry(e.target.value)}
                placeholder="TL tutarı girin"
                className="w-full mt-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              />
            </div>
          )}

          {/* Tarih */}
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tarih</label>
            <input
              type="date"
              value={incomeDate}
              onChange={e => setIncomeDate(e.target.value)}
              className="w-full mt-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
            />
          </div>

          {/* Notlar */}
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notlar</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Opsiyonel açıklama"
              className="w-full mt-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
            />
          </div>

          {/* Tahmini mi? */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isProjected}
              onChange={e => setIsProjected(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">Bu tahmini/planlanan bir gelir (henüz gerçekleşmedi)</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-slate-200 dark:border-gray-800">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800">
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !amount || !amountTry}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Aylık maaş tablosunu güncelle
async function updateMonthlySalary(incomeDate: string, incomeType: string, amountTry: number) {
  const monthStart = `${incomeDate.substring(0, 7)}-01`;

  // Mevcut kaydı çek
  const { data: existing } = await supabase
    .from('monthly_salary')
    .select('*')
    .eq('salary_month', monthStart)
    .single();

  if (existing) {
    const fieldMap: Record<string, string> = {
      dividend: 'dividend_income',
      interest: 'interest_income',
      staking: 'staking_income',
      coupon: 'coupon_income',
      profit_taking: 'profit_taking_income',
    };
    const field = fieldMap[incomeType];
    if (field) {
      const currentVal = (existing as any)[field] || 0;
      await supabase
        .from('monthly_salary')
        .update({
          [field]: currentVal + amountTry,
          actual_income: (existing.actual_income || 0) + amountTry,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }
  } else {
    const fieldMap: Record<string, string> = {
      dividend: 'dividend_income',
      interest: 'interest_income',
      staking: 'staking_income',
      coupon: 'coupon_income',
      profit_taking: 'profit_taking_income',
    };
    const field = fieldMap[incomeType] || 'dividend_income';
    await supabase.from('monthly_salary').insert([{
      salary_month: monthStart,
      portfolio_value: 0,
      safe_amount: 0,
      moderate_amount: 0,
      actual_income: amountTry,
      [field]: amountTry,
    }]);
  }
}
