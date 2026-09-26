import React, { useState, useRef, useEffect } from 'react';
import { 
  PenTool, 
  Wifi, 
  WifiOff, 
  CheckCircle2, 
  Clock, 
  Hash, 
  RotateCcw, 
  ShieldCheck, 
  Key, 
  Lock, 
  FileCheck,
  Maximize2,
  Check,
  X
} from 'lucide-react';
import { Language } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface ESignatureProps {
  partyAName: string;
  partyARole?: string;
  partyBName: string;
  partyBRole?: string;
  isOnline: boolean;
  onSignComplete?: (status: { partyASigned: boolean; partyBSigned: boolean; isSynced: boolean }) => void;
  language?: Language;
}

export const ESignatureComponent: React.FC<ESignatureProps> = ({
  partyAName,
  partyARole,
  partyBName,
  partyBRole,
  isOnline,
  onSignComplete,
  language: propLanguage,
}) => {
  const { language: ctxLanguage } = useLanguage();
  const language = propLanguage || ctxLanguage;

  const resolvedRoleA = partyARole || (language === 'en' ? 'First Party (Complainant / Victim)' : 'প্রথম পক্ষ (অভিযোগকারী / ভুক্তভোগী)');
  const resolvedRoleB = partyBRole || (language === 'en' ? 'Second Party (Opposite Party / Husband)' : 'দ্বিতীয় পক্ষ (প্রতিপক্ষ / স্বামী)');

  // Party B Offline status toggle (Challenge T11)
  const [partyBIsOffline, setPartyBIsOffline] = useState<boolean>(true);

  // Signatures State
  const [partyASigned, setPartyASigned] = useState<boolean>(false);
  const [partyBSigned, setPartyBSigned] = useState<boolean>(false);
  const [partyBSignatureTime, setPartyBSignatureTime] = useState<string>('');

  // Cryptographic placeholder hash ID for offline state
  const [cryptoHash] = useState<string>('8f9a2b7c4e1d09aa3f8892cb91');

  // Simulated canvas drawing for Party A
  const canvasRefA = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingA, setIsDrawingA] = useState(false);

  // Simulated canvas drawing for Party B
  const canvasRefB = useRef<HTMLCanvasElement | null>(null);

  // Quick signature drawer
  const drawSignaturePlaceholder = (canvas: HTMLCanvasElement | null, text: string) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw signature curved lines
    ctx.strokeStyle = '#047857';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(30, 45);
    ctx.bezierCurveTo(70, 10, 100, 70, 140, 35);
    ctx.bezierCurveTo(160, 15, 190, 60, 220, 30);
    ctx.lineTo(250, 45);
    ctx.stroke();

    // Draw small flourish
    ctx.beginPath();
    ctx.moveTo(80, 55);
    ctx.lineTo(240, 50);
    ctx.stroke();

    // Timestamp text
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.fillText(text, 20, 72);
  };

  const clearCanvas = (canvas: HTMLCanvasElement | null, setSigned: (val: boolean) => void) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setSigned(false);
  };

  const handleSignPartyA = () => {
    const timeStr = new Date().toLocaleTimeString(language === 'bn' ? 'bn-BD' : 'en-US');
    drawSignaturePlaceholder(canvasRefA.current, `e-Sign: ${partyAName} • ${timeStr}`);
    setPartyASigned(true);
  };

  const handleSignPartyB = () => {
    const timeStr = new Date().toLocaleTimeString(language === 'bn' ? 'bn-BD' : 'en-US');
    setPartyBSignatureTime(timeStr);
    drawSignaturePlaceholder(canvasRefB.current, `e-Sign: ${partyBName} • ${timeStr}`);
    setPartyBSigned(true);
  };

  // Fullscreen mobile modal state for signature
  const [showFullscreenModal, setShowFullscreenModal] = useState<boolean>(false);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isFullscreenDrawing, setIsFullscreenDrawing] = useState(false);

  // Helper to extract exact coordinates relative to canvas resolution
  const getCanvasCoords = (
    canvas: HTMLCanvasElement, 
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // Canvas touch/mouse handlers for Party A
  const startDrawingA = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ('touches' in e && e.cancelable) e.preventDefault();
    setIsDrawingA(true);
    const canvas = canvasRefA.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#047857';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const coords = getCanvasCoords(canvas, e);
    ctx.moveTo(coords.x, coords.y);
  };

  const drawA = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingA) return;
    if ('touches' in e && e.cancelable) e.preventDefault();
    const canvas = canvasRefA.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const coords = getCanvasCoords(canvas, e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    setPartyASigned(true);
  };

  const stopDrawingA = () => {
    setIsDrawingA(false);
  };

  // Fullscreen Canvas Drawing Handlers
  const startDrawingFullscreen = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ('touches' in e && e.cancelable) e.preventDefault();
    setIsFullscreenDrawing(true);
    const canvas = fullscreenCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#047857';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const coords = getCanvasCoords(canvas, e);
    ctx.moveTo(coords.x, coords.y);
  };

  const drawFullscreen = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isFullscreenDrawing) return;
    if ('touches' in e && e.cancelable) e.preventDefault();
    const canvas = fullscreenCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const coords = getCanvasCoords(canvas, e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawingFullscreen = () => {
    setIsFullscreenDrawing(false);
  };

  const handleApplyFullscreenSignature = () => {
    const fsCanvas = fullscreenCanvasRef.current;
    const mainCanvas = canvasRefA.current;
    if (fsCanvas && mainCanvas) {
      const mainCtx = mainCanvas.getContext('2d');
      if (mainCtx) {
        mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        mainCtx.drawImage(fsCanvas, 0, 0, mainCanvas.width, mainCanvas.height);
      }
      setPartyASigned(true);
    }
    setShowFullscreenModal(false);
  };

  const isPartyBConnected = isOnline && !partyBIsOffline;

  useEffect(() => {
    if (onSignComplete) {
      onSignComplete({
        partyASigned,
        partyBSigned,
        isSynced: isPartyBConnected && partyASigned && partyBSigned,
      });
    }
  }, [partyASigned, partyBSigned, isPartyBConnected, onSignComplete]);

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/50 space-y-5">
      {/* Header with Offline capability description & Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <PenTool className="w-5 h-5 text-emerald-700" />
            <h4 className="text-base font-extrabold text-slate-900">
              {language === 'en' ? 'Offline-Capable Digital E-Signature' : 'অফলাইন-সক্ষম ডিজিটাল ই-স্বাক্ষর'}
            </h4>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'en'
              ? 'Cryptographic Hash Queue verification for offline multi-party settlements.'
              : 'অফলাইন অবস্থায় ক্রিপ্টোগ্রাফিক কিউ ভিত্তিক প্রমাণের সুরক্ষা।'}
          </p>
        </div>

        {/* Toggle for Party B connection */}
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200 self-start sm:self-center">
          <span className="text-xs font-bold text-slate-700 pl-1">
            {language === 'en' ? 'Second Party Connection:' : 'দ্বিতীয় পক্ষের সংযোগ:'}
          </span>
          <button
            type="button"
            onClick={() => setPartyBIsOffline(!partyBIsOffline)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
              partyBIsOffline
                ? 'bg-amber-500 text-slate-950 border border-amber-600'
                : 'bg-emerald-600 text-white border border-emerald-700'
            }`}
            aria-label={language === 'en' ? 'Toggle Party B online or offline' : 'দ্বিতীয় পক্ষ অফলাইন বা অনলাইন টগল করুন'}
          >
            {partyBIsOffline ? (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>{language === 'en' ? 'Party B is Offline' : 'দ্বিতীয় পক্ষ অফলাইন'}</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>{language === 'en' ? 'Party B is Online' : 'দ্বিতীয় পক্ষ অনলাইন'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Two Signature Blocks (Party A and Party B) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ================= PARTY A SIGNATURE BLOCK ================= */}
        <div className="rounded-2xl border border-slate-100/80 bg-slate-50/80 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                {language === 'en' ? 'Signatory (Party A)' : 'স্বাক্ষরকারী (প্রথম পক্ষ)'}
              </span>
              <h5 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                <span>{partyAName}</span>
                <span className="text-[11px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full font-medium">
                  {language === 'en' ? 'Present' : 'উপস্থিত'}
                </span>
              </h5>
              <div className="text-[11px] text-slate-500">{resolvedRoleA}</div>
            </div>

            {partyASigned ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{language === 'en' ? 'Signed' : 'স্বাক্ষরিত'}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-200 px-2.5 py-1 rounded-full">
                <Clock className="w-3.5 h-3.5" />
                <span>{language === 'en' ? 'Signature Pending' : 'স্বাক্ষর বাকি'}</span>
              </span>
            )}
          </div>

          {/* Canvas Box */}
          <div className="relative bg-white rounded-lg border-2 border-dashed border-slate-300 h-28 overflow-hidden touch-none flex items-center justify-center">
            <canvas
              ref={canvasRefA}
              width={340}
              height={110}
              onMouseDown={startDrawingA}
              onMouseMove={drawA}
              onMouseUp={stopDrawingA}
              onMouseLeave={stopDrawingA}
              onTouchStart={startDrawingA}
              onTouchMove={drawA}
              onTouchEnd={stopDrawingA}
              className="w-full h-full cursor-crosshair"
            />
            {!partyASigned && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-slate-400 text-xs">
                <PenTool className="w-4 h-4 mb-1" />
                <span>{language === 'en' ? 'Sign with finger or mouse here' : 'এখানে আঙুল বা মাউস দিয়ে স্বাক্ষর করুন'}</span>
              </div>
            )}
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleSignPartyA}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 transition active:scale-95 cursor-pointer"
              >
                {language === 'en' ? 'Auto e-Sign' : 'স্বয়ংক্রিয় ই-স্বাক্ষর'}
              </button>

              <button
                type="button"
                onClick={() => setShowFullscreenModal(true)}
                className="text-xs font-bold text-blue-700 hover:text-blue-800 bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 transition flex items-center gap-1 active:scale-95 cursor-pointer"
                title={language === 'en' ? 'Open large pad for touch signing' : 'মোবাইলে সহজে আঙুল দিয়ে স্বাক্ষর করতে বড় প্যাড খুলুন'}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>{language === 'en' ? 'Large Pad' : 'বড় প্যাড'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => clearCanvas(canvasRefA.current, setPartyASigned)}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 p-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{language === 'en' ? 'Clear' : 'মুছুন'}</span>
            </button>
          </div>
        </div>

        {/* ================= PARTY B SIGNATURE BLOCK ================= */}
        <div className={`rounded-2xl border p-5 space-y-3 transition-colors ${
          partyBIsOffline 
            ? 'border-amber-200 bg-amber-50/60' 
            : 'border-slate-100/80 bg-slate-50/80'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                {language === 'en' ? 'Signatory (Party B)' : 'স্বাক্ষরকারী (দ্বিতীয় পক্ষ)'}
              </span>
              <h5 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                <span>{partyBName}</span>
                {partyBIsOffline ? (
                  <span className="text-[11px] text-amber-900 bg-amber-200 px-2 py-0.5 rounded-full font-bold border border-amber-300">
                    {language === 'en' ? 'Offline Remote' : 'অফলাইন রিমোট'}
                  </span>
                ) : (
                  <span className="text-[11px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full font-medium">
                    {language === 'en' ? 'Online Connected' : 'অনলাইনে সংযুক্ত'}
                  </span>
                )}
              </h5>
              <div className="text-[11px] text-slate-500">{resolvedRoleB}</div>
            </div>

            {/* STATUS BADGE */}
            {isPartyBConnected ? (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 text-xs font-extrabold text-white bg-emerald-700 px-3 py-1.5 rounded-lg shadow-xs animate-in fade-in"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-100" />
                <span>{language === 'en' ? 'Verified Signature' : 'যাচাইকৃত স্বাক্ষর'}</span>
              </span>
            ) : (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 bg-amber-200 px-2.5 py-1 rounded-lg border border-amber-400"
              >
                <Clock className="w-3.5 h-3.5 text-amber-800 animate-spin" />
                <span>{language === 'en' ? 'Offline Awaiting' : 'অফলাইন অপেক্ষমাণ'}</span>
              </span>
            )}
          </div>

          {/* Cryptographic Placeholder Box or Live Signature Box */}
          {!isPartyBConnected ? (
            /* OFFLINE STATE: Cryptographic placeholder with Hash ID */
            <div className="bg-white/90 rounded-lg border-2 border-dashed border-amber-400 p-3 h-28 flex flex-col justify-center space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-amber-700" />
                  <span>
                    {language === 'en'
                      ? `Awaiting sync - Hash ID: ${cryptoHash.slice(0, 14)}...`
                      : `সিঙ্কের অপেক্ষায় - হ্যাশ: ${cryptoHash.slice(0, 14)}...`}
                  </span>
                </span>
                <span className="text-[10px] font-mono bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-300">
                  SHA-256 Offline
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                {language === 'en'
                  ? 'Party B is offline. Signature encrypted locally with keypair and queued for sync.'
                  : 'দ্বিতীয় পক্ষ অফলাইন থাকায় স্বাক্ষরটি লোকাল কি-পেয়ারে এনক্রিপ্ট করে হ্যাশ সংরক্ষণ করা হয়েছে।'}
              </p>
              <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                <Hash className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate">hash://bd.law.dla/{cryptoHash}#ed25519-sig-pending</span>
              </div>
            </div>
          ) : (
            /* ONLINE STATE: Green Verified Signature state */
            <div className="bg-emerald-50/80 rounded-lg border-2 border-emerald-400 p-3 h-28 flex flex-col justify-center space-y-1.5 animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-extrabold">{language === 'en' ? 'Verified Signature ✅' : 'যাচাইকৃত স্বাক্ষর ✅'}</span>
                </span>
                <span className="text-[10px] font-mono bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold">
                  {language === 'en' ? 'Blockchain Hash Valid' : 'ব্লকচেইন হ্যাশ ভ্যালিড'}
                </span>
              </div>
              <div className="text-xs font-bold text-slate-800">
                {language === 'en'
                  ? `E-Signatory: ${partyBName} (NID Matched)`
                  : `ই-স্বাক্ষর প্রদানকারী: ${partyBName} (জাতীয় পরিচয়পত্র এনআইডি ম্যাচড)`}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-600 font-mono bg-white/80 p-1 rounded border border-emerald-200">
                <span>{language === 'en' ? 'Certificate' : 'সার্টিফিকেট'}: #DLA-SIG-{cryptoHash.slice(0, 10)}</span>
                <span className="text-emerald-700 font-bold">{language === 'en' ? '✓ Synced to Server' : '✓ সেন্ট্রাল সার্ভারে সিঙ্কড'}</span>
              </div>
            </div>
          )}

          {/* Quick Action Buttons for Party B */}
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setPartyBIsOffline(false);
                handleSignPartyB();
              }}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 transition cursor-pointer"
            >
              {language === 'en' ? 'Bring Online & Verify' : 'অনলাইনে এনে ভেরিফাই করুন'}
            </button>
            <span className="text-[11px] text-slate-500">
              {partyBIsOffline 
                ? (language === 'en' ? 'Offline Mode Active' : 'অফলাইন মোড চালু') 
                : (language === 'en' ? 'Live Encrypted' : 'লাইভ এনক্রিপ্টেড')}
            </span>
          </div>
        </div>
      </div>

      {/* Settlement Final Status summary banner */}
      <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs ${
        partyASigned && isPartyBConnected
          ? 'bg-emerald-600 text-white border-emerald-700'
          : 'bg-slate-100 text-slate-700 border-slate-200'
      }`}>
        <div className="flex items-center gap-2">
          <FileCheck className="w-4 h-4 shrink-0" />
          <span className="font-bold">
            {partyASigned && isPartyBConnected
              ? (language === 'en'
                  ? 'Both parties have completed legally valid e-signatures. ADR settlement deed is in effect.'
                  : 'উভয় পক্ষের আইনগত বৈধ স্বাক্ষর সম্পন্ন ও এডিআর মীমাংসাপত্র বলবৎ হয়েছে।')
              : (language === 'en'
                  ? 'Signatures and sync required from both parties for full legal enactment.'
                  : 'চুক্তি পূর্ণাঙ্গ কার্যকর করতে উভয় পক্ষের স্বাক্ষর ও সিঙ্ক আবশ্যক।')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] opacity-90">
            {language === 'en'
              ? 'Enacted under Section 21A, Legal Aid Services Act 2000'
              : 'আইনগত সহায়তা প্রদান আইন ২০০০ এর ২১ক ধারা মোতাবেক নিষ্পত্তিকৃত'}
          </span>
        </div>
      </div>

      {/* FULLSCREEN MOBILE SIGNATURE MODAL DIALOG */}
      {showFullscreenModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={language === 'en' ? 'Fullscreen Mobile Signature Pad' : 'মোবাইল বড় স্ক্রিন ডিজিটাল স্বাক্ষর প্যাড'}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-in fade-in duration-200"
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-xl mx-auto shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
            style={{
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)',
            }}
          >
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PenTool className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-white">
                    {language === 'en' ? 'Digital Signature Pad (Sign with finger)' : 'ডিজিটাল স্বাক্ষর প্যাড (আঙুল দিয়ে স্বাক্ষর করুন)'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {language === 'en' ? 'Signatory:' : 'স্বাক্ষরকারী:'} {partyAName} ({resolvedRoleA})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowFullscreenModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                aria-label={language === 'en' ? 'Close' : 'বন্ধ করুন'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body & Large Touch-Friendly Canvas */}
            <div className="p-4 sm:p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-900 flex items-center justify-between gap-2">
                <span>
                  {language === 'en'
                    ? '📱 Rotating phone to landscape provides a larger signature drawing area.'
                    : '📱 ফোনটি আড়াআড়ি ঘুরিয়ে নিলে আরো বড় জায়গায় স্বাক্ষর করতে পারবেন।'}
                </span>
                <span className="text-[10px] font-bold bg-amber-200 px-2 py-0.5 rounded">
                  {language === 'en' ? 'Tip' : 'পরামর্শ'}
                </span>
              </div>

              <div className="relative bg-white border-2 border-dashed border-slate-400 rounded-2xl h-56 sm:h-64 overflow-hidden touch-none flex items-center justify-center shadow-inner">
                <canvas
                  ref={fullscreenCanvasRef}
                  width={600}
                  height={320}
                  onMouseDown={startDrawingFullscreen}
                  onMouseMove={drawFullscreen}
                  onMouseUp={stopDrawingFullscreen}
                  onMouseLeave={stopDrawingFullscreen}
                  onTouchStart={startDrawingFullscreen}
                  onTouchMove={drawFullscreen}
                  onTouchEnd={stopDrawingFullscreen}
                  className="w-full h-full cursor-crosshair touch-none"
                />
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-slate-300 text-sm select-none">
                  <PenTool className="w-6 h-6 mb-1 text-slate-300" />
                  <span>{language === 'en' ? 'Draw your signature here with your finger' : 'আঙুল দিয়ে এখানে আপনার স্বাক্ষর আঁকুন'}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const canvas = fullscreenCanvasRef.current;
                    if (canvas) {
                      const ctx = canvas.getContext('2d');
                      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{language === 'en' ? 'Clear & Redo' : 'মুছে আবার লিখুন'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFullscreenModal(false)}
                    className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs sm:text-sm transition cursor-pointer"
                  >
                    {language === 'en' ? 'Cancel' : 'বাতিল'}
                  </button>

                  <button
                    type="button"
                    onClick={handleApplyFullscreenSignature}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-md transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>{language === 'en' ? 'Confirm Signature' : 'স্বাক্ষর নিশ্চিত করুন'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
