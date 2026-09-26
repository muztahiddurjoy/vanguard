import React, { useState } from 'react';
import { TrafficLightSyncIndicator } from '../common/TrafficLightSyncIndicator';
import { 
  addToOfflineQueue, 
  getOfflineQueue, 
  saveCases, 
  getStoredCases, 
  syncOfflineQueueToMain 
} from '../../utils/storage';
import { LegalCase, PriorityLevel, Language } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { translateCategory, cleanPersonName } from '../../utils/translations';
import { 
  Smartphone, 
  Mic, 
  MicOff, 
  Users, 
  UserCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Save, 
  RefreshCw, 
  ShieldAlert, 
  Volume2, 
  Sparkles, 
  Wifi, 
  WifiOff, 
  FileText, 
  Baby, 
  CheckSquare, 
  Layers
} from 'lucide-react';

interface UDCAssistedIntakeProps {
  isOnline: boolean;
  simulatedOffline: boolean;
  onToggleSimulatedNetwork: (offline: boolean) => void;
  onNavigateToDashboard?: () => void;
  language?: Language;
}

export const UDCAssistedIntake: React.FC<UDCAssistedIntakeProps> = ({
  isOnline,
  simulatedOffline,
  onToggleSimulatedNetwork,
  onNavigateToDashboard,
  language: propLanguage,
}) => {
  const { language: ctxLanguage } = useLanguage();
  const language = propLanguage || ctxLanguage;

  // Form State
  const [isProxy, setIsProxy] = useState<boolean>(true);
  const [callerName, setCallerName] = useState<string>(
    language === 'en' ? 'Mst. Salma Khatun' : 'মোছাঃ সালমা খাতুন'
  );
  const [callerPhone, setCallerPhone] = useState<string>(
    language === 'en' ? '01728-940512' : '০১৭২৮-৯৪০৫১২'
  );
  const [callerRelation, setCallerRelation] = useState<string>(
    language === 'en' ? 'Ward Representative' : 'ইউপি সদস্যা'
  );
  const [callerNid, setCallerNid] = useState<string>('19842615480000452');

  const [subjectName, setSubjectName] = useState<string>(
    language === 'en' ? 'Mst. Morium Begum' : 'মোছাঃ মরিয়ম বেগম'
  );
  const [subjectAge, setSubjectAge] = useState<string>(language === 'en' ? '27' : '২৭');
  const [subjectAddress, setSubjectAddress] = useState<string>(
    language === 'en' ? 'Village: Baniachong, Habiganj' : 'গ্রাম: বানিয়াচং, হবিগঞ্জ'
  );
  const [category, setCategory] = useState<string>('পারিবারিক সহিংসতা ও যৌতুক');
  const [priority, setPriority] = useState<PriorityLevel>('urgent');
  const [hasChildInDanger, setHasChildInDanger] = useState<boolean>(true);
  const [safetyRisk, setSafetyRisk] = useState<boolean>(true);
  const [policeStation, setPoliceStation] = useState<string>(
    language === 'en' ? 'Baniachong Police Station' : 'বানিয়াচং থানা'
  );
  const [district, setDistrict] = useState<string>(language === 'en' ? 'Habiganj' : 'হবিগঞ্জ');
  const [incidentDescription, setIncidentDescription] = useState<string>(
    language === 'en'
      ? 'Victim has been physically assaulted by husband and in-laws for the last two days over dowry. 3-year-old child is present and vulnerable. Seeking urgent protection.'
      : 'ভুক্তভোগীকে স্বামী ও শ্বশুরবাড়ির লোকজন টানা দুদিন যাবত মারধর করছে। সাথে ৩ বছরের সন্তান আছে। চিকিৎসার সুযোগ দেওয়া হচ্ছে না। ইউডিসি উদ্যোক্তার কাছে কান্নাকাটি করে নিরাপত্তা ও আইনি সহায়তা চেয়েছেন।'
  );
  const [desiredRelief, setDesiredRelief] = useState<string>(
    language === 'en'
      ? 'Immediate legal protection, emergency shelter with child, and government panel lawyer assignment.'
      : 'অবিলম্বে আইনি নিরাপত্তা, সন্তানসহ আশ্রয় এবং সরকারি খরচে বিজ্ঞ প্যানেল আইনজীবী নিয়োগ।'
  );

  // Audio Voice Recording Simulation for illiterate citizens
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [audioRecorded, setAudioRecorded] = useState<boolean>(true);
  const [recordedDuration, setRecordedDuration] = useState<string>(language === 'en' ? '01:15' : '০১:১৫');

  // Submission feedback
  const [saveToast, setSaveToast] = useState<{ message: string; isOffline: boolean } | null>(null);

  // Auto-fill preset for quick demonstration
  const handleAutoFill = (type: 'violence' | 'land' | 'maintenance') => {
    if (type === 'violence') {
      setIsProxy(true);
      setCallerName(language === 'en' ? 'Roksana Akhter' : 'রোকসানা আক্তার');
      setCallerPhone(language === 'en' ? '01819-334251' : '০১৮১৯-৩৩৪২৫১');
      setCallerRelation(language === 'en' ? 'Neighbor & Local Helper' : 'প্রতিবেশী ও স্থানীয় সাহায্যকারী');
      setSubjectName(language === 'en' ? 'Farida Parveen' : 'ফরিদা পারভীন');
      setSubjectAge(language === 'en' ? '22' : '২২');
      setSubjectAddress(language === 'en' ? 'Village: Char Kolmi, Tazumuddin, Bhola' : 'গ্রাম: চর কলমি, তজুমদ্দিন, ভোলা');
      setCategory('পারিবারিক সহিংসতা ও যৌতুক');
      setPriority('urgent');
      setHasChildInDanger(true);
      setSafetyRisk(true);
      setPoliceStation(language === 'en' ? 'Tazumuddin Police Station' : 'তজুমদ্দিন থানা');
      setDistrict(language === 'en' ? 'Bhola' : 'ভোলা');
      setIncidentDescription(
        language === 'en'
          ? 'Victim was injured with sharp weapons over dowry demands. First aid received at local hospital. Currently taking refuge with a neighbor. Perpetrators are threatening.'
          : 'যৌতুকের জন্য ভুক্তভোগীকে ধারালো অস্ত্র দিয়ে জখম করা হয়েছে। স্থানীয় হাসপাতালে প্রাথমিক চিকিৎসা দেওয়া হয়েছে। বর্তমানে প্রতিবেশীর আশ্রয়ে আছেন। অপরাধী পক্ষ হুমকি দিচ্ছে।'
      );
      setDesiredRelief(
        language === 'en'
          ? 'Security protection, victim support shelter, and government legal aid for criminal prosecution.'
          : 'নিরাপত্তা বিধান, ভিকটিম সাপোর্ট সেন্টারে প্রেরণ ও ফৌজদারি মামলা পরিচালনায় আইনি সহায়তা।'
      );
    } else if (type === 'land') {
      setIsProxy(false);
      setCallerName(language === 'en' ? 'Md. Abdur Rahim' : 'মোঃ আব্দুর রহিম');
      setCallerPhone(language === 'en' ? '01731-894012' : '০১৭৩১-৮৯৪০১২');
      setCallerRelation(language === 'en' ? 'Victim Directly' : 'ভুক্তভোগী নিজে');
      setSubjectName(language === 'en' ? 'Md. Abdur Rahim' : 'মোঃ আব্দুর রহিম');
      setSubjectAge(language === 'en' ? '65' : '৬৫');
      setSubjectAddress(language === 'en' ? 'Village: Shivpur, Bhairab, Kishoreganj' : 'গ্রাম: শিবপুর, ভৈরব, কিশোরগঞ্জ');
      setCategory('জমি জবরদখল ও এতিমের সম্পত্তি বেদখল');
      setPriority('medium');
      setHasChildInDanger(false);
      setSafetyRisk(false);
      setPoliceStation(language === 'en' ? 'Bhairab Police Station' : 'ভৈরব থানা');
      setDistrict(language === 'en' ? 'Kishoreganj' : 'কিশোরগঞ্জ');
      setIncidentDescription(
        language === 'en'
          ? 'Local influential group forged deeds to usurp 20 decimals of ancestral homestead land. In old age, cannot afford repeated court travel and expenses.'
          : 'পৈতৃক ভিটার ২০ শতাংশ জমি স্থানীয় প্রভাবশালী পক্ষ জাল কাগজ তৈরি করে জবরদখল করেছে। বৃদ্ধ বয়সে আদালতে বারবার গিয়ে খরচ বহন করার সামর্থ্য নেই।'
      );
      setDesiredRelief(
        language === 'en'
          ? 'Call for ADR mediation from DLAO office and civil case assistance.'
          : 'ডিএলএও কার্যালয় হতে এডিআর (বিকল্প বিরোধ নিষ্পত্তি) তলব ও দেওয়ানি সহায়তা।'
      );
    } else {
      setIsProxy(true);
      setCallerName(language === 'en' ? 'Mst. Khadija Begum' : 'মোছাঃ খাদিজা বেগম');
      setCallerPhone(language === 'en' ? '01611-987654' : '০১৬১১-৯৮৭৬৫৪');
      setCallerRelation(language === 'en' ? 'Mother' : 'মা');
      setSubjectName(language === 'en' ? 'Afsana Akhter' : 'আফসানা আক্তার');
      setSubjectAge(language === 'en' ? '19' : '১৯');
      setSubjectAddress(language === 'en' ? 'Kaliganj, Jhenaidah' : 'কালীগঞ্জ, ঝিনাইদহ');
      setCategory('দেনমোহর ও সন্তানের ভরণপোষণ');
      setPriority('routine');
      setHasChildInDanger(false);
      setSafetyRisk(false);
      setPoliceStation(language === 'en' ? 'Kaliganj Police Station' : 'কালীগঞ্জ থানা');
      setDistrict(language === 'en' ? 'Jhenaidah' : 'ঝিনাইদহ');
      setIncidentDescription(
        language === 'en'
          ? 'Husband has not provided living costs for a year. Married second wife with verbal divorce threats. Has not paid dower.'
          : 'স্বামী গত এক বছর ধরে কোনো খরচ দিচ্ছেন না। তালাকের মৌখিক হুমকি দিয়ে দ্বিতীয় বিবাহ করেছেন। কোনো দেনমোহর পরিশোধ করেননি।'
      );
      setDesiredRelief(
        language === 'en'
          ? 'Government legal aid for dower and maintenance suit in family court.'
          : 'পারিবারিক আদালতে দেনমোহর ও খোরপোশ মোকদ্দমার জন্য সরকারি লিগ্যাল এইড।'
      );
    }
  };

  // Handle Form Submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trackingNumber = `DLA-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const newCase: LegalCase = {
      id: `case-${Date.now()}`,
      trackingNumber,
      createdAt: new Date().toISOString(),
      timeAgo: isOnline 
        ? (language === 'en' ? 'Just now' : 'এইমাত্র')
        : (language === 'en' ? 'Pending on device' : 'ডিভাইসে অপেক্ষমাণ'),
      priority,
      category,
      aiSummary: generateAISummary(category, hasChildInDanger, priority, incidentDescription),
      aiConfidenceScore: 95,
      aiSuggestedAction: priority === 'urgent'
        ? (language === 'en' ? 'Immediate police protection and urgent DLAO intervention' : 'জরুরি পুলিশ প্রোটেকশন ও বিজ্ঞ ডিএলএও কর্মকর্তার তাৎক্ষণিক তলব')
        : (language === 'en' ? 'ADR mediation or panel lawyer nomination' : 'এডিআর বৈঠক বা প্যানেল আইনজীবী মনোনয়ন'),
      channel: 'udc',
      channelLabel: language === 'en' ? 'Union Digital Center' : 'ইউনিয়ন ডিজিটাল সেন্টার',
      status: 'new',
      isOverdue: false,
      provenance: {
        callerName: callerName.trim() || (language === 'en' ? 'Anonymous Helper' : 'অজ্ঞাত সাহায্যকারী'),
        callerPhone: callerPhone.trim() || (language === 'en' ? '01700-000000' : '০১৭০০-০০০০০০'),
        callerNid: callerNid.trim() || '19902615480000000',
        callerVerification: 'verified',
        callerRelation: isProxy ? callerRelation : (language === 'en' ? 'Victim Directly' : 'ভুক্তভোগী নিজে'),
        subjectName: subjectName.trim() || (language === 'en' ? 'Anonymous Subject' : 'অজ্ঞাত ভুক্তভোগী'),
        subjectAge: subjectAge ? parseInt(subjectAge) : 25,
        subjectGender: 'নারী',
        subjectVerification: isProxy ? 'unconfirmed' : 'verified',
        subjectAddress: subjectAddress.trim() || (language === 'en' ? 'UDC Jurisdiction Area' : 'ইউনিয়ন ডিজিটাল সেন্টার এলাকা'),
        isProxy,
        proxyConsentObtained: true,
        safetyAlert: safetyRisk 
          ? (language === 'en' 
              ? 'Severe safety risk to victim. Direct public contact is prohibited.' 
              : 'ভুক্তভোগীর জীবন ও নিরাপত্তার চরম ঝুঁকি রয়েছে। সরাসরি প্রকাশ্যে যোগাযোগ নিষিদ্ধ।')
          : undefined,
      },
      incidentDescription,
      desiredRelief,
      hasChildInDanger,
      policeStation,
      district,
      upazila: district ? `${district} Sadar` : (language === 'en' ? 'Upazila Parishad' : 'উপজেলা পরিষদ'),
      unionParishad: language === 'en' ? 'Union Digital Center Jurisdiction' : 'ইউনিয়ন ডিজিটাল সেন্টার অধিক্ষেত্র',
      audioDuration: audioRecorded ? recordedDuration : undefined,
      audioTranscript: audioRecorded ? incidentDescription.slice(0, 80) + '...' : undefined,
      evidenceFiles: [
        { name: 'UDC_Application_Intake.pdf', type: 'application/pdf', size: '240 KB' },
        { name: 'Applicant_Biometric_Log.dat', type: 'application/octet-stream', size: '48 KB' }
      ]
    };

    if (!isOnline) {
      // OFFLINE STATE: Save to mock localStorage queue
      addToOfflineQueue(newCase);
      setSaveToast({
        message: language === 'en'
          ? `Application saved safely on your device without internet! (Tracking: ${trackingNumber})`
          : `আবেদনটি ইন্টারনেট ছাড়াই আপনার ডিভাইসে নিরাপদে সংরক্ষিত হয়েছে! (ট্র্যাকিং: ${trackingNumber})`,
        isOffline: true,
      });
    } else {
      // ONLINE STATE: Save directly to main cases
      const existing = getStoredCases();
      saveCases([newCase, ...existing]);
      setSaveToast({
        message: language === 'en'
          ? `Application successfully submitted to central DLAO dashboard! (Tracking: ${trackingNumber})`
          : `আবেদনটি কেন্দ্রীয় ডিএলএও ড্যাশবোর্ডে সফলভাবে প্রেরিত হয়েছে! (ট্র্যাকিং: ${trackingNumber})`,
        isOffline: false,
      });
    }

    setTimeout(() => {
      setSaveToast(null);
    }, 4500);
  };

  const generateAISummary = (
    cat: string,
    child: boolean,
    prio: PriorityLevel,
    desc: string
  ) => {
    if (prio === 'urgent' && child) {
      return language === 'en'
        ? 'Ongoing violence + Child at risk'
        : 'শারীরিক নির্যাতন চলমান ও কোলে শিশু বিপন্ন';
    }
    if (prio === 'urgent') {
      return language === 'en'
        ? 'Critical threat + Physical danger'
        : 'চরম শারীরিক ঝুঁকি ও তাৎক্ষণিক উদ্ধার প্রয়োজন';
    }
    if (cat.includes('জমি') || cat.includes('Land')) {
      return language === 'en'
        ? 'Land encroachment + Marginalized family'
        : 'বসতভিটা বেদখল ও দেওয়ানি প্রতিকার প্রার্থনা';
    }
    return language === 'en'
      ? `${translateCategory(cat, 'en')} - Legal counsel requested`
      : `${translateCategory(cat, 'bn')} - আইনি সহায়তা প্রার্থনা`;
  };

  const offlineQueue = getOfflineQueue();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Traffic Light Sync Indicator */}
      <section aria-label={language === 'en' ? 'Network sync traffic light status' : 'নেটওয়ার্ক সিঙ্ক ট্রাফিক লাইট স্ট্যাটাস'}>
        <TrafficLightSyncIndicator
          isOnline={isOnline}
          showQueueDetails={true}
          language={language}
        />
      </section>

      {/* Hero Banner: UDC Assisted Intake Orientation */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-md">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-900">
                {language === 'en' ? 'UDC Assisted Intake Form' : 'ইউডিসি সহকারী ইনটেক ফর্ম'}
              </h2>
              <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                {language === 'en' ? 'Offline-First' : 'অফলাইন-ফার্স্ট'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              {language === 'en'
                ? 'Assisted complaint intake by Union Digital Center entrepreneurs for citizens.'
                : 'নিরক্ষর বা প্রান্তিক জনগোষ্ঠীর পক্ষে ডিজিটাল সেন্টারের উদ্যোক্তা কর্তৃক সহজে অভিযোগ লিপিবদ্ধকরণ।'}
            </p>
          </div>
        </div>

        {/* Demo Fast Preset Switcher & Network Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 px-1.5">
              {language === 'en' ? 'Demo Fill:' : 'নমুনা পূরণ:'}
            </span>
            <button
              type="button"
              onClick={() => handleAutoFill('violence')}
              className="px-2.5 py-1.5 bg-white hover:bg-red-50 text-red-700 font-bold text-xs rounded-lg shadow-2xs border border-slate-200 transition active:scale-95 cursor-pointer"
              title={language === 'en' ? 'Urgent domestic violence demo' : 'জরুরি পারিবারিক সহিংসতা ডেমো'}
            >
              {language === 'en' ? 'Violence' : 'সহিংসতা'}
            </button>
            <button
              type="button"
              onClick={() => handleAutoFill('land')}
              className="px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-800 font-bold text-xs rounded-lg shadow-2xs border border-slate-200 transition active:scale-95 cursor-pointer"
              title={language === 'en' ? 'Land dispute demo' : 'জমিজমা বিরোধ ডেমো'}
            >
              {language === 'en' ? 'Land' : 'জমিজমা'}
            </button>
            <button
              type="button"
              onClick={() => handleAutoFill('maintenance')}
              className="px-2.5 py-1.5 bg-white hover:bg-blue-50 text-blue-800 font-bold text-xs rounded-lg shadow-2xs border border-slate-200 transition active:scale-95 cursor-pointer"
              title={language === 'en' ? 'Maintenance claim demo' : 'ভরণপোষণ দাবি ডেমো'}
            >
              {language === 'en' ? 'Maintenance' : 'খোরপোশ'}
            </button>
          </div>

          {/* Quick toggle offline for demonstration */}
          <button
            type="button"
            onClick={() => onToggleSimulatedNetwork(!simulatedOffline)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer ${
              !isOnline
                ? 'bg-amber-500 text-slate-950 border-amber-600 animate-pulse'
                : 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700'
            }`}
          >
            {!isOnline ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
            <span>
              {!isOnline 
                ? (language === 'en' ? 'Offline Mode' : 'অফলাইন মোড') 
                : (language === 'en' ? 'Online Mode' : 'অনলাইন মোড')}
            </span>
          </button>
        </div>
      </div>

      {/* Save Toast notification */}
      {saveToast && (
        <div
          role="status"
          className={`p-4 rounded-xl shadow-lg border flex items-center justify-between gap-3 text-sm font-bold animate-in fade-in slide-in-from-top-2 ${
            saveToast.isOffline
              ? 'bg-amber-100 border-amber-300 text-amber-950'
              : 'bg-emerald-600 border-emerald-700 text-white'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {saveToast.isOffline ? (
              <Save className="w-5 h-5 text-amber-800 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-100 shrink-0" />
            )}
            <span>{saveToast.message}</span>
          </div>
          {onNavigateToDashboard && (
            <button
              type="button"
              onClick={onNavigateToDashboard}
              className="text-xs bg-black/10 hover:bg-black/20 px-3 py-1 rounded-lg shrink-0 underline cursor-pointer"
            >
              {language === 'en' ? 'View Dashboard' : 'ড্যাশবোর্ডে দেখুন'}
            </button>
          )}
        </div>
      )}

      {/* Main Intake Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Voice Recording Simulation (Crucial for Illiterate Users) */}
        <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/50 rounded-3xl border border-blue-100 p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-blue-950">
                  {language === 'en' ? 'Voice Statement Recording' : 'ভয়েস জবানবন্দি গ্রহণ'}
                </h3>
                <p className="text-xs text-blue-700">
                  {language === 'en'
                    ? 'Recording audio enables AI transcription and automated summary.'
                    : 'কথা রেকর্ড করলে এআই স্বয়ংক্রিয়ভাবে টেক্সট ও সারাংশ প্রস্তুত করবে।'}
                </p>
              </div>
            </div>
            {audioRecorded && (
              <span className="text-xs font-mono font-bold bg-white text-blue-800 px-2 py-0.5 rounded-md border border-blue-200">
                {recordedDuration} {language === 'en' ? 'Recorded' : 'রেকর্ডকৃত'}
              </span>
            )}
          </div>

          <div className="bg-white rounded-xl p-3.5 border border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setIsRecording(!isRecording);
                  if (!isRecording) {
                    setAudioRecorded(true);
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-sm transition active:scale-95 cursor-pointer ${
                  isRecording
                    ? 'bg-red-600 text-white animate-pulse'
                    : audioRecorded
                    ? 'bg-emerald-600 text-white'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
                aria-label={isRecording ? (language === 'en' ? 'Stop recording' : 'রেকর্ডিং বন্ধ করুন') : (language === 'en' ? 'Start recording' : 'রেকর্ডিং শুরু করুন')}
              >
                {isRecording ? (
                  <>
                    <MicOff className="w-4 h-4" />
                    <span>{language === 'en' ? 'Recording... (Stop)' : 'রেকর্ডিং চলছে (থামান)'}</span>
                  </>
                ) : audioRecorded ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{language === 'en' ? 'Recording Complete (Redo)' : 'ভয়েস রেকর্ড সম্পন্ন (আবার করুন)'}</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>{language === 'en' ? 'Start Recording' : 'রেকর্ড শুরু করুন'}</span>
                  </>
                )}
              </button>

              <span className="text-xs text-slate-500 font-medium">
                {isRecording 
                  ? (language === 'en' ? 'Listening via microphone...' : 'উদ্যোক্তার মাইকে কথা শুনছে...') 
                  : (language === 'en' ? 'Microphone Ready' : 'মাইক্রোফোন প্রস্তুত')}
              </span>
            </div>

            {/* Simulated Live Audio Waveform */}
            <div className="flex items-center gap-1 h-7 w-full sm:w-48 justify-end">
              {[30, 50, 80, 40, 90, 60, 30, 70, 85, 40, 60, 95, 40, 70].map((h, i) => (
                <div
                  key={i}
                  style={{ height: `${isRecording ? (h + (i % 3) * 15) % 100 : 25}%` }}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-300'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Step 2: Provenance Separation (Caller vs Subject) */}
        <div className="bg-white rounded-3xl border border-slate-100/80 p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-700" />
              <h3 className="text-base font-extrabold text-slate-900">
                {language === 'en' ? 'Provenance Verification' : 'প্রোভেন্যান্স যাচাইকরণ'}
              </h3>
            </div>
            
            {/* Proxy Toggle */}
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setIsProxy(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  !isProxy ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600'
                }`}
              >
                {language === 'en' ? 'Victim Directly' : 'ভুক্তভোগী নিজে'}
              </button>
              <button
                type="button"
                onClick={() => setIsProxy(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  isProxy ? 'bg-emerald-700 text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                {language === 'en' ? 'Proxy / Representative' : 'প্রতিনিধি / প্রক্সি'}
              </button>
            </div>
          </div>

          {/* Caller Details Section */}
          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
                {language === 'en'
                  ? '1. Caller / Reporter Details — Biometric & SIM Verified'
                  : '১. যিনি কথা বলছেন (রিপোর্টার) — বায়োমেট্রিক ও সিম যাচাইকৃত'}
              </span>
              <span className="text-[11px] font-bold bg-emerald-700 text-white px-2 py-0.5 rounded shadow-2xs">
                {language === 'en' ? 'Verified' : 'যাচাইকৃত'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {language === 'en' ? 'Caller Name:' : 'কথা বলিয়ে ব্যক্তির নাম:'}
                </label>
                <input
                  type="text"
                  required
                  value={callerName}
                  onChange={(e) => setCallerName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-emerald-600"
                  placeholder={language === 'en' ? 'e.g. Salma Khatun' : 'যেমন: মোছাঃ সালমা খাতুন'}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {language === 'en' ? 'Mobile Number (SIM Verified):' : 'মোবাইল নম্বর (সিম যাচাইকৃত):'}
                </label>
                <input
                  type="tel"
                  required
                  value={callerPhone}
                  onChange={(e) => setCallerPhone(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-emerald-600"
                  placeholder={language === 'en' ? '017**-******' : '০১৭**-******'}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {language === 'en' ? 'Relationship to Subject:' : 'ভুক্তভোগীর সাথে সম্পর্ক:'}
                </label>
                <input
                  type="text"
                  value={callerRelation}
                  onChange={(e) => setCallerRelation(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-emerald-600"
                  placeholder={language === 'en' ? 'e.g. UP Member / Neighbor / Guardian' : 'যেমন: ইউপি মেম্বার / প্রতিবেশী / অভিভাবক'}
                />
              </div>
            </div>
          </div>

          {/* Subject Details Section */}
          <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                {language === 'en' ? '2. Subject / Victim in Need:' : '২. যার বিষয়ে অভিযোগ (ভুক্তভোগী)'}
              </span>
              <span className="text-[11px] font-bold bg-amber-500 text-slate-950 px-2 py-0.5 rounded shadow-2xs">
                {isProxy 
                  ? (language === 'en' ? 'Unconfirmed' : 'অনিশ্চিত') 
                  : (language === 'en' ? 'Verified' : 'যাচাইকৃত')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {language === 'en' ? 'Subject Full Name:' : 'ভুক্তভোগীর পুরো নাম:'}
                </label>
                <input
                  type="text"
                  required
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-emerald-600"
                  placeholder={language === 'en' ? 'e.g. Morium Begum' : 'যেমন: মোছাঃ মরিয়ম বেগম'}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {language === 'en' ? 'Approximate Age:' : 'আনুমানিক বয়স:'}
                </label>
                <input
                  type="number"
                  value={subjectAge}
                  onChange={(e) => setSubjectAge(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-emerald-600"
                  placeholder={language === 'en' ? '27' : '২৭'}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {language === 'en' ? 'Village & Address:' : 'গ্রাম ও ঠিকানা:'}
                </label>
                <input
                  type="text"
                  required
                  value={subjectAddress}
                  onChange={(e) => setSubjectAddress(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-emerald-600"
                  placeholder={language === 'en' ? 'Village, Ward, Union...' : 'গ্রাম, ওয়ার্ড, ইউনিয়ন...'}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Case Nature, Urgency & Safety Alert */}
        <div className="bg-white rounded-3xl border border-slate-100/80 p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-5">
          <h3 className="text-base font-extrabold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-700" />
            <span>{language === 'en' ? 'Case Category & Urgency Triage' : 'মামলার ধরন ও জরুরি মূল্যায়ন'}</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {language === 'en' ? 'Case / Dispute Type:' : 'মামলা / সমস্যার ধরন:'}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-emerald-600 cursor-pointer"
              >
                <option value="পারিবারিক সহিংসতা ও যৌতুক">
                  {language === 'en' ? 'Domestic Violence & Physical Abuse' : 'পারিবারিক সহিংসতা ও শারীরিক নির্যাতন'}
                </option>
                <option value="বাল্যবিয়ে প্রতিরোধ ও জোরপূর্বক আটক">
                  {language === 'en' ? 'Child Marriage Prevention & Detention' : 'বাল্যবিয়ে প্রতিরোধ ও জোরপূর্বক আটক'}
                </option>
                <option value="জমি জবরদখল ও এতিমের সম্পত্তি বেদখল">
                  {language === 'en' ? 'Land Encroachment & Property Grabbing' : 'জমি জবরদখল ও এতিমের সম্পত্তি বেদখল'}
                </option>
                <option value="দেনমোহর ও সন্তানের ভরণপোষণ">
                  {language === 'en' ? 'Dower & Child Maintenance' : 'দেনমোহর ও সন্তানের ভরণপোষণ দাবি'}
                </option>
                <option value="প্রবাসী শ্রমিকের ক্ষতিপূরণ ও প্রতারণা">
                  {language === 'en' ? 'Migrant Worker Compensation & Wages' : 'প্রবাসী শ্রমিকের ক্ষতিপূরণ ও মজুরি'}
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {language === 'en' ? 'Initial Priority Level:' : 'প্রাথমিক অগ্রাধিকার মাত্রা:'}
              </label>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setPriority('urgent')}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 active:scale-95 cursor-pointer ${
                    priority === 'urgent'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-red-50'
                  }`}
                >
                  <span>▲ {language === 'en' ? 'Urgent' : 'জরুরি'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPriority('medium')}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 active:scale-95 cursor-pointer ${
                    priority === 'medium'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-amber-50'
                  }`}
                >
                  <span>● {language === 'en' ? 'Medium' : 'মাঝারি'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPriority('routine')}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 active:scale-95 cursor-pointer ${
                    priority === 'routine'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-blue-50'
                  }`}
                >
                  <span>{language === 'en' ? 'Routine' : 'সাধারণ'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Child Danger and Safety Alert checkboxes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-purple-200 bg-purple-50/50 cursor-pointer hover:bg-purple-50 transition">
              <input
                type="checkbox"
                checked={hasChildInDanger}
                onChange={(e) => setHasChildInDanger(e.target.checked)}
                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
              />
              <span className="text-xs font-bold text-purple-950 flex items-center gap-1">
                <Baby className="w-4 h-4 text-purple-700" />
                {language === 'en' ? 'Child accompanying or in danger' : 'কোলে বা সাথে শিশু বিপন্ন অবস্থায় রয়েছে'}
              </span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-red-200 bg-red-50/50 cursor-pointer hover:bg-red-50 transition">
              <input
                type="checkbox"
                checked={safetyRisk}
                onChange={(e) => setSafetyRisk(e.target.checked)}
                className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
              />
              <span className="text-xs font-bold text-red-950 flex items-center gap-1">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                {language === 'en' ? 'Critical Safety Risk (Confidentiality vital)' : 'ভুক্তভোগীর চরম নিরাপত্তা ঝুঁকি'}
              </span>
            </label>
          </div>

          {/* Incident Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {language === 'en' ? 'Incident Description / Summary:' : 'ঘটনার সংক্ষিপ্ত বিবরণ:'}
            </label>
            <textarea
              rows={3}
              required
              value={incidentDescription}
              onChange={(e) => setIncidentDescription(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs sm:text-sm text-slate-800 focus:outline-hidden focus:border-emerald-600 leading-relaxed"
              placeholder={language === 'en' ? 'Write incident details...' : 'ভুক্তভোগীর অভিযোগের বিবরণ লিখুন...'}
            />
          </div>

          {/* Desired Relief */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {language === 'en' ? 'Desired Legal Relief:' : 'প্রত্যাশিত আইনগত প্রতিকার:'}
            </label>
            <input
              type="text"
              required
              value={desiredRelief}
              onChange={(e) => setDesiredRelief(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-hidden focus:border-emerald-600"
              placeholder={language === 'en' ? 'e.g. Panel lawyer / Mediation / Police protection' : 'যেমন: সরকারি আইনজীবী নিয়োগ / মধ্যস্থতা / পুলিশ নিরাপত্তা'}
            />
          </div>
        </div>

        {/* Submit Bar with Strict 'Submit' / 'জমা দিন' Button */}
        <div className="bg-slate-900 text-white rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl border border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`w-3.5 h-3.5 rounded-full shrink-0 ${!isOnline ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
            <div>
              <div className="text-xs sm:text-sm font-bold text-white">
                {!isOnline
                  ? (language === 'en' ? 'Offline Mode Active — Saved safely on device' : 'অফলাইন মোড সক্রিয় — ডিভাইসে নিরাপদ রাখা হবে')
                  : (language === 'en' ? 'Online Connected — Syncs to central database' : 'অনলাইন সংযুক্ত — কেন্দ্রীয় ডাটাবেজে সরাসরি সিঙ্ক হবে')}
              </div>
              <div className="text-xs text-slate-400">
                {!isOnline
                  ? (language === 'en' ? 'Click "Sync" when connected to push queued cases to dashboard.' : 'নেটওয়ার্ক আসার পর "সিঙ্ক করুন" বাটনে চাপলে অটোমেটিক কেন্দ্রীয় ড্যাশবোর্ডে যাবে।')
                  : (language === 'en' ? 'Instant SMS with tracking number will be sent to the applicant.' : 'আবেদনকারীকে তাৎক্ষণিক ট্র্যাকিং নম্বর সহ এসএমএস পাঠানো হবে।')}
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full sm:w-auto min-h-[50px] px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm sm:text-base shadow-lg transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Save className="w-5 h-5" />
            <span>{language === 'en' ? 'Submit' : 'জমা দিন'}</span>
          </button>
        </div>
      </form>

      {/* Queued Offline Cases List Display if any */}
      {offlineQueue.length > 0 && (
        <div className="bg-amber-50/80 rounded-2xl border border-amber-300 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-extrabold text-amber-950">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              <span>
                {language === 'en' 
                  ? `Locally Queued Applications (${offlineQueue.length})`
                  : `লোকাল ডিভাইসে সংরক্ষিত অপেক্ষমাণ আবেদন (${offlineQueue.length}টি)`}
              </span>
            </div>
            <span className="text-xs text-amber-800 font-semibold">
              {language === 'en' ? 'Safe on Device' : 'ডিভাইসে অক্ষত'}
            </span>
          </div>

          <div className="space-y-2">
            {offlineQueue.map((item, idx) => (
              <div
                key={idx}
                className="bg-white p-3 rounded-xl border border-amber-200 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900">{cleanPersonName(item.provenance.subjectName, language)}</span>
                  <span className="text-slate-500 ml-2">({translateCategory(item.category, language)})</span>
                  <div className="text-[11px] text-amber-800 mt-0.5">
                    {language === 'en' ? 'Tracking' : 'ট্র্যাকিং'}: {item.trackingNumber} · {language === 'en' ? 'Caller' : 'কথা বলেছেন'}: {cleanPersonName(item.provenance.callerName, language)}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-md bg-amber-100 text-amber-900 font-bold border border-amber-300 shrink-0">
                  {language === 'en' ? 'Pending Sync' : 'অপেক্ষমাণ'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
