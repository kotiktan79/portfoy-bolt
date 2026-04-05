import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Language, setLanguage as setLangStorage, getLanguage, translations } from '../lib/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLang] = useState<Language>(getLanguage());

  const setLanguage = useCallback((lang: Language) => {
    setLang(lang);
    setLangStorage(lang);
  }, []);

  const t = useCallback((key: string): string => {
    const translation = translations[key];
    if (!translation) return key;
    return translation[language] || translation.tr || key;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
