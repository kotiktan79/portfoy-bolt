import { useState } from 'react';
import { Download, Upload, X, FileJson, FileSpreadsheet } from 'lucide-react';
import {
  exportPortfolioToJSON,
  exportHoldingsToCSV,
  exportTransactionsToCSV,
  importPortfolioFromJSON,
} from '../services/exportService';

interface ExportImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export function ExportImportModal({ isOpen, onClose, onImportComplete }: ExportImportModalProps) {
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleExportJSON = async () => {
    try {
      await exportPortfolioToJSON();
      setImportMessage({ type: 'success', text: 'JSON başarıyla dışa aktarıldı!' });
      setTimeout(() => setImportMessage(null), 3000);
    } catch (error) {
      setImportMessage({ type: 'error', text: 'Export failed: ' + (error instanceof Error ? error.message : 'Unknown error') });
    }
  };

  const handleExportHoldingsCSV = async () => {
    try {
      await exportHoldingsToCSV();
      setImportMessage({ type: 'success', text: 'Holdings CSV başarıyla dışa aktarıldı!' });
      setTimeout(() => setImportMessage(null), 3000);
    } catch (error) {
      setImportMessage({ type: 'error', text: 'Export failed: ' + (error instanceof Error ? error.message : 'Unknown error') });
    }
  };

  const handleExportTransactionsCSV = async () => {
    try {
      await exportTransactionsToCSV();
      setImportMessage({ type: 'success', text: 'Transactions CSV başarıyla dışa aktarıldı!' });
      setTimeout(() => setImportMessage(null), 3000);
    } catch (error) {
      setImportMessage({ type: 'error', text: 'Export failed: ' + (error instanceof Error ? error.message : 'Unknown error') });
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportMessage(null);

    const result = await importPortfolioFromJSON(file);

    setImporting(false);
    setImportMessage({
      type: result.success ? 'success' : 'error',
      text: result.message,
    });

    if (result.success) {
      setTimeout(() => {
        onImportComplete();
        onClose();
      }, 2000);
    }

    event.target.value = '';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-gray-100">Dışa Aktar / İçe Aktar</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-gray-200 mb-3 flex items-center gap-2">
              <Download className="w-5 h-5" />
              Dışa Aktar
            </h3>
            <div className="space-y-3">
              <button
                onClick={handleExportJSON}
                className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileJson className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <div className="text-left">
                    <div className="font-medium text-slate-800 dark:text-gray-200">Tam Yedek (JSON)</div>
                    <div className="text-sm text-slate-600 dark:text-gray-400">Holdings + İşlemler</div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={handleExportHoldingsCSV}
                className="w-full flex items-center justify-between px-4 py-3 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <div className="text-left">
                    <div className="font-medium text-slate-800 dark:text-gray-200">Holdings (CSV)</div>
                    <div className="text-sm text-slate-600 dark:text-gray-400">Excel uyumlu</div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={handleExportTransactionsCSV}
                className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <div className="text-left">
                    <div className="font-medium text-slate-800 dark:text-gray-200">İşlemler (CSV)</div>
                    <div className="text-sm text-slate-600 dark:text-gray-400">Tüm işlem geçmişi</div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>

          <div className="border-t dark:border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-slate-700 dark:text-gray-200 mb-3 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              İçe Aktar
            </h3>
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4 mb-4">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                ⚠️ İçe aktarma mevcut verileri silmez, sadece yeni kayıtlar ekler.
              </p>
            </div>
            <label className="block">
              <div className="w-full px-4 py-3 border-2 border-dashed border-slate-300 dark:border-gray-600 hover:border-slate-400 dark:hover:border-gray-500 rounded-lg cursor-pointer transition-colors text-center">
                <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400 dark:text-gray-500" />
                <div className="font-medium text-slate-700 dark:text-gray-300">
                  {importing ? 'İçe aktarılıyor...' : 'JSON dosyası seç veya sürükle'}
                </div>
                <div className="text-sm text-slate-500 dark:text-gray-400 mt-1">
                  Sadece .json dosyaları desteklenir
                </div>
              </div>
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                disabled={importing}
                className="hidden"
              />
            </label>

            {importMessage && (
              <div
                className={`mt-4 p-4 rounded-lg ${
                  importMessage.type === 'success'
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-700'
                    : 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700'
                }`}
              >
                {importMessage.text}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
