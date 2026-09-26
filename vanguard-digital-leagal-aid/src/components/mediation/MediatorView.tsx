import React, { useState } from 'react';
import { LegalCase, Language } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { ESignatureComponent } from './ESignatureComponent';
import { getStoredCases } from '../../utils/storage';
import { translateCategory } from '../../utils/translations';
import { 
  Sparkles, 
  AlertTriangle, 
  Scale, 
  FileText, 
  CheckCircle2, 
  Users, 
  Calendar, 
  Clock, 
  ShieldAlert, 
  Save, 
  Printer, 
  RefreshCw, 
  Layers,
  HelpCircle,
  Award,
  ChevronDown
} from 'lucide-react';

interface MediatorViewProps {
  isOnline: boolean;
  onNavigateToDossier?: (caseItem: LegalCase) => void;
  language?: Language;
}

export const MediatorView: React.FC<MediatorViewProps> = ({ 
  isOnline,
  language: propLanguage,
}) => {
  const { language: ctxLanguage } = useLanguage();
  const language = propLanguage || ctxLanguage;

  const cases = getStoredCases();
  // Select active case for mediation or default to the first one
  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    cases.find((c) => c.status === 'adr_scheduled' || c.priority === 'urgent')?.id || cases[0]?.id || 'case-001'
  );

  const activeCase = cases.find((c) => c.id === selectedCaseId) || cases[0];

  // AI Generated Draft state (Challenge T7)
  const [hasGeneratedDraft, setHasGeneratedDraft] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [dismissWarning, setDismissWarning] = useState<boolean>(false);

  // Settlement draft editable parameters
  const [monthlyAllowance, setMonthlyAllowance] = useState<string>('১২,০০০');
  const [childCustodyTerms, setChildCustodyTerms] = useState<string>(
    language === 'en'
      ? 'Child shall remain in the mother’s custody, and father shall visit every Friday'
      : 'সন্তান মায়ের হেফাজতে থাকবে এবং পিতা প্রতি শুক্রবার সাক্ষাৎ করবেন'
  );
  const [rehabilitationPlan, setRehabilitationPlan] = useState<string>(
    language === 'en'
      ? 'Second party shall not inflict physical or mental torture and remains under local UP member supervision'
      : 'দ্বিতীয় পক্ষ কোনো ধরনের মানসিক বা শারীরিক নির্যাতন করবেন না এবং ইউপি সদস্যের নজরদারিতে থাকবেন'
  );

  const handleGenerateAIDraft = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setHasGeneratedDraft(true);
      setDismissWarning(false);
    }, 850);
  };

  const partyAName = activeCase?.provenance?.subjectName || (language === 'en' ? 'Mst. Rahima Khatun' : 'মোছাঃ রহিমা খাতুন');
  const partyBName = language === 'en' ? 'Md. Khalilur Rahman (Second Party)' : 'মোঃ খলিলুর রহমান (দ্বিতীয় পক্ষ)';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Mediator Header Banner */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-emerald-950 text-white rounded-3xl p-6 shadow-xl border border-teal-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-bold border border-teal-500/30">
                <Scale className="w-3.5 h-3.5" />
                <span>
                  {language === 'en' ? 'ADR - Mediation & Settlement' : 'বিকল্প বিরোধ নিষ্পত্তি (ADR)'}
                </span>
              </span>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                {language === 'en' ? 'Role: Authorized Mediator' : 'ভূমিকা: অনুমোদিত মধ্যস্থতাকারী'}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              {language === 'en' ? 'ADR - Mediation & Settlement' : 'বিকল্প বিরোধ নিষ্পত্তি (ADR)'}
            </h2>
            <p className="text-xs sm:text-sm text-teal-100/80 max-w-xl">
              {language === 'en'
                ? 'Peaceful dispute resolution under NLASO, automated AI settlement drafting, and digital e-signature management.'
                : 'আইনগত সহায়তা প্রদান সংস্থা (NLASO) এর অধীনে বিরোধের শান্তিপূর্ণ নিষ্পত্তি, এআই সমঝোতা ড্রাফট তৈরি ও ডিজিটাল স্বাক্ষর ব্যবস্থাপনা।'}
            </p>
          </div>

          {/* Active Case Selector */}
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-2xl border border-white/10 w-full md:w-auto shrink-0 space-y-1.5">
            <span className="text-xs font-semibold text-teal-200 block">
              {language === 'en' ? 'Select Active Mediation Case:' : 'চলতি সালিশি মামলা নির্বাচন করুন:'}
            </span>
            <select
              value={selectedCaseId}
              onChange={(e) => {
                setSelectedCaseId(e.target.value);
                setHasGeneratedDraft(false);
              }}
              className="bg-slate-900 text-white border border-teal-500/40 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold focus:outline-hidden focus:border-teal-400 w-full cursor-pointer"
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.trackingNumber} — {c.provenance.subjectName} ({translateCategory(c.category, language).slice(0, 22)}...)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Case Quick Overview Card */}
      {activeCase && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all border border-slate-100/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0 shadow-md">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  {activeCase.trackingNumber}
                </span>
                <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  {translateCategory(activeCase.category, language)}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                {activeCase.provenance.subjectName} {language === 'en' ? 'vs' : 'বনাম'} {partyBName}
              </h3>
              <p className="text-xs text-slate-600">
                {language === 'en' ? 'Jurisdiction' : 'এখতিয়ার'}: {activeCase.policeStation}, {activeCase.district}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
            <button
              onClick={handleGenerateAIDraft}
              disabled={isGenerating}
              className="w-full md:w-auto min-h-[44px] justify-center px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xs sm:text-sm shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              title={language === 'en' ? 'Generate AI Settlement Draft' : 'এআই স্বয়ংক্রিয় সমঝোতা চুক্তি তৈরি করুন'}
            >
              <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>
                {isGenerating 
                  ? (language === 'en' ? 'Generating AI Draft...' : 'এআই ড্রাফট তৈরি হচ্ছে...') 
                  : (language === 'en' ? 'AI Generate Draft' : 'এআই ড্রাফট তৈরি করুন')}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Draft Settlement Document Container */}
      {hasGeneratedDraft ? (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-3 duration-300">
          {/* Mandatory Warning Flag for Human Mediator */}
          {!dismissWarning && (
            <div
              role="alert"
              className="bg-amber-500/15 border-2 border-amber-500 text-amber-950 p-4 rounded-2xl shadow-sm flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-black text-sm text-amber-950 uppercase tracking-wide">
                    {language === 'en' 
                      ? '⚠️ Warning: Human-in-the-Loop Review Required for AI Clauses'
                      : '⚠️ সতর্কতা: এআই অনুমিত ধারা পর্যালোচনা বাধ্যতামূলক'}
                  </h4>
                  <p className="text-xs sm:text-sm text-amber-900 mt-1 leading-relaxed">
                    {language === 'en'
                      ? 'Highlighted clauses were generated automatically by AI based on dispute severity and court precedents. The authorized mediator must verify each clause with both parties.'
                      : 'চুক্তিপত্রের চিহ্নিত অংশসমূহ কৃত্রিম বুদ্ধিমত্তা পূর্ববর্তী পারিবারিক আদালতের রায় ও বিরোধের মাত্রা বিশ্লেষণ করে প্রস্তুত করেছে। মধ্যস্থতাকারীকে উভয় পক্ষের মৌখিক সম্মতিতে যাচাই ও অনুমোদন করতে হবে।'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDismissWarning(true)}
                className="text-xs font-bold text-amber-900 hover:text-black bg-amber-200/80 px-2.5 py-1 rounded-lg border border-amber-300 shrink-0 cursor-pointer"
              >
                {language === 'en' ? 'Understood ✕' : 'বুঝেছি ✕'}
              </button>
            </div>
          )}

          {/* Draft Settlement Document Container */}
          <div className="bg-white rounded-3xl border border-slate-100/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-8 space-y-6">
            {/* Deed Header */}
            <div className="text-center pb-4 border-b border-slate-200 space-y-1">
              <span className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">
                {language === 'en'
                  ? 'National Legal Aid Services Organization (NLASO)'
                  : 'বাংলাদেশ জাতীয় আইনগত সহায়তা প্রদান সংস্থা (NLASO)'}
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 font-serif">
                {language === 'en' ? 'Deed of Settlement' : 'বিকল্প বিরোধ নিষ্পত্তি ও আপস-মীমাংসাপত্র'}
              </h3>
              <p className="text-xs text-slate-500">
                {language === 'en'
                  ? 'Prepared pursuant to Section 21A, Legal Aid Services Act 2000 & NLASO Rules'
                  : 'আইনগত সহায়তা প্রদান আইন ২০০০ এর ২১ক ধারা এবং লিগ্যাল এইড বিধিমালা অনুসারে প্রস্তুতকৃত'}
              </p>
            </div>

            {/* Parties info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="font-bold text-slate-500 block mb-1">
                  {language === 'en' ? 'First Party (Complainant / Wife):' : 'প্রথম পক্ষ (অভিযোগকারী / স্ত্রী):'}
                </span>
                <p className="font-bold text-slate-900 text-sm">{partyAName}</p>
                <p className="text-slate-600">
                  {language === 'en' ? 'Address' : 'ঠিকানা'}: {activeCase?.provenance?.subjectAddress}
                </p>
                <span className="inline-block mt-1 text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                  {language === 'en' ? 'Verified' : 'যাচাইকৃত পরিচয়'}
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-500 block mb-1">
                  {language === 'en' ? 'Second Party (Opposite Party / Husband):' : 'দ্বিতীয় পক্ষ (প্রতিপক্ষ / স্বামী):'}
                </span>
                <p className="font-bold text-slate-900 text-sm">{partyBName}</p>
                <p className="text-slate-600">
                  {language === 'en' ? 'Address' : 'ঠিকানা'}: {activeCase?.policeStation}, {activeCase?.district}
                </p>
                <span className="inline-block mt-1 text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded">
                  {language === 'en' ? 'Authorized Appearance' : 'অনুমোদিত হাজিরানা'}
                </span>
              </div>
            </div>

            {/* Standard Text vs Visible AI-Generated / Inferred Highlighted Clauses */}
            <div className="space-y-4 text-sm text-slate-800 leading-relaxed">
              <p>
                {language === 'en'
                  ? 'Whereas a mediation hearing was conducted at the District Legal Aid Office to resolve marital disputes between First Party and Second Party, both parties voluntarily agree to the following terms without coercion:'
                  : 'যেহেতু প্রথম পক্ষ ও দ্বিতীয় পক্ষের মধ্যকার দাম্পত্য ও পারিবারিক বিরোধ নিষ্পত্তির লক্ষ্যে বিজ্ঞ জেলা লিগ্যাল এইড কর্মকর্তার কার্যালয়ে সালিশি শুনানি অনুষ্ঠিত হয় এবং উভয় পক্ষ কোনো প্রকার বলপ্রয়োগ ব্যতীত স্বেচ্ছায় নিম্নোক্ত শর্তাবলীতে সম্মত হইলেন:'}
              </p>

              {/* Clause 1: Standard text */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">
                  {language === 'en' ? 'Clause 1 (Dispute Renunciation):' : 'ধারা ১ (বিরোধ পরিহার):'}
                </span>
                <span>
                  {language === 'en'
                    ? 'Both parties commit to resolving past grievances and maintaining a peaceful, respectful standard of living.'
                    : 'উভয় পক্ষ অতীতের সকল ভুল বোঝাবুঝি ও মনোমালিন্য দূর করিয়া ভবিষ্যতে শান্তিপূর্ণ ও মর্যাদাপূর্ণ সামাজিক জীবন পরিচালনায় প্রতিশ্রুতিবদ্ধ হইলেন।'}
                </span>
              </div>

              {/* Clause 2: VISIBLY HIGHLIGHTED AI-GENERATED / INFERRED SECTION */}
              <div className="p-4 rounded-xl bg-indigo-50 border-2 border-indigo-400 text-indigo-950 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold flex items-center gap-1.5 text-indigo-900">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>
                      {language === 'en'
                        ? 'Clause 2 (Maintenance & Allowance) — [AI Inferred]'
                        : 'ধারা ২ (ভরণপোষণ ও খোরপোশ) — [এআই প্রস্তাবিত]'}
                    </span>
                  </span>
                  <span className="text-[10px] font-bold font-mono bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded-full">
                    {language === 'en' ? 'AI Inferred' : 'এআই প্রস্তাবিত'}
                  </span>
                </div>
                <p className="text-xs text-indigo-900/90 italic">
                  {language === 'en'
                    ? '*Inferred automatically by AI analyzing financial conditions and legal aid precedents:'
                    : '*এই ধারাটি আবেদনকারীর আর্থিক অসচ্ছলতা ও পূর্ববর্তী মামলার ডেটাসেট বিশ্লেষণ করে এআই দ্বারা তৈরি:'}
                </p>
                <div className="bg-white p-3 rounded-lg border border-indigo-200 text-slate-800">
                  {language === 'en' ? (
                    <span>
                      Second party shall pay First Party and minor children a monthly maintenance allowance of{' '}
                      <span className="bg-indigo-100 px-2 py-0.5 rounded font-bold text-indigo-900 border border-indigo-300">
                        BDT 12,000 (Twelve Thousand)
                      </span>{' '}
                      between the 1st and 7th of every month.
                    </span>
                  ) : (
                    <span>
                      দ্বিতীয় পক্ষ প্রতি মাসের ১ থেকে ৭ তারিখের মধ্যে প্রথম পক্ষ ও নাবালক সন্তানের মাসিক ভরণপোষণ বাবদ নগদ/বিকাশ যোগে{' '}
                      <span className="bg-indigo-100 px-2 py-0.5 rounded font-bold text-indigo-900 border border-indigo-300">
                        ৳ ১২,০০০ (বারো হাজার টাকা)
                      </span>{' '}
                      প্রদান করিতে বাধ্য থাকিবেন।
                    </span>
                  )}
                </div>
              </div>

              {/* Clause 3: VISIBLY HIGHLIGHTED AI-GENERATED / INFERRED SECTION */}
              <div className="p-4 rounded-xl bg-purple-50 border-2 border-purple-400 text-purple-950 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold flex items-center gap-1.5 text-purple-900">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span>
                      {language === 'en'
                        ? 'Clause 3 (Child Custody & Safety) — [AI Inferred]'
                        : 'ধারা ৩ (সন্তানের হেফাজত ও নিরাপত্তা) — [এআই প্রস্তাবিত]'}
                    </span>
                  </span>
                  <span className="text-[10px] font-bold font-mono bg-purple-200 text-purple-900 px-2 py-0.5 rounded-full">
                    {language === 'en' ? 'AI Inferred' : 'এআই প্রস্তাবিত'}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-purple-200 text-slate-800">
                  <span className="bg-purple-100 px-2 py-0.5 rounded font-bold text-purple-900 border border-purple-300">
                    {childCustodyTerms}
                  </span>
                  <span>
                    {language === 'en'
                      ? '. Both parties shall jointly bear healthcare and educational costs without disrupting the child’s mental growth.'
                      : '। সন্তানের শিক্ষা ও চিকিৎসার যাবতীয় খরচ উভয় পক্ষ যৌথভাবে বহন করিবেন এবং সন্তানের মানসিক বিকাশে কোনো বাধা প্রদান করা যাইবে না।'}
                  </span>
                </div>
              </div>

              {/* Clause 4: VISIBLY HIGHLIGHTED AI-GENERATED / INFERRED SECTION */}
              <div className="p-4 rounded-xl bg-teal-50 border-2 border-teal-400 text-teal-950 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold flex items-center gap-1.5 text-teal-900">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    <span>
                      {language === 'en'
                        ? 'Clause 4 (Protection & Monitoring) — [AI Safety Rule]'
                        : 'ধারা ৪ (সহিংসতা প্রতিরোধ ও পর্যবেক্ষণ) — [এআই সুরক্ষা নীতি]'}
                    </span>
                  </span>
                  <span className="text-[10px] font-bold font-mono bg-teal-200 text-teal-900 px-2 py-0.5 rounded-full">
                    {language === 'en' ? 'Safety Rule' : 'সুরক্ষা নীতি'}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-teal-200 text-slate-800">
                  <span>
                    {language === 'en' ? 'Second party or relatives ' : 'দ্বিতীয় পক্ষ বা তাহার আত্মীয়স্বজন কর্তৃক '}
                  </span>
                  <span className="bg-teal-100 px-2 py-0.5 rounded font-bold text-teal-900 border border-teal-300">
                    {rehabilitationPlan}
                  </span>
                  <span>
                    {language === 'en'
                      ? '. Any violation shall trigger immediate judicial escalation under Domestic Violence Act 2010.'
                      : '। এই শর্ত লঙ্ঘন করিলে স্থানীয় লিগ্যাল এইড অফিসার সরাসরি পারিবারিক সহিংসতা প্রতিরোধ আইন ২০১০ এর অধীনে আদালতে প্রতিকার তলব করিবেন।'}
                  </span>
                </div>
              </div>

              {/* Clause 5: Standard legal closing */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">
                  {language === 'en' ? 'Clause 5 (Decree Equivalency):' : 'ধারা ৫ (আদালতের ডিক্রি সমতুল্য):'}
                </span>
                <span>
                  {language === 'en'
                    ? 'This settlement deed is legally binding upon both parties and enforceable as a decree of the civil court under the Legal Aid Act.'
                    : 'উক্ত আপসনামা উভয় পক্ষের ওপর আইনত বাধ্যতামূলক এবং লিগ্যাল এইড অ্যাক্ট অনুযায়ী এটি আদালতের ডিক্রির ন্যায় বলবৎযোগ্য থাকিবে।'}
                </span>
              </div>
            </div>

            {/* Mediator Review Confirmation Control */}
            <div className="p-4 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-xs sm:text-sm font-bold text-slate-900">
                  {language === 'en'
                    ? 'All AI settlement terms reviewed and verified by authorized Mediator.'
                    : 'বিজ্ঞ মধ্যস্থতাকারী হিসেবে এআই ড্রাফটের সকল শর্ত পর্যালোচনা সম্পন্ন হয়েছে।'}
                </span>
              </div>
              <span className="text-xs bg-emerald-700 text-white font-bold px-3 py-1 rounded-lg">
                {language === 'en' ? 'Approved' : 'অনুমোদিত'}
              </span>
            </div>
          </div>

          {/* E-Signature Component */}
          <ESignatureComponent
            partyAName={partyAName}
            partyARole={language === 'en' ? 'First Party (Complainant / Victim)' : 'প্রথম পক্ষ (অভিযোগকারী / ভুক্তভোগী)'}
            partyBName={partyBName}
            partyBRole={language === 'en' ? 'Second Party (Opposite Party / Husband)' : 'দ্বিতীয় পক্ষ (প্রতিপক্ষ / স্বামী)'}
            isOnline={isOnline}
            language={language}
          />
        </div>
      ) : (
        /* Empty State before clicking 'AI Generate Draft' */
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 mx-auto flex items-center justify-center shadow-xs">
            <Sparkles className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900">
              {language === 'en' ? 'AI Settlement Draft not generated yet' : 'এআই সমঝোতা চুক্তিপত্র এখনো তৈরি হয়নি'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              {language === 'en'
                ? 'Click the "AI Generate Draft" button above to synthesize a legally binding settlement deed with offline e-signature capabilities.'
                : 'খসড়া চুক্তিপত্র তৈরি করতে এবং অফলাইন ই-স্বাক্ষর উন্মুক্ত করতে উপরের বাটনে চাপুন।'}
            </p>
          </div>
          <button
            onClick={handleGenerateAIDraft}
            disabled={isGenerating}
            className="px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm shadow-md transition active:scale-95 inline-flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{language === 'en' ? 'AI Generate Draft' : 'এআই ড্রাফট তৈরি করুন'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
