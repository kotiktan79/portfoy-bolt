import { useState } from 'react';
import { Shield, Key, Smartphone, CheckCircle, Copy } from 'lucide-react';

interface Security2FAProps {
  onClose: () => void;
  onEnable: () => void;
}

export function Security2FA({ onClose, onEnable }: Security2FAProps) {
  const [step, setStep] = useState<'intro' | 'setup' | 'verify' | 'complete'>('intro');
  const [qrCode, setQrCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');

  function generateQRCode() {
    const secret = 'JBSWY3DPEHPK3PXP';
    const issuer = 'PortfolioTracker';
    const user = 'user@example.com';
    const otpauthUrl = `otpauth://totp/${issuer}:${user}?secret=${secret}&issuer=${issuer}`;
    setQrCode(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`);
  }

  function generateBackupCodes() {
    const codes = Array.from({ length: 10 }, () => {
      return Math.random().toString(36).substring(2, 10).toUpperCase();
    });
    setBackupCodes(codes);
  }

  function handleSetup() {
    generateQRCode();
    generateBackupCodes();
    setStep('setup');
  }

  function handleVerify() {
    if (verificationCode.length !== 6) {
      setError('Lütfen 6 haneli kodu girin');
      return;
    }

    if (verificationCode === '123456') {
      setStep('complete');
      setTimeout(() => {
        onEnable();
        onClose();
      }, 2000);
    } else {
      setError('Geçersiz kod. Demo için 123456 kullanın.');
    }
  }

  function copyBackupCodes() {
    navigator.clipboard.writeText(backupCodes.join('\n'));
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="text-white" size={24} />
            <h2 className="text-xl font-bold text-white">İki Faktörlü Doğrulama</h2>
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
                <Shield className="mx-auto text-green-600 mb-4" size={64} />
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  Hesabınızı Güvende Tutun
                </h3>
                <p className="text-sm text-slate-600 dark:text-gray-400">
                  2FA, hesabınıza ekstra bir güvenlik katmanı ekler. Giriş yaparken şifrenizin
                  yanı sıra telefonunuzdaki bir kod da gerekir.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <Smartphone className="text-blue-600 flex-shrink-0 mt-1" size={20} />
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                      Authenticator Uygulaması
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-gray-400">
                      Google Authenticator veya Authy gibi bir uygulama kullanın
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
                      Telefonunuzu kaybetmeniz durumunda kullanabileceğiniz kodlar
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSetup}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
              >
                <Shield size={20} />
                2FA'yı Etkinleştir
              </button>
            </div>
          )}

          {step === 'setup' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                  1. QR Kodu Tarayın
                </h3>
                <div className="flex justify-center mb-4">
                  <img
                    src={qrCode}
                    alt="QR Code"
                    className="w-48 h-48 rounded-lg border-4 border-slate-200 dark:border-gray-700"
                  />
                </div>
                <p className="text-sm text-slate-600 dark:text-gray-400 text-center">
                  Authenticator uygulamanızla bu QR kodu tarayın
                </p>
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                  2. Yedek Kodlarınız
                </h3>
                <div className="p-4 bg-slate-50 dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-600 dark:text-gray-400">
                      Bu kodları güvenli bir yerde saklayın
                    </p>
                    <button
                      onClick={copyBackupCodes}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                    >
                      <Copy size={14} />
                      Kopyala
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                    {backupCodes.map((code, idx) => (
                      <div
                        key={idx}
                        className="px-2 py-1 bg-white dark:bg-gray-800 rounded border border-slate-200 dark:border-gray-700 text-center"
                      >
                        {code}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep('verify')}
                className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all"
              >
                Devam Et
              </button>
            </div>
          )}

          {step === 'verify' && (
            <div className="space-y-6">
              <div className="text-center">
                <Key className="mx-auto text-green-600 mb-4" size={48} />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                  Kodu Doğrulayın
                </h3>
                <p className="text-sm text-slate-600 dark:text-gray-400">
                  Authenticator uygulamanızdaki 6 haneli kodu girin
                </p>
              </div>

              <div>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => {
                    setError('');
                    setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  }}
                  placeholder="000000"
                  className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest rounded-lg border-2 border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-white focus:border-green-500 focus:ring-2 focus:ring-green-500"
                  maxLength={6}
                />
                {error && (
                  <p className="text-sm text-red-600 mt-2 text-center">{error}</p>
                )}
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-2 text-center">
                  Demo: 123456 kodunu kullanın
                </p>
              </div>

              <button
                onClick={handleVerify}
                disabled={verificationCode.length !== 6}
                className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Doğrula ve Etkinleştir
              </button>
            </div>
          )}

          {step === 'complete' && (
            <div className="text-center py-8">
              <CheckCircle className="mx-auto text-green-600 mb-4" size={64} />
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                2FA Etkinleştirildi!
              </h3>
              <p className="text-sm text-slate-600 dark:text-gray-400">
                Hesabınız artık iki faktörlü doğrulama ile korunuyor
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
