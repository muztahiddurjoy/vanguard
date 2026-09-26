import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language } from '../types';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (bnText: string, enText: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'bn',
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (bnText, _enText) => bnText,
});

export const LanguageProvider: React.FC<{
  children: React.ReactNode;
  initialLanguage?: Language;
}> = ({ children, initialLanguage = 'bn' }) => {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('dla_preferred_language');
      if (saved === 'en' || saved === 'bn') return saved;
    } catch {
      // Fallback
    }
    return initialLanguage;
  });

  useEffect(() => {
    try {
      localStorage.setItem('dla_preferred_language', language);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [language]);

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === 'bn' ? 'en' : 'bn'));
  };

  const t = (bnText: string, enText: string) => (language === 'bn' ? bnText : enText);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
