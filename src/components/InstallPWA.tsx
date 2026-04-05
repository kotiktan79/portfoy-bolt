import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { promptInstall, canInstall, isStandalone, isIOS } from '../services/pwaService';

export default function InstallPWA() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      return;
    }

    if (isIOS()) {
      const hasSeenIOSPrompt = localStorage.getItem('ios-install-prompt-seen');
      if (!hasSeenIOSPrompt) {
        setShowIOSInstructions(true);
      }
    } else {
      const timer = setTimeout(() => {
        if (canInstall()) {
          setShowPrompt(true);
        }
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, []);

  const handleInstall = async () => {
    const installed = await promptInstall();
    if (installed) {
      setShowPrompt(false);
    }
  };

  const dismissPrompt = () => {
    setShowPrompt(false);
    localStorage.setItem('install-prompt-dismissed', Date.now().toString());
  };

  const dismissIOSInstructions = () => {
    setShowIOSInstructions(false);
    localStorage.setItem('ios-install-prompt-seen', 'true');
  };

  if (showIOSInstructions) {
    return (
      <div className="fixed bottom-20 left-4 right-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl shadow-2xl p-6 z-50 animate-slide-up">
        <button
          onClick={dismissIOSInstructions}
          className="absolute top-3 right-3 p-1 hover:bg-white/20 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4">
          <div className="p-3 bg-white/20 rounded-xl">
            <Smartphone className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold mb-2">Ana Ekrana Ekle</h3>
            <p className="text-sm text-blue-100 mb-3">
              Uygulamayı iPhone'unuza yükleyin:
            </p>
            <ol className="text-sm space-y-2 text-blue-100">
              <li className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 bg-white/20 rounded-full text-xs font-bold">1</span>
                Safari'de paylaş butonuna dokunun
              </li>
              <li className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 bg-white/20 rounded-full text-xs font-bold">2</span>
                "Ana Ekrana Ekle" seçeneğini bulun
              </li>
              <li className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 bg-white/20 rounded-full text-xs font-bold">3</span>
                "Ekle" butonuna dokunun
              </li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  if (!showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 md:bottom-4 md:left-auto md:right-4 md:w-96 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl shadow-2xl p-6 z-50 animate-slide-up">
      <button
        onClick={dismissPrompt}
        className="absolute top-3 right-3 p-1 hover:bg-white/20 rounded-full transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="flex items-start gap-4 mb-4">
        <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
          <Download className="w-8 h-8" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold mb-1">Uygulamayı Yükle</h3>
          <p className="text-sm text-blue-100">
            Portföy Takip uygulamasını telefonunuza yükleyin ve offline kullanın!
          </p>
        </div>
      </div>

      <div className="space-y-2 mb-4 text-sm text-blue-100">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-xs">✓</span>
          Offline çalışma desteği
        </div>
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-xs">✓</span>
          Push bildirimleri
        </div>
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-xs">✓</span>
          Hızlı erişim
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={dismissPrompt}
          className="flex-1 px-4 py-3 bg-white/20 hover:bg-white/30 rounded-xl font-semibold transition-colors"
        >
          Sonra
        </button>
        <button
          onClick={handleInstall}
          className="flex-1 px-4 py-3 bg-white text-blue-600 hover:bg-blue-50 rounded-xl font-semibold transition-colors shadow-lg"
        >
          Yükle
        </button>
      </div>
    </div>
  );
}
