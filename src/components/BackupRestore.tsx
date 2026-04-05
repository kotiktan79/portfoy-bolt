import { useState } from 'react';
import { Download, Upload, Database, Shield, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface BackupRestoreProps {
  onClose: () => void;
  onComplete: () => void;
}

export function BackupRestore({ onClose, onComplete }: BackupRestoreProps) {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore'>('backup');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');

  async function handleBackup() {
    setProcessing(true);
    setMessage('');

    try {
      const { data: holdings, error: holdingsError } = await supabase
        .from('holdings')
        .select('*');

      if (holdingsError) throw holdingsError;

      const { data: transactions, error: transactionsError } = await supabase
        .from('transactions')
        .select('*');

      if (transactionsError) throw transactionsError;

      const { data: alerts, error: alertsError } = await supabase
        .from('price_alerts')
        .select('*');

      if (alertsError) throw alertsError;

      const { data: snapshots, error: snapshotsError } = await supabase
        .from('portfolio_snapshots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (snapshotsError) throw snapshotsError;

      const backup = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: {
          holdings: holdings || [],
          transactions: transactions || [],
          alerts: alerts || [],
          snapshots: snapshots || [],
        },
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setMessage('Yedekleme başarıyla tamamlandı!');
      setTimeout(() => {
        onComplete();
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Backup error:', error);
      setMessage('Yedekleme sırasında hata oluştu!');
    }

    setProcessing(false);
  }

  async function handleRestore(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    setMessage('');

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.version || !backup.data) {
        throw new Error('Geçersiz yedekleme dosyası');
      }

      const { holdings, transactions, alerts } = backup.data;

      if (holdings && holdings.length > 0) {
        const { error: holdingsError } = await supabase
          .from('holdings')
          .upsert(holdings, { onConflict: 'id' });

        if (holdingsError) throw holdingsError;
      }

      if (transactions && transactions.length > 0) {
        const { error: transactionsError } = await supabase
          .from('transactions')
          .upsert(transactions, { onConflict: 'id' });

        if (transactionsError) throw transactionsError;
      }

      if (alerts && alerts.length > 0) {
        const { error: alertsError } = await supabase
          .from('price_alerts')
          .upsert(alerts, { onConflict: 'id' });

        if (alertsError) throw alertsError;
      }

      setMessage('Geri yükleme başarıyla tamamlandı!');
      setTimeout(() => {
        onComplete();
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Restore error:', error);
      setMessage('Geri yükleme sırasında hata oluştu!');
    }

    setProcessing(false);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="text-white" size={24} />
            <h2 className="text-xl font-bold text-white">Yedekleme & Geri Yükleme</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b border-slate-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('backup')}
            className={`flex-1 px-4 py-3 font-medium text-sm transition-all ${
              activeTab === 'backup'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                : 'text-slate-600 dark:text-gray-400'
            }`}
          >
            <Download className="inline mr-2" size={16} />
            Yedekle
          </button>
          <button
            onClick={() => setActiveTab('restore')}
            className={`flex-1 px-4 py-3 font-medium text-sm transition-all ${
              activeTab === 'restore'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                : 'text-slate-600 dark:text-gray-400'
            }`}
          >
            <Upload className="inline mr-2" size={16} />
            Geri Yükle
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'backup' ? (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                <div className="flex items-start gap-3">
                  <Shield className="text-blue-600 flex-shrink-0 mt-1" size={20} />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                      Yedekleme İçeriği
                    </h4>
                    <ul className="text-xs text-slate-600 dark:text-gray-400 space-y-1">
                      <li>✓ Tüm varlıklarınız</li>
                      <li>✓ İşlem geçmişi</li>
                      <li>✓ Fiyat alarmları</li>
                      <li>✓ Portföy görüntüleri</li>
                    </ul>
                  </div>
                </div>
              </div>

              <button
                onClick={handleBackup}
                disabled={processing}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
              >
                <Download size={20} />
                {processing ? 'Yedekleniyor...' : 'Yedekle'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
                <div className="flex items-start gap-3">
                  <Shield className="text-amber-600 flex-shrink-0 mt-1" size={20} />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                      ⚠️ Dikkat
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-gray-400">
                      Geri yükleme mevcut verilerinizle birleştirilecek. Aynı ID'ye sahip
                      kayıtlar güncellenecektir.
                    </p>
                  </div>
                </div>
              </div>

              <label className="block">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestore}
                  disabled={processing}
                  className="hidden"
                  id="restore-file"
                />
                <label
                  htmlFor="restore-file"
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl cursor-pointer disabled:opacity-50"
                >
                  <Upload size={20} />
                  {processing ? 'Geri Yükleniyor...' : 'Dosya Seç'}
                </label>
              </label>
            </div>
          )}

          {message && (
            <div
              className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
                message.includes('başarıyla')
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
              }`}
            >
              {message.includes('başarıyla') && <CheckCircle size={20} />}
              <span className="text-sm font-medium">{message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
