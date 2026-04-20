import { useState, useCallback } from 'react';
import { Shield, Key, Lock, CheckCircle, Copy } from 'lucide-react';

interface Security2FAProps {
  onClose: () => void;
  onEnable: () => void;
}

const LS_PIN_HASH = 'portfolio_pin_hash';
const LS_BACKUP_CODES_HASH = 'portfolio_backup_codes_hash';

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => chars[b % chars.length])
    .join('');
}

export async function verifyPin(pin: string): Promise<boolean> {
  const storedHash = localStorage.getItem(LS_PIN_HASH);
  if (!storedHash) return false;
  const inputHash = await sha256(pin);
  return inputHash === storedHash;
}

export function isPinEnabled(): boolean {
  return localStorage.getItem(LS_PIN_HASH) !== null;
}

export function clearPin(): void {
  localStorage.removeItem(LS_PIN_HASH);
  localStorage.removeItem(LS_BACKUP_CODES_HASH);
}

export function Security2FA({ onClose, onEnable }: Security2FAProps) {
  const [step, setStep] = useState<'intro' | 'set_pin' | 'confirm_pin' | 'complete'>('intro');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleStartSetup = useCallback(() => {
    setPin('');
    setConfirmPin('');
    setError('');
    setStep('set_pin');
  }, []);

  const handlePinSet = useCallback(() => {
    if (pin.length !== 6) {
      setError('PIN 6 haneli olmalıdır');
      return;
    }
    setError('');
    setStep('confirm_pin');
  }, [pin]);

  const handleConfirmPin = useCallback(async () => {
    if (confirmPin !== pin) {
      setError('PIN\'ler eşleşmiyor. Tekrar deneyin.');
      setConfirmPin('');
      return;
    }

    try {
      const pinHash = await sha256(pin);
      localStorage.setItem(LS_PIN_HASH, pinHash);

      const codes = Array.from({ length: 5 }, () => generateRandomCode());
      setBackupCodes(codes);

      const codeHashes = await Promise.all(codes.map((c) => sha256(c)));
      localStorage.setItem(LS_BACKUP_CODES_HASH, JSON.stringify(codeHashes));

      setStep('complete');
      setTimeout(() => {
        onEnable();
        onClose();
      }, 3000);
    } catch {
      setError('PIN kaydedilirken bir hata oluştu.');
    }
  }, [confirmPin, pin, onEnable, onClose]);

  const copyBackupCodes = useCallback(() => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [backupCodes]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="text-white" size={24} />
            <h2 className="text-xl font-bold text-white">PIN Güvenlik Kilidi</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-all"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {step === 'intro' && (
            <div className="space-y-6">
              <div className="text-center">
                <Lock className="mx-auto text-green-600 mb-4" size={64} />
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  Portföyünüzü Koruyun
                </h3>
                <p className="text-sm text-slate-600 dark:text-gray-400">
                  6 haneli bir güvenlik PIN'i belirleyerek portföy verilerinize yetkisiz
                  erişimi engelleyin.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
                  <Lock className="text-brand-600 flex-shrink-0 mt-1" size={20} />
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                      Yerel PIN Koruması
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-gray-400">
                      6 haneli güvenlik PIN'inizi belirleyin, verileriniz cihazınızda güvende kalsın
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <Key className="text-green-600 flex-shrink-0 mt-1" size={20} />
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                      Yedek Kodlar
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-gray-400">
                      PIN'inizi unutmanız durumunda kullanabileceğiniz 5 adet yedek kod
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleStartSetup}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
              >
                <Shield size={20} />
                PIN Belirle
              </button>
            </div>
          )}

          {step === 'set_pin' && (
            <div className="space-y-6">
              <div className="text-center">
                <Lock className="mx-auto text-green-600 mb-4" size={48} />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                  PIN Belirleyin
                </h3>
                <p className="text-sm text-slate-600 dark:text-gray-400">
                  6 haneli güvenlik PIN'inizi belirleyin
                </p>
              </div>

              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => {
                    setError('');
                    setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                  }}
                  placeholder="------"
                  className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest rounded-lg border-2 border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-white focus:border-green-500 focus:ring-2 focus:ring-green-500"
                  maxLength={6}
                  autoFocus
                />
                {error && (
                  <p className="text-sm text-red-600 mt-2 text-center">{error}</p>
                )}
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-2 text-center">
                  Sadece rakam, 6 haneli
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('intro'); setPin(''); setError(''); }}
                  className="flex-1 px-6 py-3 border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-300 rounded-lg font-semibold transition-all hover:bg-slate-50 dark:hover:bg-gray-700"
                >
                  Geri
                </button>
                <button
                  onClick={handlePinSet}
                  disabled={pin.length !== 6}
                  className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Devam
                </button>
              </div>
            </div>
          )}

          {step === 'confirm_pin' && (
            <div className="space-y-6">
              <div className="text-center">
                <Key className="mx-auto text-green-600 mb-4" size={48} />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                  PIN'i Onaylayın
                </h3>
                <p className="text-sm text-slate-600 dark:text-gray-400">
                  Güvenlik PIN'inizi tekrar girin
                </p>
              </div>

              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  value={confirmPin}
                  onChange={(e) => {
                    setError('');
                    setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                  }}
                  placeholder="------"
                  className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest rounded-lg border-2 border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-white focus:border-green-500 focus:ring-2 focus:ring-green-500"
                  maxLength={6}
                  autoFocus
                />
                {error && (
                  <p className="text-sm text-red-600 mt-2 text-center">{error}</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('set_pin'); setConfirmPin(''); setError(''); }}
                  className="flex-1 px-6 py-3 border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-300 rounded-lg font-semibold transition-all hover:bg-slate-50 dark:hover:bg-gray-700"
                >
                  Geri
                </button>
                <button
                  onClick={handleConfirmPin}
                  disabled={confirmPin.length !== 6}
                  className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Onayla ve Etkinleştir
                </button>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="space-y-6">
              <div className="text-center">
                <CheckCircle className="mx-auto text-green-600 mb-4" size={64} />
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  PIN Güvenlik Kilidi Etkinleştirildi!
                </h3>
                <p className="text-sm text-slate-600 dark:text-gray-400">
                  Portföyünüz artık PIN ile korunuyor
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
                  Yedek Kodlarınız
                </h4>
                <div className="p-4 bg-slate-50 dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-slate-600 dark:text-gray-400">
                      Bu kodları güvenli bir yerde saklayın
                    </p>
                    <button
                      onClick={copyBackupCodes}
                      className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                    >
                      <Copy size={14} />
                      {copied ? 'Kopyalandı!' : 'Kopyala'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                    {backupCodes.map((code, idx) => (
                      <div
                        key={idx}
                        className="px-2 py-1 bg-white dark:bg-gray-800 rounded border border-slate-200 dark:border-gray-700 text-center text-slate-900 dark:text-white"
                      >
                        {code}
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 text-center font-medium">
                  Bu kodlar bir daha gösterilmeyecek!
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
