import React, { useState } from 'react';
import { LegalCase, Language } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { translateCategory } from '../../utils/translations';
import { getStoredCases, saveCases } from '../../utils/storage';
import { 
  Lock, 
  Unlock, 
  ShieldAlert, 
  FileText, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  UserCheck, 
  Clock, 
  FileCheck2,
  AlertTriangle,
  Fingerprint,
  Send
} from 'lucide-react';

interface SensitiveDocumentsViewerProps {
  legalCase: LegalCase;
  onUpdateCase?: (updated: LegalCase) => void;
  className?: string;
  language?: Language;
}

export const SensitiveDocumentsViewer: React.FC<SensitiveDocumentsViewerProps> = ({
  legalCase,
  onUpdateCase,
  className = '',
  language: propLanguage,
}) => {
  const { language: ctxLanguage } = useLanguage();
  const language = propLanguage || ctxLanguage;

  // Simulator toggle for testing: Role B6 vs Sending DLAO / General Viewer
  const [currentViewerRole, setCurrentViewerRole] = useState<'sending_dlao' | 'receiving_dlao_b6'>(
    'sending_dlao'
  );

  const [isReceiptAcknowledged, setIsReceiptAcknowledged] = useState<boolean>(
    legalCase.isReceiptAcknowledged || false
  );
  const [revealedByB6, setRevealedByB6] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isSensitive = legalCase.isSensitive || legalCase.category === 'Sensitive/Image Harassment';

  const documents = legalCase.evidenceFiles || [
    { name: language === 'en' ? 'Evidence_Screenshot_Log.png' : 'নাবিলার_বিকৃত_ছবির_স্ক্রিনশট_প্রমাণক.png', type: 'image/png', size: '2.4 MB' },
    { name: language === 'en' ? 'Blackmail_Chat_History.pdf' : 'হোয়াটসঅ্যাপ_ব্ল্যাকমেইল_চ্যাটলগ.pdf', type: 'application/pdf', size: '1.1 MB' },
    { name: language === 'en' ? 'Cyber_Police_GD_Copy.pdf' : 'সিআইডি_সাইবার_পুলিশ_জিডি_কপি.pdf', type: 'application/pdf', size: '480 KB' },
  ];

  // Acknowledge Receipt Handler for Receiving DLAO (Role B6)
  const handleAcknowledgeReceipt = () => {
    const timeStr = new Date().toLocaleTimeString(language === 'bn' ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' }) + ', ' +
      new Date().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });

    const all = getStoredCases();
    const updatedCase: LegalCase = {
      ...legalCase,
      isReceiptAcknowledged: true,
      acknowledgedBy: 'Authorized Receiving DLAO - Special Cyber Cell (Role B6)',
      acknowledgedAt: timeStr,
      officerNotes: (legalCase.officerNotes || '') + `\n[Receipt Acknowledged]: Receiving DLAO (Role B6) at ${timeStr}.`,
    };

    const idx = all.findIndex((c) => c.id === legalCase.id);
    if (idx !== -1) {
      all[idx] = updatedCase;
      saveCases(all);
    }

    setIsReceiptAcknowledged(true);
    setToastMessage(
      language === 'en'
        ? 'Formal receipt acknowledged! Status update sent to Sending DLAO.'
        : 'নথিপত্রের আনুষ্ঠানিক প্রাপ্তিস্বীকার সম্পন্ন হয়েছে! প্রেরণকারী ডিএলএও ড্যাশবোর্ডে স্ট্যাটাস আপডেট প্রেরিত।'
    );
    if (onUpdateCase) onUpdateCase(updatedCase);

    setTimeout(() => {
      setToastMessage(null);
    }, 6000);
  };

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 ${className}`}>
      {/* Toast Alert */}
      {toastMessage && (
        <div
          role="status"
          className="bg-emerald-700 text-white p-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between shadow-md"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white hover:text-emerald-200 font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
        <div className="flex items-center gap-2.5">
          <FileText className="w-5 h-5 text-emerald-700" />
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-extrabold text-slate-900">
                {language === 'en' ? 'Documents & Evidence Section' : 'নথিপত্র ও প্রমাণক'}
              </h4>
              {isSensitive && (
                <span className="text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-300 px-2 py-0.5 rounded-full">
                  {translateCategory(legalCase.category, language)}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {language === 'en'
                ? 'Digital evidence confidentiality & role-based access control.'
                : 'সংবেদনশীল মামলার ডিজিটাল প্রমাণকের নিরাপত্তা ও রোল-ভিত্তিক প্রবেশাধিকার।'}
            </p>
          </div>
        </div>

        {/* Viewer Role Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 w-full sm:w-auto">
          <span className="text-[11px] font-bold text-slate-600 pl-1 shrink-0">
            {language === 'en' ? 'Role Switch:' : 'ভূমিকা সুইচ:'}
          </span>
          <button
            type="button"
            onClick={() => {
              setCurrentViewerRole('sending_dlao');
              setRevealedByB6(false);
            }}
            className={`flex-1 sm:flex-none min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold transition text-center cursor-pointer ${
              currentViewerRole === 'sending_dlao'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {language === 'en' ? 'Sending DLAO' : 'প্রেরণকারী ডিএলএও'}
          </button>

          <button
            type="button"
            onClick={() => setCurrentViewerRole('receiving_dlao_b6')}
            className={`flex-1 sm:flex-none min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-black transition text-center cursor-pointer ${
              currentViewerRole === 'receiving_dlao_b6'
                ? 'bg-purple-700 text-white shadow-2xs ring-1 ring-purple-500'
                : 'text-purple-800 hover:text-purple-950'
            }`}
          >
            {language === 'en' ? 'Receiving DLAO (Role B6)' : 'গ্রহীতা ডিএলএও (রোল B6)'}
          </button>
        </div>
      </div>

      {/* Sending DLAO Status Bar */}
      <div className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
        isReceiptAcknowledged
          ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
          : 'bg-amber-50 border-amber-300 text-amber-950'
      }`}>
        <div className="flex items-center gap-2">
          {isReceiptAcknowledged ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <Clock className="w-4 h-4 text-amber-700 shrink-0" />
          )}
          <span className="font-bold">
            {isReceiptAcknowledged
              ? (language === 'en'
                  ? 'Sending DLAO Status: Acknowledged & Secured by Receiving DLAO (Role B6) ✅'
                  : 'প্রেরণকারী ডিএলএও অবস্থা: রিসিভিং ডিএলএও (রোল B6) কর্তৃক প্রাপ্তিস্বীকার সম্পন্ন ✅')
              : (language === 'en'
                  ? 'Sending DLAO Status: Awaiting receipt from Receiving DLAO (Role B6)...'
                  : 'প্রেরণকারী ডিএলএও অবস্থা: রিসিভিং ডিএলএও (রোল B6) এর প্রাপ্তিস্বীকারের জন্য অপেক্ষমাণ...')}
          </span>
        </div>

        {isReceiptAcknowledged && legalCase.acknowledgedAt && (
          <span className="text-[11px] font-mono text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
            {language === 'en' ? 'Time:' : 'সময়:'} {legalCase.acknowledgedAt}
          </span>
        )}
      </div>

      {/* Document Thumbnails */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {documents.map((doc, idx) => {
          const isBlurred = isSensitive && (!revealedByB6 || currentViewerRole !== 'receiving_dlao_b6');

          return (
            <div
              key={idx}
              className="relative rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden shadow-2xs group flex flex-col"
            >
              {/* Document Thumbnail Area */}
              <div className="relative h-40 bg-slate-200 flex items-center justify-center overflow-hidden">
                <div
                  className={`w-full h-full flex flex-col items-center justify-center p-4 transition-all duration-300 ${
                    isBlurred ? 'filter blur-xl scale-110 brightness-50 select-none pointer-events-none' : ''
                  }`}
                >
                  <div className="w-16 h-20 bg-white rounded-lg shadow-sm border border-slate-300 p-2 flex flex-col justify-between">
                    <div className="w-full h-2 bg-red-400 rounded-sm mb-1" />
                    <div className="w-full space-y-1">
                      <div className="w-3/4 h-1 bg-slate-300 rounded-xs" />
                      <div className="w-full h-1 bg-slate-300 rounded-xs" />
                      <div className="w-2/3 h-1 bg-slate-300 rounded-xs" />
                    </div>
                    <div className="w-6 h-6 rounded-full bg-purple-200 mx-auto" />
                  </div>
                  <span className="text-[10px] text-slate-600 mt-2 font-mono">
                    {doc.name}
                  </span>
                </div>

                {/* ACCESS CONTROL RESTRICTION LAYER OVERLAY */}
                {isBlurred && (
                  <div
                    className="absolute inset-0 bg-slate-950/80 backdrop-blur-md p-4 flex flex-col items-center justify-center text-center text-white space-y-2 z-10"
                    role="alert"
                    aria-label={language === 'en' ? 'Security blur active' : 'নিরাপত্তা ব্লার সক্রিয়'}
                  >
                    <div className="w-9 h-9 rounded-full bg-red-500/20 border border-red-400 text-red-400 flex items-center justify-center">
                      <Lock className="w-5 h-5" />
                    </div>

                    <div className="text-xs font-black text-red-300 uppercase tracking-wide leading-tight max-w-[200px]">
                      {language === 'en'
                        ? 'Access Restricted - Viewable only by Authorized Receiving DLAO (Role B6).'
                        : 'অনুমোদন সীমাবদ্ধ - শুধুমাত্র অনুমোদিত রিসিভিং ডিএলএও (রোল B6) এর জন্য দৃশ্যমান।'}
                    </div>

                    <span className="text-[10px] text-slate-400 font-mono">
                      {language === 'en' ? '[Sensitive image blurred]' : '[সংবেদনশীল ছবি সম্পূর্ণ ব্লারকৃত]'}
                    </span>
                  </div>
                )}
              </div>

              {/* Document Meta row */}
              <div className="p-3 bg-white border-t border-slate-100 flex-1 flex flex-col justify-between">
                <div className="truncate">
                  <span className="text-xs font-bold text-slate-800 truncate block">
                    {doc.name}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {language === 'en' ? 'Size' : 'আকার'}: {doc.size} · {language === 'en' ? 'Format' : 'ফরম্যাট'}: {doc.type}
                  </span>
                </div>

                {currentViewerRole === 'receiving_dlao_b6' && revealedByB6 && (
                  <span className="mt-2 text-[11px] font-bold text-emerald-700 bg-emerald-50 py-1 px-2 rounded flex items-center justify-center gap-1 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{language === 'en' ? 'Unlocked for Role B6' : 'Role B6 এর জন্য আনলকড'}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Bar for Receiving DLAO */}
      {currentViewerRole === 'receiving_dlao_b6' ? (
        <div className="rounded-2xl border-2 border-purple-400 bg-purple-50/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-ping" />
              <span className="text-xs font-black text-purple-950 uppercase tracking-wide">
                {language === 'en' ? 'Authorized Receiving DLAO Console (Role B6)' : 'অনুমোদিত রিসিভিং ডিএলএও কনসোল (রোল B6)'}
              </span>
            </div>
            <p className="text-xs text-purple-900 leading-relaxed max-w-xl">
              {language === 'en'
                ? 'Logged in as authorized Receiving DLAO. Click "Acknowledge Receipt" to officially take custody of evidence.'
                : 'আপনি অনুমোদিত রিসিভিং ডিএলএও হিসেবে লগইন করেছেন। প্রেরিত নথিপত্র গ্রহণ করতে "প্রাপ্তিস্বীকার করুন" বাটনে চাপুন।'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
            {/* Reveal/Inspect Toggle */}
            <button
              type="button"
              onClick={() => setRevealedByB6(!revealedByB6)}
              className="flex-1 sm:flex-none min-h-[44px] justify-center px-3 py-2 rounded-xl bg-white hover:bg-purple-100 text-purple-900 text-xs font-bold border border-purple-300 transition flex items-center gap-1.5 cursor-pointer"
            >
              {revealedByB6 ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>
                {revealedByB6 
                  ? (language === 'en' ? 'Blur Image' : 'ছবি ব্লার করুন') 
                  : (language === 'en' ? 'Inspect Evidence' : 'তদন্তের জন্য প্রদর্শন')}
              </span>
            </button>

            {/* Acknowledge Receipt Button */}
            {!isReceiptAcknowledged ? (
              <button
                type="button"
                onClick={handleAcknowledgeReceipt}
                className="w-full sm:w-auto min-h-[44px] justify-center px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs sm:text-sm font-black shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer"
                aria-label={language === 'en' ? 'Acknowledge Receipt' : 'প্রাপ্তিস্বীকার করুন'}
              >
                <FileCheck2 className="w-4 h-4" />
                <span>{language === 'en' ? 'Acknowledge Receipt' : 'প্রাপ্তিস্বীকার করুন'}</span>
              </button>
            ) : (
              <span className="w-full sm:w-auto min-h-[44px] justify-center px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span>{language === 'en' ? 'Receipt Acknowledged' : 'প্রাপ্তিস্বীকার সম্পন্ন'}</span>
              </span>
            )}
          </div>
        </div>
      ) : (
        /* Sending DLAO guidance */
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>
            {language === 'en'
              ? 'ℹ️ Documents securely transmitted. Awaiting formal acknowledgment from Receiving DLAO (Role B6).'
              : 'ℹ️ প্রেরণকারী ডিএলএও হিসেবে আপনি নথিপত্র সুরক্ষিত অবস্থায় প্রেরণ করেছেন। রিসিভিং ডিএলএও (রোল B6) স্বীকৃতি দিলে স্ট্যাটাস নিশ্চিত হবে।'}
          </span>
          <button
            type="button"
            onClick={() => setCurrentViewerRole('receiving_dlao_b6')}
            className="text-purple-700 hover:underline font-bold shrink-0 self-start sm:self-auto cursor-pointer"
          >
            {language === 'en' ? 'Test as Receiving DLAO ➔' : 'রিসিভিং ডিএলএও হিসেবে পরীক্ষা করুন ➔'}
          </button>
        </div>
      )}
    </div>
  );
};
