import { useState } from 'react';
import { FileText, Download, Receipt } from 'lucide-react';
import { Holding } from '../lib/supabase';
import { getAllTransactions } from '../services/transactionService';

interface ReportGeneratorProps {
  holdings: Holding[];
  totalValue: number;
  totalPnL: number;
  onClose: () => void;
}

export function ReportGenerator({ holdings, totalValue, totalPnL, onClose }: ReportGeneratorProps) {
  const [reportType, setReportType] = useState<'portfolio' | 'tax'>('portfolio');
  const [generating, setGenerating] = useState(false);

  async function generatePortfolioReport() {
    setGenerating(true);

    const reportContent = `
PORTFÖY RAPORU
==========================================
Tarih: ${new Date().toLocaleDateString('tr-TR')}

ÖZET
----------------------------------------
Toplam Varlık: ${holdings.length}
Toplam Değer: ${totalValue.toFixed(2)} ₺
Kar/Zarar: ${totalPnL.toFixed(2)} ₺ (${((totalPnL / (totalValue - totalPnL)) * 100).toFixed(2)}%)

VARLIKLAR
----------------------------------------
${holdings.map(h => `
${h.symbol} (${h.asset_type})
  Miktar: ${h.quantity}
  Alış: ${h.purchase_price.toFixed(2)} ₺
  Güncel: ${h.current_price.toFixed(2)} ₺
  Değer: ${(h.current_price * h.quantity).toFixed(2)} ₺
  P/L: ${((h.current_price - h.purchase_price) * h.quantity).toFixed(2)} ₺
`).join('\n')}

==========================================
Bu rapor ${new Date().toLocaleString('tr-TR')} tarihinde oluşturulmuştur.
    `.trim();

    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    setGenerating(false);
  }

  async function generateTaxReport() {
    setGenerating(true);

    const transactions = await getAllTransactions();
    const sellTransactions = transactions.filter(t => t.transaction_type === 'sell');

    let totalProfit = 0;
    let totalLoss = 0;

    const reportContent = `
VERGİ RAPORU - ALIŞ/SATIŞ İŞLEMLERİ
==========================================
Tarih: ${new Date().toLocaleDateString('tr-TR')}
Dönem: ${new Date().getFullYear()}

İŞLEM DETAYLARI
----------------------------------------
${sellTransactions.map(t => {
  const pnl = t.total_amount;
  if (pnl > 0) totalProfit += pnl;
  else totalLoss += Math.abs(pnl);

  return `
${new Date(t.created_at).toLocaleDateString('tr-TR')}
Varlık: ${t.holding_id}
Miktar: ${t.quantity}
Fiyat: ${t.price.toFixed(2)} ₺
Tutar: ${t.total_amount.toFixed(2)} ₺
Kar/Zarar: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ₺
`;
}).join('\n')}

ÖZET
----------------------------------------
Toplam Kar: ${totalProfit.toFixed(2)} ₺
Toplam Zarar: ${totalLoss.toFixed(2)} ₺
Net: ${(totalProfit - totalLoss).toFixed(2)} ₺

Toplam İşlem: ${sellTransactions.length}

==========================================
DİKKAT: Bu rapor bilgilendirme amaçlıdır.
Resmi beyanname için mali müşavirinize danışın.
    `.trim();

    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tax-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    setGenerating(false);
  }

  async function handleGenerate() {
    if (reportType === 'portfolio') {
      await generatePortfolioReport();
    } else {
      await generateTaxReport();
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="text-white" size={24} />
            <h2 className="text-xl font-bold text-white">Rapor Oluştur</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">
              Rapor Tipi
            </label>
            <div className="space-y-2">
              <button
                onClick={() => setReportType('portfolio')}
                className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                  reportType === 'portfolio'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-slate-200 dark:border-gray-700 hover:border-blue-300'
                }`}
              >
                <FileText
                  className={reportType === 'portfolio' ? 'text-blue-600' : 'text-slate-400'}
                  size={24}
                />
                <div className="text-left">
                  <p className="font-semibold text-slate-900 dark:text-white">Portföy Raporu</p>
                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    Detaylı portföy analizi
                  </p>
                </div>
              </button>

              <button
                onClick={() => setReportType('tax')}
                className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                  reportType === 'tax'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-slate-200 dark:border-gray-700 hover:border-blue-300'
                }`}
              >
                <Receipt
                  className={reportType === 'tax' ? 'text-blue-600' : 'text-slate-400'}
                  size={24}
                />
                <div className="text-left">
                  <p className="font-semibold text-slate-900 dark:text-white">Vergi Raporu</p>
                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    Alış/satış işlem özeti
                  </p>
                </div>
              </button>
            </div>
          </div>

          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <strong>Not:</strong> Raporlar TXT formatında indirilecektir. PDF desteği yakında eklenecek.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-gray-700 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-lg transition-all"
          >
            İptal
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
          >
            <Download size={18} />
            {generating ? 'Oluşturuluyor...' : 'İndir'}
          </button>
        </div>
      </div>
    </div>
  );
}
