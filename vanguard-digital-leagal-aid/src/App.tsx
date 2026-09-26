import React, { useState } from 'react';
import { UserRole } from './types';
import { useLanguage } from './context/LanguageContext';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { Header } from './components/common/Header';
import { MobileBottomNav } from './components/common/MobileBottomNav';
import { TriageDashboard } from './components/dlao/TriageDashboard';
import { UDCAssistedIntake } from './components/udc/UDCAssistedIntake';
import { CitizenView } from './components/citizen/CitizenView';
import { MediatorView } from './components/mediation/MediatorView';
import { PanelLawyerDashboard } from './components/lawyer/PanelLawyerDashboard';
import { 
  Building2, 
  Smartphone, 
  UserCheck, 
  PhoneCall, 
  Scale, 
  ShieldCheck, 
  WifiOff, 
  Wifi, 
  HardDriveDownload,
  Info
} from 'lucide-react';

export default function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>('dlao');
  const { isOnline, simulatedOffline, toggleSimulatedNetwork } = useNetworkStatus();
  const { language, setLanguage } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans selection:bg-emerald-200 selection:text-emerald-900 pb-16 lg:pb-0">
      {/* Top Header with Role Switcher, Language Toggle & Network Toggle */}
      <Header
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        isOnline={isOnline}
        simulatedOffline={simulatedOffline}
        onToggleSimulatedNetwork={toggleSimulatedNetwork}
        language={language}
        onLanguageChange={setLanguage}
      />

      {/* Offline Alert Strip if currently offline */}
      {!isOnline && (
        <aside
          role="status"
          aria-live="polite"
          className="bg-amber-500 text-slate-950 font-bold px-3 py-2 text-xs flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 shadow-sm text-center"
        >
          <div className="flex items-center gap-1.5">
            <WifiOff className="w-4 h-4 text-slate-950 animate-pulse shrink-0" />
            <span>
              {language === 'bn' 
                ? 'অফলাইন মোড সক্রিয়: তথ্য আপনার ডিভাইসে নিরাপদে জমা হচ্ছে। নেট ফিরলে সিঙ্ক হবে।'
                : 'Offline mode active: Data saved locally. Will sync when reconnected.'}
            </span>
          </div>
          <button
            onClick={() => toggleSimulatedNetwork(false)}
            className="bg-slate-950 text-white px-3 py-1 rounded-lg text-[11px] font-bold hover:bg-slate-800 transition active:scale-95 shrink-0"
          >
            {language === 'bn' ? 'অনলাইন করুন' : 'Go Online'}
          </button>
        </aside>
      )}

      {/* Main Container with responsive padding */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6" id="main-content">
        {/* Role 1: DLAO Admin Triage Dashboard */}
        {currentRole === 'dlao' && (
          <TriageDashboard
            onNavigateToIntake={() => setCurrentRole('udc')}
            language={language}
          />
        )}

        {/* Role 2: UDC Entrepreneur Assisted Intake */}
        {currentRole === 'udc' && (
          <UDCAssistedIntake
            isOnline={isOnline}
            simulatedOffline={simulatedOffline}
            onToggleSimulatedNetwork={toggleSimulatedNetwork}
            onNavigateToDashboard={() => setCurrentRole('dlao')}
            language={language}
          />
        )}

        {/* Role 3: Citizen / Proxy View */}
        {currentRole === 'citizen' && (
          <CitizenView language={language} />
        )}

        {/* Role 4: Mediator View (Mediation & Settlement Module - Challenges T7 & T11) */}
        {currentRole === 'mediator' && (
          <MediatorView
            isOnline={isOnline}
          />
        )}

        {/* Role 5: Panel Lawyer View (Challenge B5) */}
        {currentRole === 'lawyer' && (
          <PanelLawyerDashboard language={language} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 py-6 text-xs mb-14 lg:mb-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div className="flex items-center gap-2 justify-center md:justify-start">
            <Scale className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-white font-bold">
              {language === 'bn' 
                ? 'জাতীয় আইনগত সহায়তা প্রদান সংস্থা (NLASO)'
                : 'National Legal Aid Services Organization (NLASO)'}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-[11px]">
            <span className="flex items-center gap-1 text-emerald-300">
              <ShieldCheck className="w-3.5 h-3.5" />
              {language === 'bn' ? 'লিগ্যাল এইড অ্যাক্ট ২০০০ সমর্থিত' : 'Legal Aid Act 2000 Compliant'}
            </span>
            <span>·</span>
            <span>{language === 'bn' ? 'প্রক্সি প্রোভেন্যান্স সুরক্ষা এনক্রিপ্টেড' : 'Proxy Provenance Protected'}</span>
            <span>·</span>
            <a href="tel:16430" className="font-mono text-emerald-400 hover:underline">
              {language === 'bn' ? 'হটলাইন: ১৬৪৩০ (টোল-ফ্রি)' : 'Hotline: 16430 (Toll-Free)'}
            </a>
          </div>
        </div>
      </footer>

      {/* Native Mobile Bottom Navigation Bar (Persistent, thumb-friendly on all mobile screens) */}
      <MobileBottomNav
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
      />
    </div>
  );
}

