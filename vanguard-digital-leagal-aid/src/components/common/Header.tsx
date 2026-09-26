import React, { useState } from 'react';
import { UserRole, Language } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { PWAInstallButton } from './PWAInstallButton';
import { 
  Scale, 
  Building2, 
  Smartphone, 
  UserCheck, 
  Briefcase,
  Wifi, 
  WifiOff, 
  PhoneCall,
  RotateCcw,
  ShieldAlert,
  ChevronDown,
  Layers,
  X
} from 'lucide-react';
import { resetDemoData } from '../../utils/storage';

interface HeaderProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  isOnline: boolean;
  simulatedOffline: boolean;
  onToggleSimulatedNetwork: (offline: boolean) => void;
  language?: Language;
  onLanguageChange?: (lang: Language) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  isOnline,
  simulatedOffline,
  onToggleSimulatedNetwork,
  language: propLanguage,
  onLanguageChange: propOnLanguageChange,
}) => {
  const [showRoleDrawer, setShowRoleDrawer] = useState(false);
  const context = useLanguage();
  const language = propLanguage || context.language;
  const onLanguageChange = propOnLanguageChange || context.setLanguage;

  const rolesConfig: {
    role: UserRole;
    title: string;
    subtitle: string;
    icon: React.FC<{ className?: string }>;
    accentColor: string;
  }[] = [
    {
      role: 'dlao',
      title: language === 'bn' ? 'জেলা লিগ্যাল এইড কর্মকর্তা' : 'DLAO Admin',
      subtitle: language === 'bn' ? 'আবেদন ব্যাকলগ ও তাৎক্ষণিক ঝুঁকি মূল্যায়ন' : 'Case backlog triage & risk assessment',
      icon: Building2,
      accentColor: 'text-emerald-400',
    },
    {
      role: 'udc',
      title: language === 'bn' ? 'ইউডিসি উদ্যোক্তা' : 'UDC Intake',
      subtitle: language === 'bn' ? 'অফলাইন-ফার্স্ট সহকারী অভিযোগ এন্ট্রি ও অডিও' : 'Offline-first assisted intake & audio memo',
      icon: Smartphone,
      accentColor: 'text-blue-400',
    },
    {
      role: 'citizen',
      title: language === 'bn' ? 'নাগরিক ও প্রক্সি' : 'Citizen & Proxy',
      subtitle: language === 'bn' ? 'সহজ অডিও বিবরণ ও আবেদন ট্র্যাকিং' : 'Audio guidance & live case tracking',
      icon: UserCheck,
      accentColor: 'text-purple-400',
    },
    {
      role: 'mediator',
      title: language === 'bn' ? 'সালিশ ও মধ্যস্থতা' : 'ADR Mediator',
      subtitle: language === 'bn' ? 'এআই সমঝোতা খসড়া ও দ্বি-পক্ষীয় ই-স্বাক্ষর' : 'AI settlement deed & e-signature',
      icon: Scale,
      accentColor: 'text-teal-400',
    },
    {
      role: 'lawyer',
      title: language === 'bn' ? 'প্যানেল আইনজীবী' : 'Panel Lawyer',
      subtitle: language === 'bn' ? 'মামলা অগ্রগতি ও আদালতের আদেশের রিপোর্ট' : 'Case progress & court order reporting',
      icon: Briefcase,
      accentColor: 'text-amber-400',
    },
  ];

  const currentRoleInfo = rolesConfig.find((r) => r.role === currentRole) || rolesConfig[0];
  const CurrentIcon = currentRoleInfo.icon;

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md">
        {/* Top micro-bar: Government info & Hotline */}
        <div className="bg-emerald-950 border-b border-emerald-900/60 px-3 sm:px-4 py-1 text-xs text-emerald-200">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-600 border border-emerald-400 shrink-0" />
              <span className="font-semibold text-white tracking-wide truncate text-[11px] sm:text-xs">
                {language === 'bn' ? 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার' : "Govt. of the People's Republic of Bangladesh"}
              </span>
              <span className="text-emerald-400 hidden sm:inline">|</span>
              <span className="hidden md:inline truncate text-[11px] sm:text-xs text-emerald-300">
                {language === 'bn' ? 'জাতীয় আইনগত সহায়তা প্রদান সংস্থা (NLASO)' : 'National Legal Aid Services Organization (NLASO)'}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href="tel:16430"
                className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-2 sm:px-2.5 py-0.5 rounded-full font-bold text-[11px] sm:text-xs shadow-xs transition active:scale-95"
                aria-label="National Legal Aid Hotline 16430"
              >
                <PhoneCall className="w-3 h-3" />
                <span>{language === 'bn' ? '১৬৪৩০' : '16430'}</span>
                <span className="text-[9px] bg-red-800/90 px-1 rounded uppercase hidden xs:inline">
                  {language === 'bn' ? 'টোল-ফ্রি' : 'Toll-Free'}
                </span>
              </a>

              <button
                onClick={() => {
                  if (confirm(language === 'bn' ? 'ডেমো ডেটা প্রাথমিক অবস্থায় রিসেট করতে চান?' : 'Reset demo data to initial state?')) {
                    resetDemoData();
                    window.location.reload();
                  }
                }}
                className="text-slate-400 hover:text-white p-1 text-[11px] flex items-center gap-1 transition"
                title={language === 'bn' ? 'রিসেট ডেমো ডেটা' : 'Reset demo data'}
                aria-label="Reset demo data"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden lg:inline">{language === 'bn' ? 'রিসেট' : 'Reset'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main navigation & role switcher */}
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="flex items-center justify-between gap-3">
            {/* Logo & System Brand */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-900 border border-emerald-500/40 flex items-center justify-center shadow-md shrink-0">
                <Scale className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-100" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-base sm:text-lg font-black tracking-tight text-white font-sans truncate">
                    {language === 'bn' ? 'ডিজিটাল লিগ্যাল এইড' : 'Digital Legal Aid'}
                  </h1>
                  <span className="hidden xs:inline-block bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded">
                    PWA
                  </span>
                </div>
                {/* Mobile Active Role Quick Trigger */}
                <button
                  type="button"
                  onClick={() => setShowRoleDrawer(true)}
                  className="lg:hidden flex items-center gap-1 text-[11px] text-emerald-300 font-bold hover:text-white transition group"
                  aria-label="Change role"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 group-hover:scale-125 transition-transform" />
                  <span className="truncate">{currentRoleInfo.title}</span>
                  <ChevronDown className="w-3 h-3 text-emerald-400 group-hover:translate-y-0.5 transition-transform shrink-0" />
                </button>
                <p className="hidden lg:block text-xs text-slate-400">
                  {language === 'bn' ? 'অফলাইন-ফার্স্ট ট্রায়াজ ও প্রক্সি প্রোভেন্যান্স সিস্টেম' : 'Offline-first triage & proxy provenance system'}
                </p>
              </div>
            </div>

            {/* Mobile Actions: Language Toggle + Network Toggle + Install Button */}
            <div className="lg:hidden flex items-center gap-1.5 shrink-0">
              {/* Language Toggle: [ EN | বাং ] */}
              <div className="inline-flex items-center bg-slate-800/90 p-0.5 rounded-full border border-slate-700/80 shadow-inner text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => onLanguageChange('en')}
                  className={`px-1.5 py-0.5 rounded-full transition-all ${
                    language === 'en'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  aria-label="Switch to English"
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => onLanguageChange('bn')}
                  className={`px-1.5 py-0.5 rounded-full transition-all ${
                    language === 'bn'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  aria-label="বাংলায় পরিবর্তন করুন"
                >
                  বাং
                </button>
              </div>

              <button
                onClick={() => onToggleSimulatedNetwork(!simulatedOffline)}
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1 transition active:scale-95 ${
                  isOnline
                    ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                    : 'bg-amber-950/80 border-amber-600 text-amber-300 animate-pulse'
                }`}
                aria-label={isOnline ? 'Go offline' : 'Go online'}
                title={isOnline ? (language === 'bn' ? 'ইন্টারনেট অনলাইন' : 'Internet Online') : (language === 'bn' ? 'অফলাইন মোড' : 'Offline Mode')}
              >
                {isOnline ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-amber-400" />}
              </button>

              <PWAInstallButton />
            </div>

            {/* Desktop Role-Based Views Switcher */}
            <div className="hidden lg:flex items-center gap-3">
              <div
                className="bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 flex items-center shadow-inner"
                role="tablist"
                aria-label="User role selection"
              >
                {rolesConfig.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentRole === item.role;
                  return (
                    <button
                      key={item.role}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => onRoleChange(item.role)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all duration-150 whitespace-nowrap min-h-[38px] ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400'
                          : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.title}</span>
                    </button>
                  );
                })}
              </div>

              {/* Desktop Language Toggle: [ EN | বাং ] */}
              <div className="inline-flex items-center bg-slate-800/90 p-0.5 rounded-full border border-slate-700/80 shadow-inner text-xs font-bold">
                <button
                  type="button"
                  onClick={() => onLanguageChange('en')}
                  className={`px-2.5 py-1 rounded-full transition-all duration-150 ${
                    language === 'en'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  aria-label="Switch to English"
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => onLanguageChange('bn')}
                  className={`px-2.5 py-1 rounded-full transition-all duration-150 ${
                    language === 'bn'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  aria-label="বাংলা ভাষায় পরিবর্তন করুন"
                >
                  বাং
                </button>
              </div>

              {/* Desktop Quick Network Simulation & Install Button */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onToggleSimulatedNetwork(!simulatedOffline)}
                  className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition active:scale-95 ${
                    isOnline
                      ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-emerald-400'
                      : 'bg-amber-950/80 hover:bg-amber-900/80 border-amber-600 text-amber-300 ring-1 ring-amber-500'
                  }`}
                  title={language === 'bn' ? 'নেটওয়ার্ক সিমুলেশন' : 'Network simulation'}
                  aria-label={isOnline ? 'Go offline' : 'Go online'}
                >
                  {isOnline ? (
                    <>
                      <Wifi className="w-4 h-4 text-emerald-400" />
                      <span>{language === 'bn' ? 'অনলাইন' : 'Online'}</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-4 h-4 text-amber-400 animate-pulse" />
                      <span>{language === 'bn' ? 'অফলাইন' : 'Offline'}</span>
                    </>
                  )}
                </button>
                <PWAInstallButton />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Role Switcher Bottom Sheet / Modal */}
      {showRoleDrawer && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label="Role selector drawer"
        >
          {/* Backdrop click to dismiss */}
          <div className="flex-1" onClick={() => setShowRoleDrawer(false)} />

          <div
            className="bg-slate-900 border-t border-slate-700 rounded-t-3xl p-5 space-y-4 shadow-2xl animate-in slide-in-from-bottom-5 duration-200 max-h-[85vh] overflow-y-auto"
            style={{
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1.5rem)',
            }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-black text-white">
                  {language === 'bn' ? 'ব্যবহারকারীর ভূমিকা নির্বাচন করুন' : 'Select User Role'}
                </h3>
              </div>
              <button
                onClick={() => setShowRoleDrawer(false)}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition"
                aria-label="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              {rolesConfig.map((item) => {
                const Icon = item.icon;
                const isSelected = currentRole === item.role;
                return (
                  <button
                    key={item.role}
                    type="button"
                    onClick={() => {
                      onRoleChange(item.role);
                      setShowRoleDrawer(false);
                    }}
                    className={`w-full p-3.5 rounded-2xl border text-left flex items-start gap-3.5 transition active:scale-98 ${
                      isSelected
                        ? 'bg-emerald-950/80 border-emerald-500 ring-1 ring-emerald-400 text-white shadow-md'
                        : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm text-white">
                          {item.title}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] font-bold bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full">
                            {language === 'bn' ? 'সক্রিয়' : 'Active'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                        {item.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 text-center text-xs text-slate-500">
              {language === 'bn'
                ? '💡 আপনি নিচের নেভিগেশন বার থেকেও যেকোনো সময় ভূমিকা পরিবর্তন করতে পারেন।'
                : '💡 You can also switch roles anytime from the bottom navigation bar.'}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

