import React, { useState } from 'react';
import { 
  AlertTriangle, 
  UserX, 
  ArrowRight, 
  Clock, 
  Scale, 
  CheckCircle2, 
  RefreshCw, 
  ShieldAlert, 
  UserCheck, 
  X,
  FileWarning,
  Send
} from 'lucide-react';
import { LegalCase, Language } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { getStoredCases, saveCases } from '../../utils/storage';

interface PatternAlertProps {
  onReassigned?: () => void;
  className?: string;
  language?: Language;
}

export const PatternAlert: React.FC<PatternAlertProps> = ({ 
  onReassigned, 
  className = '',
  language: propLanguage,
}) => {
  const { language: ctxLanguage } = useLanguage();
  const language = propLanguage || ctxLanguage;

  const [showModal, setShowModal] = useState<boolean>(false);
  const [targetNewLawyer, setTargetNewLawyer] = useState<string>('Advocate Suraiya Parveen');
  const [isReassigned, setIsReassigned] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const cases = getStoredCases();
  const marzinaCases = cases.filter(
    (c) => c.assignedLawyer?.includes('মারজিনা') || c.assignedLawyer?.includes('Marzina')
  );

  const handleConfirmReassign = () => {
    const all = getStoredCases();
    let count = 0;
    const lawyerDisplayName = language === 'bn' ? 'অ্যাডভোকেট সুরাইয়া পারভীন' : targetNewLawyer;
    const updated = all.map((c) => {
      if (c.assignedLawyer?.includes('মারজিনা') || c.assignedLawyer?.includes('Marzina')) {
        count++;
        return {
          ...c,
          assignedLawyer: lawyerDisplayName,
          assignedLawyerPhone: '০১৭১২-৩৪৫৬৭৮',
          officerNotes: (c.officerNotes || '') + `\n[DLAO Reassignment]: পূর্বে নিযুক্ত মারজিনা বেগমের নিষ্ক্রিয়তার কারণে ${lawyerDisplayName} কে দায়িত্ব হস্তান্তর করা হলো।`,
          isOverdue: false,
        };
      }
      return c;
    });

    saveCases(updated);
    setIsReassigned(true);
    setShowModal(false);
    setToastMessage(
      language === 'bn'
        ? `সফলভাবে ${count}টি মামলা অ্যাডভোকেট মারজিনা বেগমের থেকে ${lawyerDisplayName} এর নিকট রি-অ্যাসাইন সম্পন্ন হয়েছে।`
        : `Successfully reassigned ${count} cases from Advocate Marzina Begum to ${lawyerDisplayName}.`
    );
    if (onReassigned) onReassigned();

    setTimeout(() => {
      setToastMessage(null);
    }, 6000);
  };

  const getCleanLawyerName = (name: string) => {
    if (language === 'bn') {
      if (name.includes('মারজিনা') || name.includes('Marzina')) return 'অ্যাডভোকেট মারজিনা বেগম';
      if (name.includes('সুরাইয়া') || name.includes('Suraiya')) return 'অ্যাডভোকেট সুরাইয়া পারভীন';
      return name;
    }
    if (name.includes('মারজিনা') || name.includes('Marzina')) return 'Advocate Marzina Begum';
    if (name.includes('সুরাইয়া') || name.includes('Suraiya')) return 'Advocate Suraiya Parveen';
    return name;
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Toast Alert */}
      {toastMessage && (
        <div
          role="status"
          className="bg-emerald-700 text-white px-4 py-3 rounded-xl shadow-lg flex items-center justify-between text-xs sm:text-sm font-semibold animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white hover:text-emerald-200 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* 
        CHALLENGE T1 REQUIREMENT:
        The DLAO Admin Alert: In the DLAO Admin View, add a specific 'Pattern Alert' component.
        It should flag a lawyer with a warning and a button for DLAO to 'Review & Reassign'.
      */}
      {!isReassigned ? (
        <div
          role="alert"
          aria-live="assertive"
          className="bg-red-50/50 border border-red-100 rounded-3xl p-5"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider bg-red-100 text-red-700 px-2.5 py-0.5 rounded-full">
                    {language === 'bn' ? 'প্যাটার্ন অ্যালার্ট' : 'Pattern Alert'}
                  </span>
                  <span className="text-xs font-mono font-medium text-slate-500 bg-white px-2.5 py-0.5 rounded-full border border-red-100">
                    {language === 'bn' ? 'আইনজীবী মনিটরিং' : 'Lawyer Monitoring'}
                  </span>
                </div>

                <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                  <span>{language === 'bn' ? 'অ্যাডভোকেট মারজিনা বেগম' : 'Advocate Marzina Begum'}</span>
                  <span className="text-xs font-bold text-red-700 bg-red-100/70 px-2.5 py-0.5 rounded-full">
                    {language === 'bn' ? 'প্যানেল আইনজীবী নং-১২' : 'Panel Lawyer No. 12'}
                  </span>
                </h3>

                {/* EXACT MANDATORY WARNING TEXT */}
                <p className="text-sm font-extrabold text-red-700 leading-snug">
                  {language === 'bn'
                    ? 'নিষ্ক্রিয়তার সীমা অতিক্রম: ৩টি মামলার মধ্যে ২টিতে আপডেট অনুপস্থিত।'
                    : 'Inactivity Threshold Reached: Missed 2 updates across 3 cases.'}
                </p>

                <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                  {language === 'bn'
                    ? 'আইনগত সহায়তা মনিটরিং অ্যালগরিদম শনাক্ত করেছে যে উক্ত আইনজীবীর বরাদ্দে থাকা ৩টি মামলার মধ্যে ২টিতে নির্ধারিত শুনানির পরও আদালতের অগ্রগতির রিপোর্ট বা আদেশের কপি দাখিল করা হয়নি।'
                    : 'Legal aid monitoring algorithm detected that 2 out of 3 cases assigned to this lawyer have missing court progress reports or order copies after scheduled hearings.'}
                </p>
              </div>
            </div>

            {/* Softer ghost button */}
            <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="w-full sm:w-auto min-h-[44px] justify-center px-5 py-2.5 rounded-xl bg-white text-red-600 border border-red-200 hover:bg-red-50 font-bold text-xs sm:text-sm transition active:scale-95 flex items-center gap-2 cursor-pointer shadow-xs"
                aria-label={language === 'bn' ? 'মামলাসমূহ রিভিউ ও রি-অ্যাসাইন করুন' : 'Review and reassign cases'}
              >
                <UserX className="w-4 h-4" />
                <span>{language === 'bn' ? 'রিভিউ ও রি-অ্যাসাইন' : 'Review & Reassign'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Resolved state */
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-3xl p-5 flex items-center justify-between text-xs sm:text-sm text-emerald-900">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>
              <strong>{language === 'bn' ? 'প্যাটার্ন অ্যালার্ট সমাধানকৃত:' : 'Pattern Alert Resolved:'}</strong>{' '}
              {language === 'bn'
                ? `অ্যাডভোকেট মারজিনা বেগমের ৩টি মামলা সফলভাবে ${getCleanLawyerName(targetNewLawyer)} এর নিকট হস্তান্তর করা হয়েছে।`
                : `3 cases of Advocate Marzina Begum have been successfully reassigned to ${getCleanLawyerName(targetNewLawyer)}.`}
            </span>
          </div>
          <button
            onClick={() => setIsReassigned(false)}
            className="text-xs text-emerald-700 underline font-bold cursor-pointer shrink-0 ml-2"
          >
            {language === 'bn' ? 'পুনরায় অ্যালার্ট সিমুলেট করুন' : 'Simulate Alert Again'}
          </button>
        </div>
      )}

      {/* Review & Reassign Interactive Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={language === 'bn' ? 'আইনজীবী প্যাটার্ন পর্যালোচনা ও রি-অ্যাসাইন উইন্ডো' : 'Lawyer Pattern Review and Reassignment Window'}
        >
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[92dvh] flex flex-col">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <FileWarning className="w-5 h-5 text-red-400 shrink-0" />
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-white">
                    {language === 'bn' ? 'আইনজীবী নিষ্ক্রিয়তা তদন্ত ও রি-অ্যাসাইন কনসোল' : 'Lawyer Inactivity Investigation & Reassign Console'}
                  </h4>
                  <p className="text-[11px] sm:text-xs text-slate-300 font-mono">
                    {language === 'bn' ? 'স্বয়ংক্রিয় নিষ্ক্রিয়তা সীমা রি-অ্যাসাইনমেন্ট' : 'Automated Inactivity Threshold Reassignment'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
              {/* Alert details card */}
              <div className="bg-red-50 border border-red-200 p-3.5 sm:p-4 rounded-2xl text-xs space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-red-900 font-bold gap-1">
                  <span>{language === 'bn' ? 'অভিযুক্ত আইনজীবী: অ্যাডভোকেট মারজিনা বেগম' : 'Flagged Lawyer: Advocate Marzina Begum'}</span>
                  <span className="bg-red-200 text-red-950 px-2 py-0.5 rounded-full font-mono self-start sm:self-auto">
                    {language === 'bn' ? 'মিসড আপডেট: ২/৩' : 'Missed Updates: 2/3'}
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  {language === 'bn'
                    ? 'লিগ্যাল এইড বিধিমালা অনুযায়ী শুনানির ৭২ ঘণ্টার মধ্যে অগ্রগতি রিপোর্ট প্রদানের বাধ্যবাধকতা রয়েছে। ২১ দিনের বেশি সময় ধরে কোনো আপডেট না আসায় বিচারপ্রার্থী নাগরিকদের ন্যায়বিচার বিঘ্নিত হচ্ছে।'
                    : 'Under legal aid guidelines, progress reports must be submitted within 72 hours of a hearing. Missing updates for over 21 days disrupts justice for citizens.'}
                </p>
              </div>

              {/* 3 Affected Cases List */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                  {language === 'bn' ? 'প্রভাবিত ৩টি সক্রিয় মামলার বিবরণ:' : 'Details of 3 Affected Active Cases:'}
                </span>
                
                {marzinaCases.length > 0 ? (
                  marzinaCases.map((c) => (
                    <div
                      key={c.id}
                      className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2"
                    >
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-800">{c.trackingNumber}</span>
                          <span className="text-slate-400">·</span>
                          <span className="font-bold text-slate-900">
                            {c.provenance.subjectName.replace(/\s*\([^)]*\)/g, '')}
                          </span>
                          <span className="text-[10px] bg-red-100 text-red-800 font-bold px-1.5 rounded">
                            {c.isOverdue 
                              ? (language === 'bn' ? 'আপডেট বিলম্বিত' : 'Update Overdue')
                              : (language === 'bn' ? 'ঝুঁকিপূর্ণ' : 'At Risk')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          {language === 'bn' ? 'আদালত' : 'Court'}: {c.hearingCourtName || c.policeStation} · {language === 'bn' ? 'ক্যাটাগরি' : 'Category'}: {c.category}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-red-600 bg-white px-2 py-1 rounded border border-red-200 self-start sm:self-auto">
                        {c.nextHearingDate || (language === 'bn' ? 'আপডেট মিসড' : 'Missed Update')}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    {language === 'bn' ? 'কোনো সংশ্লিষ্ট মামলা পাওয়া যায়নি।' : 'No related cases found.'}
                  </p>
                )}
              </div>

              {/* Reassignment Target Lawyer Selector */}
              <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 sm:p-4 rounded-2xl space-y-2">
                <label className="block text-xs font-bold text-emerald-950">
                  {language === 'bn' ? 'নতুন প্যানেল আইনজীবী নির্বাচন করুন:' : 'Select New Panel Lawyer (Reassign To):'}
                </label>
                <select
                  value={targetNewLawyer}
                  onChange={(e) => setTargetNewLawyer(e.target.value)}
                  className="w-full bg-white border border-emerald-300 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold text-slate-800 focus:outline-hidden focus:border-emerald-600"
                >
                  <option value="Advocate Suraiya Parveen">
                    {language === 'bn'
                      ? 'অ্যাডভোকেট সুরাইয়া পারভীন — রেটিং: ৯৮% (সময়মতো আপডেট: ১০০%)'
                      : 'Advocate Suraiya Parveen — Rating: 98% (On-time Updates: 100%)'}
                  </option>
                  <option value="Advocate Delwar Hossain">
                    {language === 'bn'
                      ? 'অ্যাডভোকেট মোঃ দেলোয়ার হোসেন — রেটিং: ৯৫% (প্যানেল নং-০৪)'
                      : 'Advocate Delwar Hossain — Rating: 95% (Panel #04)'}
                  </option>
                  <option value="Advocate Farida Yasmin">
                    {language === 'bn'
                      ? 'অ্যাডভোকেট ফরিদা ইয়াসমিন — রেটিং: ৯২% (নারী ও শিশু ট্রাইব্যুনাল)'
                      : 'Advocate Farida Yasmin — Rating: 92% (Specialist: Women & Child Tribunal)'}
                  </option>
                </select>
                <p className="text-[11px] text-emerald-800">
                  {language === 'bn'
                    ? '✓ রি-অ্যাসাইন বাটনে চাপ দিলে স্বয়ংক্রিয় নোটিশ সংশ্লিষ্ট আদালতে এবং এসএমএস ক্লায়েন্টের কাছে যাবে।'
                    : '✓ Automatic notification will be sent to the court and an SMS to the client upon reassignment.'}
                </p>
              </div>

              {/* Modal Actions */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition active:scale-95 text-center cursor-pointer"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReassign}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs sm:text-sm shadow-md transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>{language === 'bn' ? 'রি-অ্যাসাইন নিশ্চিত করুন' : 'Confirm Reassignment'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
