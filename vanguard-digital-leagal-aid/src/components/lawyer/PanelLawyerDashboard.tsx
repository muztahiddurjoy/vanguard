import React, { useState } from 'react';
import { LegalCase, Language } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { getStoredCases, saveCases } from '../../utils/storage';
import {
  translateCategory,
  translateTimeAgo,
  cleanPersonName,
} from '../../utils/translations';
import { 
  Briefcase, 
  Calendar, 
  Clock, 
  MapPin, 
  PhoneCall, 
  Scale, 
  Send, 
  CheckCircle2, 
  FileText, 
  Search, 
  User, 
  Upload, 
  X,
  History,
  Printer,
  Receipt,
} from 'lucide-react';

interface PanelLawyerDashboardProps {
  currentLawyerName?: string;
  language?: Language;
}

export const PanelLawyerDashboard: React.FC<PanelLawyerDashboardProps> = ({
  currentLawyerName,
  language: propLanguage,
}) => {
  const { language: ctxLanguage } = useLanguage();
  const language = propLanguage || ctxLanguage;

  const defaultLawyerName = language === 'en' ? 'Advocate Suraiya Parveen' : 'অ্যাডভোকেট সুরাইয়া পারভীন';
  const [selectedLawyer, setSelectedLawyer] = useState<string>(
    currentLawyerName ? cleanPersonName(currentLawyerName, language) : defaultLawyerName
  );
  const [cases, setCases] = useState<LegalCase[]>(getStoredCases());
  const [updatingCase, setUpdatingCase] = useState<LegalCase | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Submit Update Modal Form State
  const [updateStage, setUpdateStage] = useState(
    language === 'en' ? 'Witness Testimony & Examination Completed' : 'সাক্ষ্যগ্রহণ ও জবানবন্দি গ্রহণ সম্পন্ন'
  );
  const [nextHearingInput, setNextHearingInput] = useState(
    language === 'en' ? '24 October 2026 (Thursday)' : '২৪ অক্টোবর ২০২৬ (বৃহস্পতিবার)'
  );
  const [updateSummary, setUpdateSummary] = useState(
    language === 'en'
      ? 'Testimony of the plaintiff and chief witness recorded in court. Next date fixed for cross-examination and order.'
      : 'বিজ্ঞ আদালতে বাদী ও প্রধান প্রত্যক্ষদর্শীর জবানবন্দি রেকর্ড করা হয়েছে। পরবর্তী তারিখে জেরা ও আদেশের দিন ধার্য করা হয়েছে।'
  );
  const [hasFileAttached, setHasFileAttached] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Challenge T1: Billing & Payments Mock Data (Bill Gadget)
  const mockBills = [
    {
      id: 'BILL-2026-0701',
      trackingNumber: 'DLA-2026-0701',
      clientName: language === 'en' ? 'Md. Abdul Malek' : 'মোঃ আব্দুল মালেক',
      hearingStage: language === 'en' ? 'Witness Testimony & Examination Completed' : 'সাক্ষ্যগ্রহণ ও জবানবন্দি গ্রহণ সম্পন্ন',
      status: 'verified' as const,
      amount: language === 'en' ? '৳ 2,500' : '৳ ২,৫০০',
      court: language === 'en' ? 'Joint District Judge 1st Court, Dhaka' : 'যুগ্ম জেলা জজ ১ম আদালত, ঢাকা',
      date: language === 'en' ? '22 Sep 2026' : '২২ সেপ্টেম্বর ২০২৬',
    },
    {
      id: 'BILL-2026-0814',
      trackingNumber: 'DLA-2026-0814',
      clientName: language === 'en' ? 'Rabeya Begum' : 'রাবেয়া বেগম',
      hearingStage: language === 'en' ? 'Plaint & Vakalatnama Filed' : 'আরজি ও ওকালতনামা দাখিল সম্পন্ন',
      status: 'verified' as const,
      amount: language === 'en' ? '৳ 1,800' : '৳ ১,৮০০',
      court: language === 'en' ? 'Metropolitan Sessions Court, Dhaka' : 'মহানগর দায়রা জজ আদালত, ঢাকা',
      date: language === 'en' ? '18 Sep 2026' : '১৮ সেপ্টেম্বর ২০২৬',
    },
    {
      id: 'BILL-2026-0792',
      trackingNumber: 'DLA-2026-0792',
      clientName: language === 'en' ? 'Julekha Akter' : 'জুলেখা আক্তার',
      hearingStage: language === 'en' ? 'Bail Hearing & Certified Copy Submission' : 'জামিন আবেদন শুনানি ও নকল উত্তোলন',
      status: 'pending' as const,
      amount: language === 'en' ? '৳ 2,000' : '৳ ২,০০০',
      court: language === 'en' ? 'Chief Metropolitan Magistrate Court' : 'চিফ মেট্রোপলিটন ম্যাজিস্ট্রেট আদালত',
      date: language === 'en' ? '25 Sep 2026' : '২৫ সেপ্টেম্বর ২০২৬',
    },
  ];

  const reloadCases = () => {
    setCases(getStoredCases());
  };

  // Filter cases assigned to this lawyer (or fallback to related cases)
  const lawyerCases = cases.filter((c) => {
    if (!c.assignedLawyer) return false;
    const isMatched = c.assignedLawyer.toLowerCase().includes('সুরাইয়া') || 
                      c.assignedLawyer.toLowerCase().includes('suraiya') ||
                      c.assignedLawyer.toLowerCase().includes('মারজিনা') ||
                      c.assignedLawyer.toLowerCase().includes('marzina');
    
    if (selectedLawyer.includes('সুরাইয়া') || selectedLawyer.includes('Suraiya')) {
      return c.assignedLawyer.toLowerCase().includes('সুরাইয়া') || c.assignedLawyer.toLowerCase().includes('suraiya');
    }
    return c.assignedLawyer.toLowerCase().includes('মারজিনা') || c.assignedLawyer.toLowerCase().includes('marzina');
  });

  const filteredCases = lawyerCases.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const translatedCat = translateCategory(c.category, language).toLowerCase();
    return (
      c.provenance.subjectName.toLowerCase().includes(q) ||
      c.trackingNumber.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      translatedCat.includes(q) ||
      c.policeStation.toLowerCase().includes(q)
    );
  });

  const handleOpenUpdateModal = (c: LegalCase) => {
    setUpdatingCase(c);
    setNextHearingInput(c.nextHearingDate || (language === 'en' ? '25 October 2026' : '২৫ অক্টোবর ২০২৬'));
    setUpdateStage(language === 'en' ? 'Hearing Held & Case Progress Filed' : 'শুনানি ও আদালতের অগ্রগতি দাখিল');
  };

  const handleSaveUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingCase) return;

    const newUpdateRecord = {
      id: `up-${Date.now()}`,
      date: new Date().toLocaleDateString(language === 'en' ? 'en-US' : 'bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }),
      stage: updateStage,
      summary: updateSummary,
      submittedBy: selectedLawyer,
    };

    const all = getStoredCases();
    const index = all.findIndex((c) => c.id === updatingCase.id);
    if (index !== -1) {
      const existingUpdates = all[index].lawyerUpdates || [];
      all[index] = {
        ...all[index],
        nextHearingDate: nextHearingInput,
        hearingStage: updateStage,
        isOverdue: false,
        lawyerUpdates: [newUpdateRecord, ...existingUpdates],
      };
      saveCases(all);
      reloadCases();
    }

    setToastMessage(
      language === 'en'
        ? `Case ${updatingCase.trackingNumber} progress report successfully submitted to DLAO system!`
        : `মামলা ${updatingCase.trackingNumber} এর আদালতের অগ্রগতি সফলভাবে ডিএলএও সিস্টেমে দাখিল হয়েছে!`
    );
    setUpdatingCase(null);

    setTimeout(() => {
      setToastMessage(null);
    }, 5000);
  };

  return (
    <div className="space-y-6">
      {/* Toast message */}
      {toastMessage && (
        <div
          role="status"
          className="bg-emerald-700 text-white px-5 py-3.5 rounded-2xl shadow-lg flex items-center justify-between text-xs sm:text-sm font-semibold animate-in fade-in"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-white hover:text-emerald-200 font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Top Banner: Panel Lawyer Profile */}
      <section className="rounded-3xl bg-linear-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-800/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-lg border border-emerald-400/40">
              <Briefcase className="w-7 h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-emerald-300 bg-emerald-900/80 px-2.5 py-0.5 rounded-full border border-emerald-700">
                  {language === 'en' ? 'Panel Lawyer Portal' : 'প্যানেল আইনজীবী পোর্টাল'}
                </span>
                <span className="text-xs text-slate-400">
                  {language === 'en' ? 'Bar Council No: BD-BAR-19402' : 'বার কাউন্সিল নং: BD-BAR-19402'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 mt-1">
                <h2 className="text-xl sm:text-2xl font-black text-white">
                  {selectedLawyer}
                </h2>
                <span
                  className="inline-flex items-center gap-1.5 bg-amber-400/20 text-amber-300 border border-amber-400/40 px-3 py-1 rounded-full text-xs font-bold shadow-xs"
                  aria-label={language === 'en' ? 'Rating: 4.8 out of 5 from 142 reviews' : 'রেটিং: ৫-এ ৪.৮ (১৪২টি রিভিউ)'}
                >
                  <span className="text-amber-400">⭐</span>
                  <span>{language === 'en' ? '4.8 / 5.0 · 142 Reviews' : '৪.৮ / ৫.০ · ১৪২টি রিভিউ'}</span>
                </span>
              </div>
              <div className="text-[11px] sm:text-xs font-bold text-emerald-300 mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                <span>
                  {language === 'en'
                    ? 'Case Limit: Removed (Performance-based allocation)'
                    : 'মামলা ধারণক্ষমতা সীমা: অপসারিত (কর্মদক্ষতাভিত্তিক বরাদ্দ)'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                {language === 'en'
                  ? 'District Legal Aid Office, Dhaka Judge Court · Government Legal Aid Panel Lawyer'
                  : 'জেলা লিগ্যাল এইড কার্যালয়, ঢাকা জজ কোর্ট · সরকারি আইনগত সহায়তা আইনজীবী'}
              </p>
            </div>
          </div>

          {/* Lawyer Simulator Toggle for Testing */}
          <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-700/80 space-y-1.5 w-full sm:w-auto shrink-0 shadow-inner">
            <span className="text-xs text-slate-400 block font-bold">
              {language === 'en' ? 'Switch Lawyer Profile (Test):' : 'আইনজীবী প্রোফাইল সুইচ (টেস্ট):'}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedLawyer(language === 'en' ? 'Advocate Suraiya Parveen' : 'অ্যাডভোকেট সুরাইয়া পারভীন')}
                className={`flex-1 sm:flex-none min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                  selectedLawyer.includes('সুরাইয়া') || selectedLawyer.includes('Suraiya')
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {language === 'en' ? 'Suraiya Parveen (Regular)' : 'সুরাইয়া পারভীন (নিয়মিত)'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedLawyer(language === 'en' ? 'Advocate Marzina Begum' : 'অ্যাডভোকেট মারজিনা বেগম')}
                className={`flex-1 sm:flex-none min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                  selectedLawyer.includes('মারজিনা') || selectedLawyer.includes('Marzina')
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {language === 'en' ? 'Marzina Begum (Alerted)' : 'মারজিনা বেগম (সতর্কবার্তা)'}
              </button>
            </div>
          </div>
        </div>

        {/* Lawyer Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800">
          <div className="bg-slate-950/60 p-3 sm:p-3.5 rounded-2xl border border-slate-700/80 shadow-inner">
            <div className="text-[11px] font-bold text-slate-400 uppercase">
              {language === 'en' ? 'Total Active Cases' : 'মোট সক্রিয় মামলা'}
            </div>
            <div className="text-xl font-extrabold text-white mt-0.5">
              {lawyerCases.length} {language === 'en' ? '' : 'টি'}
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 sm:p-3.5 rounded-2xl border border-slate-700/80 shadow-inner">
            <div className="text-[11px] font-bold text-slate-400 uppercase">
              {language === 'en' ? 'Upcoming Hearings' : 'আসন্ন শুনানি'}
            </div>
            <div className="text-xl font-extrabold text-emerald-400 mt-0.5">
              {lawyerCases.filter(c => c.nextHearingDate && !c.nextHearingDate.includes('অতিক্রান্ত')).length} {language === 'en' ? '' : 'টি'}
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 sm:p-3.5 rounded-2xl border border-slate-700/80 shadow-inner">
            <div className="text-[11px] font-bold text-slate-400 uppercase">
              {language === 'en' ? 'Progress Updates Submitted' : 'অগ্রগতি আপডেট দাখিল'}
            </div>
            <div className="text-xl font-extrabold text-blue-400 mt-0.5">
              {lawyerCases.reduce((acc, c) => acc + (c.lawyerUpdates?.length || 0), 0)} {language === 'en' ? '' : 'টি'}
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 sm:p-3.5 rounded-2xl border border-slate-700/80 shadow-inner">
            <div className="text-[11px] font-bold text-slate-400 uppercase">
              {language === 'en' ? 'Alerts / Pending' : 'সতর্কতা / পেন্ডিং'}
            </div>
            <div className="text-xl font-extrabold text-amber-400 mt-0.5">
              {lawyerCases.filter(c => c.isOverdue).length} {language === 'en' ? '' : 'টি'}
            </div>
          </div>
        </div>
      </section>

      {/* Challenge T1: Billing & Payments (Bill Gadget) */}
      <section
        className="bg-white rounded-3xl p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all border border-slate-100/50 space-y-4"
        aria-label={language === 'en' ? 'Billing & Payments Gadget' : 'বিল ও পেমেন্ট রিকনসিলিয়েশন গ্যাজেট'}
      >
        {/* Card Header with Print Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-100 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  {language === 'en' ? 'Billing & Payments (Bill Gadget)' : 'বিল ও পেমেন্ট রিকনসিলিয়েশন (বিল গ্যাজেট)'}
                </h3>
                <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                  {language === 'en' ? 'Challenge T1' : 'চ্যালেঞ্জ T1'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {language === 'en'
                  ? 'Reconciliation of advocate hearing fees under Legal Aid Rules'
                  : 'আইনগত সহায়তা বিধিমালা অনুযায়ী প্যানেল আইনজীবীর শুনানির বিল ও কোর্ট যাচাই'}
              </p>
            </div>
          </div>

          {/* Prominent Print Verified Bills Button with window.print() */}
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer self-start sm:self-auto shrink-0"
            title={language === 'en' ? 'Print Verified Bills for Accounts Submission' : 'হিসাব শাখায় দাখিলের জন্য যাচাইকৃত বিল প্রিন্ট করুন'}
          >
            <Printer className="w-4 h-4" />
            <span>{language === 'en' ? 'Print Verified Bills' : 'যাচাইকৃত বিল প্রিন্ট করুন'}</span>
          </button>
        </div>

        {/* Bills Table / Responsive List */}
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse min-w-[620px]">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/80">
                <th className="py-3 px-4 rounded-l-xl">{language === 'en' ? 'Case Tracking ID' : 'কেস ট্র্যাকিং আইডি'}</th>
                <th className="py-3 px-4">{language === 'en' ? 'Hearing Stage & Court' : 'শুনানির পর্যায় ও আদালত'}</th>
                <th className="py-3 px-4">{language === 'en' ? 'Court Verification Status' : 'কোর্ট যাচাইকরণ স্ট্যাটাস'}</th>
                <th className="py-3 px-4 text-right rounded-r-xl">{language === 'en' ? 'Amount' : 'বিল পরিমাণ'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {mockBills.map((bill) => (
                <tr key={bill.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-mono">
                    <span className="font-bold text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 block w-fit">
                      {bill.trackingNumber}
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-1">{bill.clientName}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-800">{bill.hearingStage}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{bill.court} · {bill.date}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    {bill.status === 'verified' ? (
                      <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{language === 'en' ? 'Verified' : 'যাচাইকৃত'}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>{language === 'en' ? 'Pending Court Verification' : 'আদালত যাচাই অপেক্ষমাণ'}</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-black font-mono text-sm sm:text-base text-slate-900">
                    {bill.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Reconciliation Summary Bar */}
        <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <span className="font-bold">{language === 'en' ? 'Reconciliation Total:' : 'সর্বমোট রিকনসিলিয়েশন:'}</span>
            <span className="text-slate-500">
              {language === 'en' ? '2 Verified · 1 Pending Verification' : '২টি যাচাইকৃত · ১টি যাচাই অপেক্ষমাণ'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[11px] font-semibold">{language === 'en' ? 'Verified Payable:' : 'যাচাইকৃত পরিশোধযোগ্য:'}</span>
              <span className="font-black font-mono text-emerald-700 text-sm sm:text-base">{language === 'en' ? '৳ 4,300' : '৳ ৪,৩০০'}</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[11px] font-semibold">{language === 'en' ? 'Pending:' : 'অপেক্ষমাণ:'}</span>
              <span className="font-bold font-mono text-amber-600 text-sm sm:text-base">{language === 'en' ? '৳ 2,000' : '৳ ২,০০০'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <Scale className="w-5 h-5 text-emerald-700" />
          <span>
            {language === 'en' 
              ? `Assigned Cases (${filteredCases.length} Active)` 
              : `আপনার অধীনস্থ মামলার তালিকা (${filteredCases.length}টি সক্রিয়)`}
          </span>
        </h3>

        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'en' ? 'Search by name, tracking no, or police station...' : 'নাম, ট্র্যাকিং নং বা থানা দিয়ে খুঁজুন...'}
            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-slate-800 focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
            aria-label={language === 'en' ? 'Search cases' : 'মামলা অনুসন্ধান'}
          />
        </div>
      </div>

      {/* Lawyer Active Cases Feed */}
      <div className="space-y-5">
        {filteredCases.length > 0 ? (
          filteredCases.map((c) => (
            <div
              key={c.id}
              className="group bg-white rounded-3xl p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all border border-slate-100/50 space-y-4"
            >
              {/* Header row: Category Pill + Status + Tracking */}
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-100 shrink-0">
                    {translateCategory(c.category, language)}
                  </span>
                  {c.isOverdue && (
                    <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping inline-block" />
                      <span>{language === 'en' ? 'Update Overdue' : 'আপডেট মেয়াদোত্তীর্ণ'}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2.5 text-xs text-slate-400">
                  <span className="font-mono font-medium text-slate-400">
                    {c.trackingNumber}
                  </span>
                  <span className="text-slate-300">·</span>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{translateTimeAgo(c.timeAgo, language)}</span>
                  </div>
                </div>
              </div>

              {/* Middle row: Subject details & Jurisdiction */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Client info */}
                <div className="space-y-1.5">
                  <span className="text-slate-400 font-bold uppercase tracking-wider block text-[10px]">
                    {language === 'en' ? 'Client / Applicant' : 'বিচারপ্রার্থী নাগরিক / ক্লায়েন্ট'}
                  </span>
                  <div className="text-lg sm:text-xl font-black text-slate-800 tracking-tight group-hover:text-emerald-700 transition-colors flex items-center gap-1.5">
                    <User className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>{cleanPersonName(c.provenance.subjectName, language)}</span>
                  </div>
                  <div className="text-slate-600 flex items-center gap-1 font-medium">
                    <PhoneCall className="w-3.5 h-3.5 text-slate-400" />
                    <span>{c.provenance.callerPhone}</span>
                  </div>
                  <div className="text-slate-500 truncate">
                    {c.provenance.subjectAddress}
                  </div>
                </div>

                {/* Court & Hearing details */}
                <div className="space-y-1.5">
                  <span className="text-slate-400 font-bold uppercase tracking-wider block text-[10px]">
                    {language === 'en' ? 'Court Jurisdiction & Stage' : 'আদালতের এখতিয়ার ও পর্যায়'}
                  </span>
                  <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{c.hearingCourtName || `${c.policeStation}, ${c.district}`}</span>
                  </div>
                  <div className="text-emerald-900 font-semibold bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-100/80">
                    <span className="text-emerald-700 text-[11px] font-bold block mb-0.5">
                      {language === 'en' ? 'Current Stage' : 'বর্তমান পর্যায়'}
                    </span>
                    <span>{c.hearingStage || (language === 'en' ? 'Lawyer Appointed' : 'আইনজীবী নিয়োগ সম্পন্ন')}</span>
                  </div>
                </div>

                {/* Next Hearing Date Display */}
                <div className="space-y-1.5 bg-slate-50/80 p-4 rounded-2xl border border-slate-100/60">
                  <span className="text-slate-500 font-bold uppercase tracking-wider block text-[10px]">
                    {language === 'en' ? 'Next Hearing Date' : 'পরবর্তী শুনানির তারিখ'}
                  </span>
                  <div className="text-base font-black text-slate-900 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>{c.nextHearingDate || (language === 'en' ? 'Date not yet assigned' : 'এখনো তারিখ ধার্য হয়নি')}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {c.lawyerUpdates && c.lawyerUpdates.length > 0
                      ? (language === 'en' ? `${c.lawyerUpdates.length} court updates submitted` : `${c.lawyerUpdates.length}টি কোর্ট আপডেট ইতিমধ্যে দাখিল হয়েছে`)
                      : (language === 'en' ? 'Submit new hearing update' : 'নতুন শুনানির আপডেট জমা দিন')}
                  </div>
                </div>
              </div>

              {/* Latest update preview if exists */}
              {c.lawyerUpdates && c.lawyerUpdates.length > 0 && (
                <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100/60 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-slate-800 font-bold">
                    <span className="flex items-center gap-1.5 text-emerald-800">
                      <History className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>{language === 'en' ? `Latest Update (${c.lawyerUpdates[0].date})` : `সর্বশেষ দাখিলকৃত আপডেট (${c.lawyerUpdates[0].date})`}</span>
                    </span>
                    <span className="text-[11px] bg-white text-slate-700 px-2.5 py-0.5 rounded-full font-medium border border-slate-200">
                      {c.lawyerUpdates[0].stage}
                    </span>
                  </div>
                  <p className="text-slate-600 leading-relaxed italic">
                    "{c.lawyerUpdates[0].summary}"
                  </p>
                </div>
              )}

              {/* Bottom Actions: Submit Update Button */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pt-3 border-t border-slate-100 gap-2.5">
                <span className="text-xs text-slate-500">
                  {language === 'en' 
                    ? 'Submit case progress and court orders to DLAO' 
                    : 'আদালতে গৃহীত পদক্ষেপ ও আদেশের কপি ডিএলএও বরাবর প্রেরণ করুন'}
                </span>

                <button
                  type="button"
                  onClick={() => handleOpenUpdateModal(c)}
                  className="w-full sm:w-auto min-h-[44px] justify-center px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs sm:text-sm shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{language === 'en' ? 'Submit Update' : 'অগ্রগতি সাবমিট'}</span>
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-10 text-center space-y-3">
            <Briefcase className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-base font-bold text-slate-800">
              {language === 'en' ? 'No Cases Found' : 'কোনো মামলা পাওয়া যায়নি'}
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {language === 'en'
                ? 'No cases found under the selected lawyer profile. Switch profile above to Suraiya Parveen.'
                : 'নির্বাচিত আইনজীবী প্রোফাইলের অধীন এই মুহূর্তে কোনো মামলা নেই। ওপরের প্রোফাইল সুইচ থেকে সুরাইয়া পারভীন নির্বাচন করুন।'}
            </p>
          </div>
        )}
      </div>

      {/* Submit Update Modal */}
      {updatingCase && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={language === 'en' ? 'Court Progress Report Submission Modal' : 'আদালতের অগ্রগতি রিপোর্ট দাখিল উইন্ডো'}
        >
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[92dvh] flex flex-col">
            {/* Modal Header */}
            <div className="bg-emerald-900 text-white px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-emerald-300 shrink-0" />
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-white">
                    {language === 'en' ? 'Submit Case Progress Update' : 'আদালতের মামলার অগ্রগতি দাখিল'}
                  </h4>
                  <p className="text-[11px] sm:text-xs text-emerald-200 font-mono">
                    {updatingCase.trackingNumber} — {cleanPersonName(updatingCase.provenance.subjectName, language)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUpdatingCase(null)}
                className="p-1.5 rounded-lg text-emerald-300 hover:text-white hover:bg-emerald-800 transition cursor-pointer"
                aria-label={language === 'en' ? 'Close modal' : 'উইন্ডো বন্ধ করুন'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUpdate} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              {/* Stage Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {language === 'en' ? 'Action / Current Stage in Court:' : 'আদালতে নিষ্পন্ন পদক্ষেপ / বর্তমান পর্যায়:'}
                </label>
                <select
                  value={updateStage}
                  onChange={(e) => setUpdateStage(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-emerald-600"
                >
                  <option value="সাক্ষ্যগ্রহণ ও জবানবন্দি সম্পন্ন">
                    {language === 'en' ? 'Witness Testimony & Examination Completed' : 'সাক্ষ্যগ্রহণ ও জবানবন্দি গ্রহণ সম্পন্ন'}
                  </option>
                  <option value="আরজি ও ওকালতনামা দাখিল">
                    {language === 'en' ? 'Plaint & Vakalatnama Filed' : 'আরজি ও ওকালতনামা দাখিল সম্পন্ন'}
                  </option>
                  <option value="শুনানি অনুষ্ঠিত ও আদেশ স্থগিত">
                    {language === 'en' ? 'Hearing Held & Order Stayed' : 'শুনানি অনুষ্ঠিত ও আদেশ স্থগিত'}
                  </option>
                  <option value="জামিন আবেদন শুনানি সম্পন্ন">
                    {language === 'en' ? 'Bail Hearing Completed & Bail Granted' : 'জামিন আবেদন শুনানি ও জামিন মঞ্জুর'}
                  </option>
                  <option value="এডিআর আপসনামা আদালতে দাখিল">
                    {language === 'en' ? 'ADR Settlement Submitted to Court' : 'এডিআর আপসনামা আদালতে দাখিল'}
                  </option>
                  <option value="চূড়ান্ত রায় ও ডিক্রি প্রদান">
                    {language === 'en' ? 'Final Judgment & Decree Issued' : 'চূড়ান্ত রায় ও ডিক্রি প্রদান'}
                  </option>
                </select>
              </div>

              {/* Next Hearing Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {language === 'en' ? 'Next Hearing Date:' : 'পরবর্তী শুনানির ধার্য তারিখ:'}
                </label>
                <input
                  type="text"
                  required
                  value={nextHearingInput}
                  onChange={(e) => setNextHearingInput(e.target.value)}
                  placeholder={language === 'en' ? 'e.g. 24 October 2026 (Thursday 10:30 AM)' : 'যেমন: ২৪ অক্টোবর ২০২৬ (বৃহস্পতিবার সকাল ১০:৩০)'}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-emerald-600"
                />
              </div>

              {/* Summary Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {language === 'en' ? 'Summary of Court Proceedings & Order:' : 'আদালতের কার্যক্রম ও আদেশের সংক্ষিপ্ত বিবরণ:'}
                </label>
                <textarea
                  rows={3}
                  required
                  value={updateSummary}
                  onChange={(e) => setUpdateSummary(e.target.value)}
                  placeholder={language === 'en' ? 'Enter summary of today\'s proceedings...' : 'আজকের শুনানির বিবরণ লিখুন...'}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:border-emerald-600 leading-relaxed"
                />
              </div>

              {/* Simulated Certified Copy Attachment */}
              <div className="bg-slate-50 p-3 rounded-xl border border-dashed border-slate-300 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="text-slate-700 font-medium">
                    {language === 'en' ? 'Court Attendance Slip / Order Copy' : 'আদালতের হাজিরা স্লিপ / আদেশপত্রের ছবি'}
                  </span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer text-emerald-800 font-bold bg-white px-2.5 py-1 rounded border border-slate-200 shrink-0">
                  <input
                    type="checkbox"
                    checked={hasFileAttached}
                    onChange={(e) => setHasFileAttached(e.target.checked)}
                    className="w-3.5 h-3.5 text-emerald-600 rounded"
                  />
                  <span>{language === 'en' ? 'Attached' : 'সংযুক্ত'}</span>
                </label>
              </div>

              {/* Actions - Strict Rule: Submit button says 'Submit' (en) or 'জমা দিন' (bn) */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUpdatingCase(null)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition text-center active:scale-95 cursor-pointer"
                >
                  {language === 'en' ? 'Cancel' : 'বাতিল'}
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs sm:text-sm shadow-md transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{language === 'en' ? 'Submit' : 'জমা দিন'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
