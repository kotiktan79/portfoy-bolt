import { useState } from 'react';
import { Calculator, TrendingUp, TrendingDown } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { formatCurrency, formatPercentage } from '../services/priceService';

interface ScenarioAnalysisProps {
  holdings: Holding[];
  currentValue: number;
}

export function ScenarioAnalysis({ holdings, currentValue }: ScenarioAnalysisProps) {
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [action, setAction] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');

  const calculateScenario = () => {
    if (!selectedSymbol || !amount || !price) return null;

    const holding = holdings.find((h) => h.symbol === selectedSymbol);
    if (!holding) return null;

    const quantity = parseFloat(amount);
    const pricePerUnit = parseFloat(price);
    const totalCost = quantity * pricePerUnit;

    let newValue = currentValue;
    let newQuantity = holding.quantity;

    if (action === 'buy') {
      newValue += totalCost;
      newQuantity += quantity;
    } else {
      newValue -= totalCost;
      newQuantity -= quantity;
    }

    const currentPositionValue = holding.current_price * holding.quantity;
    const newPositionValue = holding.current_price * newQuantity;

    const valueChange = newValue - currentValue;
    const percentChange = (valueChange / currentValue) * 100;

    return {
      currentPositionValue,
      newPositionValue,
      newQuantity,
      newValue,
      valueChange,
      percentChange,
    };
  };

  const scenario = calculateScenario();

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex items-center gap-3 mb-4">
        <Calculator className="text-slate-700" size={24} />
        <h3 className="text-lg font-semibold text-slate-900">Senaryo Analizi</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Varlık</label>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Varlık Seçin</option>
            {holdings.map((holding) => (
              <option key={holding.id} value={holding.symbol}>
                {holding.symbol} - {holding.quantity} adet
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">İşlem Tipi</label>
          <div className="flex gap-3">
            <label className="flex-1 flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all hover:bg-slate-50">
              <input
                type="radio"
                value="buy"
                checked={action === 'buy'}
                onChange={(e) => setAction(e.target.value as 'buy')}
                className="mr-2"
              />
              <TrendingUp size={18} className="text-green-600 mr-1" />
              <span className="font-medium">Al</span>
            </label>
            <label className="flex-1 flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all hover:bg-slate-50">
              <input
                type="radio"
                value="sell"
                checked={action === 'sell'}
                onChange={(e) => setAction(e.target.value as 'sell')}
                className="mr-2"
              />
              <TrendingDown size={18} className="text-red-600 mr-1" />
              <span className="font-medium">Sat</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Miktar</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Fiyat</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {scenario && (
          <div className="mt-6 p-4 bg-gradient-to-br from-blue-50 to-slate-50 rounded-lg border-2 border-blue-200">
            <h4 className="font-semibold text-slate-900 mb-3">Sonuç:</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Mevcut Pozisyon Değeri:</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(scenario.currentPositionValue)} ₺
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Yeni Pozisyon Değeri:</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(scenario.newPositionValue)} ₺
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Yeni Miktar:</span>
                <span className="font-semibold text-slate-900">{scenario.newQuantity} adet</span>
              </div>
              <div className="h-px bg-slate-300 my-2"></div>
              <div className="flex justify-between">
                <span className="text-slate-600">Toplam Portföy Değeri:</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(scenario.newValue)} ₺
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Değişim:</span>
                <span
                  className={`font-bold ${
                    scenario.valueChange >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatCurrency(scenario.valueChange)} ₺ ({formatPercentage(scenario.percentChange)})
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
