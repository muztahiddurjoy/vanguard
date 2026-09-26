import React, { useState, useEffect } from 'react';
import { LegalCase, Language } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { TriageCard } from './TriageCard';
import { CaseDetailModal } from './CaseDetailModal';
import { PatternAlert } from './PatternAlert';
import { getStoredCases } from '../../utils/storage';
import { translateCategory, translateAISummary } from '../../utils/translations';
import { 
  AlertTriangle, 
  Clock, 
  Sparkles, 
  Filter, 
  Search, 
  PlusCircle, 
  CheckCircle,
  Building,
  RefreshCw,
  Baby,
  ShieldAlert
} from 'lucide-react';

interface TriageDashboardProps {
  onNavigateToIntake?: () => void;
  language?: Language;
}

export const TriageDashboard: React.FC<TriageDashboardProps> = ({ 
  onNavigateToIntake,
  language: propLanguage,
}) => {
  const { language: ctxLanguage } = useLanguage();
  const language = propLanguage || ctxLanguage;

  const [cases, setCases] = useState<LegalCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<LegalCase | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'urgent' | 'overdue' | 'child_danger' | 'proxy' | 'sensitive'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadCases = () => {
    setCases(getStoredCases());
  };

  useEffect(() => {
    loadCases();
    window.addEventListener('legal_aid_cases_updated', loadCases);
    return () => {
      window.removeEventListener('legal_aid_cases_updated', loadCases);
    };
  }, []);

  // Backlog Live Counts:
  const newCount = cases.filter((c) => c.status === 'new').length;
  const urgentCount = cases.filter((c) => c.priority === 'urgent').length;
  const overdueCount = cases.filter((c) => c.isOverdue).length;

  // Filter & Search logic
  const filteredCases = cases.filter((c) => {
    if (filterType === 'urgent' && c.priority !== 'urgent') return false;
    if (filterType === 'overdue' && !c.isOverdue) return false;
    if (filterType === 'child_danger' && !c.hasChildInDanger) return false;
    if (filterType === 'proxy' && !c.provenance.isProxy) return false;
    if (filterType === 'sensitive' && !c.isSensitive && c.category !== 'Sensitive/Image Harassment') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const subjectName = c.provenance.subjectName.toLowerCase();
      const callerName = c.provenance.callerName.toLowerCase();
      const tracking = c.trackingNumber.toLowerCase();
      const summary = c.aiSummary.toLowerCase();
      const translatedSummary = translateAISummary(c.aiSummary, language).toLowerCase();
      const cat = translateCategory(c.category, language).toLowerCase();
      const district = c.district.toLowerCase();
      return (
        subjectName.includes(q) ||
        callerName.includes(q) ||
        tracking.includes(q) ||
        summary.includes(q) ||
        translatedSummary.includes(q) ||
        cat.includes(q) ||
        district.includes(q)
      );
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Strip: Live counts */}
      <section
        aria-label={language === 'bn' ? 'ট্রায়াজ লাইভ স্ট্যাটাস' : 'Triage live status'}
        className="rounded-3xl bg-linear-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-800/80"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-widest">
              <Building className="w-4 h-4" />
              <span>{language === 'bn' ? 'জেলা লিগ্যাল এইড কর্মকর্তা ট্রায়াজ কনসোল' : 'District Legal Aid Officer (DLAO) Triage'}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
              {language === 'bn' ? 'আইনগত সহায়তা আবেদন ব্যাকলগ ও তাৎক্ষণিক মূল্যায়ন' : 'Legal Aid Application Backlog & Instant Triage'}
            </h2>
          </div>

          {/* Live Counts */}
          <div
            className="grid grid-cols-3 gap-1.5 sm:gap-2 bg-slate-950/60 p-2 sm:p-2.5 rounded-xl border border-slate-700/80 shadow-inner w-full md:w-auto text-center"
            role="status"
            aria-live="polite"
          >
            {/* New */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                <span className="font-extrabold text-sm sm:text-base font-mono">{newCount}</span>
              </div>
              <span className="text-[11px] sm:text-xs font-semibold">{language === 'bn' ? 'নতুন' : 'New'}</span>
            </div>

            {/* Urgent */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40">
              <div className="flex items-center gap-1">
                <span className="text-red-400 font-black text-xs">▲</span>
                <span className="font-extrabold text-sm sm:text-base font-mono">{urgentCount}</span>
              </div>
              <span className="text-[11px] sm:text-xs font-semibold">{language === 'bn' ? 'জরুরি' : 'Urgent'}</span>
            </div>

            {/* Overdue */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-extrabold text-sm sm:text-base font-mono">{overdueCount}</span>
              </div>
              <span className="text-[11px] sm:text-xs font-semibold truncate">{language === 'bn' ? 'মেয়াদোত্তীর্ণ' : 'Overdue'}</span>
            </div>
          </div>
        </div>

        {/* Quick helper note */}
        <div className="mt-3 pt-3 border-t border-slate-700/60 flex flex-wrap items-center justify-between text-xs text-slate-300 gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              {language === 'bn'
                ? 'কৃত্রিম বুদ্ধিমত্তা প্রতিটি আবেদনের নির্যাতন মাত্রা, প্রক্সি ভেরিফিকেশন ও শিশু ঝুঁকি বিশ্লেষণ করে অগ্রাধিকার সাজিয়েছে।'
                : 'AI analyzes violence severity, proxy verification, and child risk to prioritize backlog cases.'}
            </span>
          </div>
          {onNavigateToIntake && (
            <button
              onClick={onNavigateToIntake}
              className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'নতুন ইনটেক শুরু' : 'Start Intake'}</span>
            </button>
          )}
        </div>
      </section>

      {/* Challenge T1: Pattern Alert for Lawyer Inactivity Threshold */}
      <PatternAlert onReassigned={loadCases} language={language} />

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Filter Pills with smooth momentum touch scrolling and no scrollbar */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-1.5 sm:pb-0 no-scrollbar smooth-touch-scroll"
          role="tablist"
          aria-label={language === 'bn' ? 'মামলা ফিল্টার' : 'Filter cases'}
        >
          <button
            onClick={() => setFilterType('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap active:scale-95 cursor-pointer ${
              filterType === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            {language === 'bn' ? 'সকল আবেদন' : 'All Cases'} ({cases.length})
          </button>

          <button
            onClick={() => setFilterType('urgent')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 active:scale-95 cursor-pointer ${
              filterType === 'urgent'
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-white text-red-700 border border-red-200 hover:bg-red-50'
            }`}
          >
            <span>▲ {language === 'bn' ? 'জরুরি' : 'Urgent'} ({urgentCount})</span>
          </button>

          <button
            onClick={() => setFilterType('overdue')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 active:scale-95 cursor-pointer ${
              filterType === 'overdue'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50'
            }`}
          >
            <span>{language === 'bn' ? 'মেয়াদোত্তীর্ণ' : 'Overdue'} ({overdueCount})</span>
          </button>

          <button
            onClick={() => setFilterType('child_danger')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 active:scale-95 cursor-pointer ${
              filterType === 'child_danger'
                ? 'bg-purple-700 text-white shadow-sm'
                : 'bg-white text-purple-800 border border-purple-200 hover:bg-purple-50'
            }`}
          >
            <Baby className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'শিশু ঝুঁকিতে' : 'Child at Risk'}</span>
          </button>

          <button
            onClick={() => setFilterType('proxy')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 active:scale-95 cursor-pointer ${
              filterType === 'proxy'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
            }`}
          >
            <span>{language === 'bn' ? 'প্রক্সি আবেদন' : 'Proxy Cases'}</span>
          </button>

          <button
            onClick={() => setFilterType('sensitive')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 active:scale-95 cursor-pointer ${
              filterType === 'sensitive'
                ? 'bg-purple-800 text-white shadow-sm'
                : 'bg-white text-purple-900 border border-purple-300 hover:bg-purple-50'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'সংবেদনশীল কেস' : 'Sensitive Cases'}</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'bn' ? 'নাম, ট্র্যাকিং বা জেলা খুঁজুন...' : 'Search by name, tracking ID, district...'}
            className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-base sm:text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
            aria-label={language === 'bn' ? 'মামলা অনুসন্ধান' : 'Search cases'}
          />
        </div>
      </div>

      {/* Triage Cards Grid */}
      <div className="space-y-5" role="feed" aria-label={language === 'bn' ? 'ট্রায়াজ মামলার তালিকা' : 'Triage cases feed'}>
        {filteredCases.length > 0 ? (
          filteredCases.map((c) => (
            <TriageCard
              key={c.id}
              legalCase={c}
              onSelect={(selected) => setSelectedCase(selected)}
              language={language}
            />
          ))
        ) : (
          <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-10 text-center space-y-3">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">
              {language === 'bn' ? 'কোনো অমীমাংসিত আবেদন পাওয়া যায়নি' : 'No pending cases found'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {language === 'bn'
                ? 'আপনার নির্বাচিত ফিল্টার বা সার্চ কোয়েরি অনুযায়ী কোনো রেকর্ড নেই। ফিল্টার পরিবর্তন করুন অথবা রিসেট করুন।'
                : 'No records match your selected filter or search criteria. Try adjusting or resetting filters.'}
            </p>
            <button
              onClick={() => {
                setFilterType('all');
                setSearchQuery('');
              }}
              className="text-xs font-bold text-emerald-700 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
            >
              {language === 'bn' ? 'ফিল্টার রিসেট করুন' : 'Reset Filters'}
            </button>
          </div>
        )}
      </div>

      {/* Slide-out Detailed Modal Panel */}
      {selectedCase && (
        <CaseDetailModal
          legalCase={selectedCase}
          onClose={() => setSelectedCase(null)}
          onUpdateCase={(updated) => {
            setSelectedCase(updated);
            loadCases();
          }}
          language={language}
        />
      )}
    </div>
  );
};
