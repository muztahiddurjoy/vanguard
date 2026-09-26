import React, { useState } from 'react';
import { getStoredCases } from '../../utils/storage';
import { LegalCase, Language } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { 
  Search, 
  CheckCircle2, 
  Clock, 
  Scale, 
  ShieldCheck, 
  PhoneCall, 
  User, 
  HelpCircle, 
  FileText,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  MapPin,
  HeartHandshake,
  Calendar,
  Volume2,
  VolumeX,
  Building2,
  Gavel,
  ThumbsUp,
  UserCheck
} from 'lucide-react';

interface CitizenViewProps {
  language?: Language;
}

export const CitizenView: React.FC<CitizenViewProps> = ({ language: propLanguage }) => {
  const { language: ctxLanguage } = useLanguage();
  const language = propLanguage || ctxLanguage;

  // Mode switcher: Default to Malek's Simplified View (Challenge A5)
  const [viewMode, setViewMode] = useState<'malek' | 'standard'>('malek');

  // Search state for standard view
  const [trackingInput, setTrackingInput] = useState('DLA-2026-0701');
  const [searchedCase, setSearchedCase] = useState<LegalCase | null>(() => {
    const all = getStoredCases();
    return all.find((c) => c.trackingNumber === 'DLA-2026-0701') || all[0] || null;
  });
  const [notFound, setNotFound] = useState(false);

  // Audio voice simulation state for Malek (low literacy)
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Clean lawyer name helper removing mixed parentheses
  const cleanLawyerName = (name?: string) => {
    if (!name) return language === 'bn' ? 'আইনজীবী নিয়োগ প্রক্রিয়াধীন' : 'Lawyer assignment pending';
    if (name.includes('(')) {
      return language === 'bn' ? name.split('(')[0].trim() : name.split('(')[1].replace(')', '').trim();
    }
    return name;
  };

  // Find Malek's specific case
  const allCases = getStoredCases();
  const storedMalek = allCases.find((c) => c.id === 'case-malek' || c.trackingNumber === 'DLA-2026-0701');
  
  const malekCase = storedMalek || {
    id: 'case-malek',
    trackingNumber: 'DLA-2026-0701',
    createdAt: new Date().toISOString(),
    timeAgo: language === 'bn' ? '১৪ দিন আগে' : '14 days ago',
    priority: 'medium' as const,
    category: language === 'bn' ? 'পৈতৃক ভিটা সুরক্ষা ও বেদখল প্রতিরোধ' : 'Land Encroachment Protection',
    aiSummary: language === 'bn' ? 'বৃদ্ধ কৃষকের জমি সংক্রান্ত বিরোধ' : 'Elderly Farmer Land Dispute',
    channel: 'udc' as const,
    channelLabel: 'UDC',
    status: 'lawyer_assigned' as const,
    assignedLawyer: language === 'bn' ? 'অ্যাডভোকেট সুরাইয়া পারভীন' : 'Advocate Suraiya Parveen',
    assignedLawyerPhone: '০১৭১২-৩৪৫৬৭৮',
    nextHearingDate: language === 'bn' ? '১২ অক্টোবর ২০২৬ (বুধবার সকাল ১০:৩০)' : '12 October 2026 (Wednesday 10:30 AM)',
    hearingCourtName: language === 'bn' ? 'যুগ্ম জেলা জজ ১ম আদালত, ঢাকা' : 'Joint District Judge 1st Court, Dhaka',
    hearingStage: language === 'bn' ? 'সাক্ষ্যগ্রহণ ও জবানবন্দি গ্রহণ পর্ব' : 'Witness Testimony & Examination Stage',
    provenance: {
      callerName: language === 'bn' ? 'মোঃ আব্দুল মালেক' : 'Md. Abdul Malek',
      callerPhone: '০১৭৩১-৫৫৪০১২',
      callerVerification: 'verified' as const,
      callerRelation: language === 'bn' ? 'ভুক্তভোগী নিজে' : 'Victim Directly',
      subjectName: language === 'bn' ? 'মোঃ আব্দুল মালেক' : 'Md. Abdul Malek',
      subjectAge: 64,
      subjectAddress: language === 'bn' ? 'গ্রাম: চর মিরপুর, কেরানীগঞ্জ, ঢাকা' : 'Char Mirpur, Keraniganj, Dhaka',
      subjectVerification: 'verified' as const,
      isProxy: false,
      proxyConsentObtained: true
    },
    incidentDescription: language === 'bn' ? 'কৃষক আব্দুল মালেক নিরক্ষর। স্থানীয় প্রভাবশালীরা তার বসতভিটা দখলের চেষ্টা করছে।' : 'Elderly farmer Abdul Malek is illiterate. Local land-grabbers are trying to usurp his homestead.',
    desiredRelief: language === 'bn' ? 'চিরস্থায়ী নিষেধাজ্ঞা।' : 'Permanent injunction.',
    hasChildInDanger: false,
    policeStation: language === 'bn' ? 'কেরানীগঞ্জ থানা' : 'Keraniganj PS',
    district: language === 'bn' ? 'ঢাকা' : 'Dhaka',
    upazila: language === 'bn' ? 'কেরানীগঞ্জ' : 'Keraniganj'
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = trackingInput.trim().toUpperCase();
    const all = getStoredCases();
    const found = all.find((c) => c.trackingNumber.toUpperCase() === query);
    if (found) {
      setSearchedCase(found);
      setNotFound(false);
    } else {
      setNotFound(true);
      setSearchedCase(null);
    }
  };

  const handleVoicePlay = () => {
    if (isSpeaking) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    const textToSpeak = language === 'bn'
      ? `আসসালামু আলাইকুম মালেক সাহেব। আপনার মামলার পরবর্তী শুনানির তারিখ ১২ অক্টোবর ২০২৬, বুধবার সকাল ১০টা ৩০ মিনিট। আপনার জন্য সরকারিভাবে নিযুক্ত আইনজীবী হলেন অ্যাডভোকেট সুরাইয়া পারভীন। তার মোবাইল নম্বর ০১৭১২-৩৪৫৬৭৮। আপনার মামলার কাগজপত্র প্রস্তুত আছে।`
      : `Greetings Mr. Malek. Your next hearing date is October 12, 2026, Wednesday at 10:30 AM. Your assigned legal aid lawyer is Advocate Suraiya Parveen. Phone number 01712-345678. Case papers are ready.`;

    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = language === 'bn' ? 'bn-BD' : 'en-US';
      utterance.rate = 0.9;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => {
        setIsSpeaking(false);
      }, 4000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Banner: Navigation between Malek View and Standard View */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-slate-100/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-emerald-700" />
          <span className="text-sm font-extrabold text-slate-900">
            {language === 'bn' ? 'নাগরিক মোড:' : 'Citizen Interface:'}
          </span>
        </div>

        {/* View Mode Toggle */}
        <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setViewMode('malek')}
            className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
              viewMode === 'malek'
                ? 'bg-emerald-700 text-white shadow-sm ring-1 ring-emerald-500'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white'
            }`}
          >
            <UserCheck className="w-4 h-4 shrink-0" />
            <span className="truncate">{language === 'bn' ? 'মালেকের সহজ ভিউ' : "Malek's Simple View"}</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('standard')}
            className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              viewMode === 'standard'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white'
            }`}
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="truncate">{language === 'bn' ? 'সাধারণ ট্র্যাকিং' : 'Standard Tracking'}</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* VIEW FOR MALEK (CHALLENGE A5) - ULTRA SIMPLIFIED & LOW-TEXT    */}
      {/* ============================================================== */}
      {viewMode === 'malek' ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Malek Welcome Banner with Voice Readout */}
          <div className="rounded-3xl bg-linear-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-6 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-800/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping inline-block" />
                  <span className="text-xs uppercase font-extrabold tracking-wider text-emerald-300">
                    {language === 'bn'
                      ? 'সহজ নাগরিক ড্যাশবোর্ড · অডিও সহায়ক'
                      : 'Simplified Citizen Dashboard · Audio Assisted'}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white">
                  {language === 'bn' ? 'স্বাগতম, মোঃ আব্দুল মালেক' : 'Welcome, Md. Abdul Malek'}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-100">
                  <span className="bg-emerald-950/80 px-2.5 py-1 rounded-lg border border-emerald-600/60 font-mono font-bold">
                    {language === 'bn' ? 'আইডি' : 'ID'}: {malekCase.trackingNumber}
                  </span>
                  <span>·</span>
                  <span>{language === 'bn' ? 'বিষয়' : 'Subject'}: {malekCase.category}</span>
                </div>
              </div>

              {/* Large Voice Readout Button for Low-Literacy Users */}
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={handleVoicePlay}
                  className={`w-full sm:w-auto px-5 py-3.5 rounded-2xl font-black text-sm sm:text-base shadow-xl transition active:scale-95 flex items-center justify-center gap-2.5 cursor-pointer ${
                    isSpeaking
                      ? 'bg-amber-400 text-slate-950 animate-pulse'
                      : 'bg-white text-emerald-900 hover:bg-emerald-50'
                  }`}
                  aria-label={language === 'bn' ? 'মামলার অবস্থা মুখে শুনে জানুন' : 'Listen to case status audio'}
                >
                  {isSpeaking ? (
                    <>
                      <VolumeX className="w-6 h-6 text-slate-950" />
                      <span>{language === 'bn' ? 'শব্দ বন্ধ করুন' : 'Stop Audio'}</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-6 h-6 text-emerald-700 animate-bounce" />
                      <span>{language === 'bn' ? 'মুখে শুনুন' : 'Listen to Audio'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* TWO MAIN LARGE-ICON BLOCKS AS SPECIFIED IN CHALLENGE A5 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* ================= CARD 1: NEXT HEARING DATE ================= */}
            <div className="rounded-3xl border border-slate-100/80 bg-white p-6 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full">
                  {language === 'bn' ? 'পরবর্তী শুনানির তারিখ' : 'Next Hearing Date'}
                </span>
                <span className="text-xs font-extrabold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                  {language === 'bn' ? 'আদালতে হাজিরার দিন' : 'Court Appearance'}
                </span>
              </div>

              {/* Very Large Calendar Icon & Date Display */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                  <Calendar className="w-10 h-10 sm:w-12 sm:h-12" />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 font-bold block">
                    {language === 'bn' ? 'পরবর্তী শুনানির তারিখ:' : 'Next Hearing Date:'}
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-slate-950 leading-tight">
                    {malekCase.nextHearingDate || (language === 'bn' ? '১২ অক্টোবর ২০২৬' : '12 October 2026')}
                  </div>
                  <div className="text-xs sm:text-sm font-extrabold text-emerald-700 flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{language === 'bn' ? 'বুধবার · সকাল ১০:৩০ মিনিট' : 'Wednesday · 10:30 AM'}</span>
                  </div>
                </div>
              </div>

              {/* Court Location */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs sm:text-sm space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <Gavel className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{malekCase.hearingCourtName}</span>
                </div>
                <p className="text-slate-500 text-xs pl-5.5">
                  {language === 'bn'
                    ? 'বিচার ভবনের ৩য় তলা, জজ কোর্ট প্রাঙ্গণ, ঢাকা'
                    : '3rd Floor, Court Building, Judge Court Premises, Dhaka'}
                </p>
              </div>

              {/* Visual Countdown Badge */}
              <div className="bg-emerald-50 text-emerald-900 font-extrabold text-xs sm:text-sm p-3 rounded-2xl border border-emerald-200 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-700" />
                  <span>{language === 'bn' ? 'শুনানির আর ১৬ দিন বাকি' : '16 days left until hearing'}</span>
                </span>
                <span className="bg-emerald-700 text-white text-[11px] px-2.5 py-0.5 rounded-full">
                  {language === 'bn' ? 'সময়মতো পৌঁছান' : 'Arrive on Time'}
                </span>
              </div>
            </div>

            {/* ================= CARD 2: ASSIGNED LAWYER ================= */}
            <div className="rounded-3xl border border-slate-100/80 bg-white p-6 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-teal-800 bg-teal-100 px-3 py-1 rounded-full">
                  {language === 'bn' ? 'নিযুক্ত সরকারি আইনজীবী' : 'Assigned Government Lawyer'}
                </span>
                <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  {language === 'bn' ? '১০০% বিনামূল্যে' : '100% Free of Cost'}
                </span>
              </div>

              {/* Very Large Lawyer / Scale Icon & Lawyer Name */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-teal-700 text-white flex items-center justify-center shrink-0 shadow-md">
                  <Scale className="w-10 h-10 sm:w-12 sm:h-12" />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 font-bold block">
                    {language === 'bn' ? 'নিযুক্ত আইনজীবী:' : 'Assigned Lawyer:'}
                  </span>
                  <div className="text-lg sm:text-xl font-black text-slate-950 leading-tight">
                    {cleanLawyerName(malekCase.assignedLawyer)}
                  </div>
                  <div className="text-xs text-teal-800 font-semibold">
                    {language === 'bn' ? 'জেলা লিগ্যাল এইড প্যানেল আইনজীবী নং-০৭' : 'District Legal Aid Panel Lawyer #07'}
                  </div>
                </div>
              </div>

              {/* Phone Details & Large 1-Tap Dial Button */}
              <div className="bg-teal-50/80 p-3.5 rounded-2xl border border-teal-200 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-[11px] text-teal-900 font-bold">
                    {language === 'bn' ? 'আইনজীবীর ফোন নম্বর:' : "Lawyer's Phone Number:"}
                  </span>
                  <div className="font-mono text-base font-black text-slate-900">
                    {malekCase.assignedLawyerPhone || '০১৭১২-৩৪৫৬৭৮'}
                  </div>
                </div>

                <a
                  href={`tel:${malekCase.assignedLawyerPhone || '01712345678'}`}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition active:scale-95 flex items-center gap-1.5 shrink-0"
                  aria-label={language === 'bn' ? 'আইনজীবীকে সরাসরি ফোন করুন' : 'Call lawyer directly'}
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>{language === 'bn' ? 'ফোন করুন' : 'Call Lawyer'}</span>
                </a>
              </div>

              {/* Government Guarantee Note */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  {language === 'bn'
                    ? 'আইনজীবীর সকল ফি সরকার বহন করেছে। কাউকে কোনো টাকা দেওয়া নিষেধ।'
                    : 'All lawyer fees are fully covered by the government. Demanding or paying fees is strictly prohibited.'}
                </span>
              </div>
            </div>
          </div>

          {/* Large Visual Status Indicator for Illiterate Users */}
          <div className="bg-white rounded-3xl border border-slate-100/80 p-6 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-5">
            <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <ThumbsUp className="w-4 h-4 text-emerald-700" />
              <span>{language === 'bn' ? 'আপনার মামলার বর্তমান সার্বিক অবস্থা' : 'Overall Current Status of Your Case'}</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white mx-auto flex items-center justify-center font-black text-lg mb-2">
                  ✓
                </div>
                <div className="text-sm font-extrabold text-slate-900">
                  {language === 'bn' ? 'আবেদন সফল' : 'Application Accepted'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {language === 'bn' ? 'কাগজপত্র অনুমোদিত' : 'Documents Approved'}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-600 text-white border border-emerald-700 shadow-md">
                <div className="w-10 h-10 rounded-full bg-white text-emerald-700 mx-auto flex items-center justify-center font-black text-lg mb-2">
                  ✓
                </div>
                <div className="text-sm font-extrabold text-white">
                  {language === 'bn' ? 'উকিল নিযুক্ত' : 'Lawyer Assigned'}
                </div>
                <div className="text-xs text-emerald-100 mt-0.5">
                  {language === 'bn' ? 'মামলা প্রস্তুতি সম্পন্ন' : 'Preparation Complete'}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-400">
                <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 mx-auto flex items-center justify-center font-black text-lg mb-2">
                  ৩
                </div>
                <div className="text-sm font-bold text-slate-700">
                  {language === 'bn' ? 'আদালতে শুনানি' : 'Court Hearing'}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {language === 'bn' ? '১২ অক্টোবর অনুষ্ঠিত হবে' : 'Scheduled on Oct 12'}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ============================================================== */
        /* STANDARD VIEW - TRACK BY ANY NUMBER & FULL CITIZEN RESOURCES   */
        /* ============================================================== */
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Welcome banner */}
          <div className="rounded-3xl bg-linear-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-800/80">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                  <Scale className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'আইনের আশ্রয় লাভের অধিকার সবার' : 'Equal Justice for Everyone'}</span>
                </span>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  {language === 'bn' ? 'বিনামূল্যে আইনি সহায়তা ও কেস ট্র্যাকিং' : 'Free Legal Aid & Case Tracking'}
                </h2>
                <p className="text-sm text-emerald-100 max-w-lg leading-relaxed">
                  {language === 'bn'
                    ? 'আপনার আবেদনের বর্তমান অগ্রগতি জানুন অথবা ট্র্যাকিং আইডি দিয়ে মামলার সর্বশেষ অবস্থা দেখুন।'
                    : 'Check real-time application progress or enter your tracking ID to view the latest case status.'}
                </p>
              </div>

              {/* Hotline 16430 */}
              <div className="bg-red-600/90 rounded-2xl p-4 text-center shrink-0 border border-red-400 shadow-lg">
                <div className="text-xs uppercase font-extrabold text-red-100 tracking-wider">
                  {language === 'bn' ? 'জাতীয় আইনগত সহায়তা হটলাইন' : 'National Legal Aid Helpline'}
                </div>
                <a
                  href="tel:16430"
                  className="text-2xl sm:text-3xl font-black text-white block my-1 hover:underline tracking-widest font-mono"
                >
                  ১৬৪৩০
                </a>
                <div className="text-[11px] text-red-100 font-semibold bg-red-800/80 px-2 py-0.5 rounded-full inline-block">
                  {language === 'bn' ? 'টোল-ফ্রি · যেকোনো ফোন থেকে ফ্রি' : 'Toll-Free · Free from any phone'}
                </div>
              </div>
            </div>
          </div>

          {/* Search Box */}
          <div className="bg-white rounded-3xl border border-slate-100/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 sm:p-6">
            <h3 className="text-base font-extrabold text-slate-900 mb-3 flex items-center gap-2">
              <Search className="w-5 h-5 text-emerald-700" />
              <span>{language === 'bn' ? 'আবেদনের সর্বশেষ অবস্থা অনুসন্ধান করুন' : 'Search Case Status by Tracking ID'}</span>
            </h3>

            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={trackingInput}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  placeholder={language === 'bn' ? 'ট্র্যাকিং আইডি দিন (যেমন: DLA-2026-0701)' : 'Enter Tracking ID (e.g. DLA-2026-0701)'}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-wider text-slate-900 focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  aria-label={language === 'bn' ? 'আবেদনের ট্র্যাকিং আইডি ইনপুট' : 'Case tracking ID input'}
                />
              </div>
              <button
                type="submit"
                className="min-h-[46px] px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-sm shadow-sm transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Search className="w-4 h-4" />
                <span>{language === 'bn' ? 'অনুসন্ধান' : 'Search'}</span>
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-slate-500">
              <span>{language === 'bn' ? 'নমুনা নম্বর:' : 'Sample IDs:'}</span>
              {['DLA-2026-0701', 'DLA-2026-0814', 'DLA-2026-0792', 'DLA-2026-0831'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    setTrackingInput(num);
                    const all = getStoredCases();
                    const found = all.find((c) => c.trackingNumber === num);
                    if (found) setSearchedCase(found);
                  }}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 rounded-lg font-mono font-semibold border border-slate-200 transition cursor-pointer"
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Searched Case Details */}
          {searchedCase && (
            <div className="bg-white rounded-3xl border border-slate-100/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden space-y-5 p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-500">
                    {language === 'bn' ? 'আবেদন ট্র্যাকিং নম্বর:' : 'Application Tracking Number:'}
                  </div>
                  <div className="text-xl sm:text-2xl font-black font-mono text-emerald-800">
                    {searchedCase.trackingNumber}
                  </div>
                </div>

                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                  {searchedCase.status === 'lawyer_assigned'
                    ? (language === 'bn' ? 'আইনজীবী নিয়োগ সম্পন্ন' : 'Lawyer Assigned')
                    : searchedCase.status === 'adr_scheduled'
                    ? (language === 'bn' ? 'এডিআর মধ্যস্থতা নির্ধারিত' : 'ADR Scheduled')
                    : (language === 'bn' ? 'প্রাথমিক ট্রায়াজ সমাপ্ত' : 'Initial Triage Done')}
                </span>
              </div>

              {/* Hearing Date and Assigned Lawyer Display */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1">
                  <span className="text-xs font-bold text-emerald-950 uppercase flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-700" />
                    <span>{language === 'bn' ? 'পরবর্তী শুনানির তারিখ:' : 'Next Hearing Date:'}</span>
                  </span>
                  <div className="text-base font-extrabold text-slate-900">
                    {searchedCase.nextHearingDate || (language === 'bn' ? 'এখনো তারিখ ধার্য হয়নি' : 'Date not yet assigned')}
                  </div>
                  <div className="text-xs text-slate-600">
                    {language === 'bn' ? 'আদালত' : 'Court'}: {searchedCase.hearingCourtName || searchedCase.policeStation}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 space-y-1">
                  <span className="text-xs font-bold text-teal-950 uppercase flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-teal-700" />
                    <span>{language === 'bn' ? 'নিযুক্ত সরকারি আইনজীবী:' : 'Assigned Government Lawyer:'}</span>
                  </span>
                  <div className="text-base font-extrabold text-slate-900">
                    {cleanLawyerName(searchedCase.assignedLawyer)}
                  </div>
                  <div className="text-xs text-slate-600">
                    {language === 'bn' ? 'ফোন' : 'Phone'}: {searchedCase.assignedLawyerPhone || (language === 'bn' ? 'ডিএলএও হটলাইনে যোগাযোগ করুন' : 'Contact DLAO helpline')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {notFound && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-900 space-y-2">
              <AlertTriangle className="w-8 h-8 text-red-600 mx-auto" />
              <h4 className="font-bold text-base">
                {language === 'bn' ? 'আবেদন নম্বরটি খুঁজে পাওয়া যায়নি' : 'Tracking ID Not Found'}
              </h4>
              <p className="text-xs text-red-700">
                {language === 'bn'
                  ? 'অনুগ্রহ করে ট্র্যাকিং আইডি পুনরায় পরীক্ষা করুন অথবা সরাসরি ১৬৪৩০ নম্বরে কল করে সাহায্য নিন।'
                  : 'Please verify the tracking ID or call 16430 directly for assistance.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
