import React, { useState, useEffect, useMemo, useRef } from 'react';
import { EduvaIcon } from './Layout';

interface LoadingOverlayProps {
  status: string;
  progress: number;
  onInBackground: () => void;
  debugLogs?: string[];
  isMission?: boolean;
}

const FACTS = [
  "Document Indexing: Building permanent Knowledge Atoms for this file.",
  "Neural Bridge: Once indexed, future tasks for this file will be instant.",
  "Multi-Threading: We are analyzing 4 document segments simultaneously.",
  "Gap Analysis: AI is matching lesson content against your child's mistakes.",
  "Precision Mode: Parent Missions use 2x higher reasoning depth than standard tasks.",
  "Cloud Sync: Your learning bank is being backed up to the global grid."
];

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ status, progress, onInBackground, debugLogs = [], isMission = false }) => {
  const [fact, setFact] = useState(FACTS[0]);
  const [copyStatus, setCopyStatus] = useState<'IDLE' | 'COPIED'>('IDLE');
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
        logEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [debugLogs]);

  useEffect(() => {
    const factInterval = setInterval(() => {
        setFact(prev => {
            const idx = FACTS.indexOf(prev);
            return FACTS[(idx + 1) % FACTS.length];
        });
    }, 5000);
    return () => clearInterval(factInterval);
  }, []);

  const steps = useMemo(() => [
    { id: 'binary', label: 'Binary Identity Hash', keywords: ['fingerprint', 'identity', 'sha-256', 'binary', 'step 1'] },
    { id: 'cache', label: 'Intelligent Cache Scan', keywords: ['cache', 'existing', 'found', 'vault', 'step 2'] },
    { id: 'global', label: 'Global Grid Sync', keywords: ['global', 'grid', 'materializing', 'step 3'] },
    { id: 'neural', label: 'Neural Synthesis', keywords: ['synthesis', 'ai', 'extracting', 'brain', 'logic', 'thinking', 'hydrating', 'step 4'] },
    { id: 'assembly', label: 'Assembly & Seal', keywords: ['sealing', 'assembling', 'finalizing', 'hud', 'complete', 'step 5'] }
  ], []);

  const currentStepIndex = useMemo(() => {
    const lowerStatus = status.toLowerCase();
    let idx = -1;
    for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].keywords.some(k => lowerStatus.includes(k))) {
            idx = i;
            break;
        }
    }
    // If we're past 90%, mark as assembly
    if (progress > 90) return 4;
    return idx === -1 ? 0 : idx;
  }, [status, steps, progress]);

  const handleCopyLogs = () => {
    const logText = debugLogs.join('\n');
    navigator.clipboard.writeText(logText).then(() => {
        setCopyStatus('COPIED');
        setTimeout(() => setCopyStatus('IDLE'), 2000);
    });
  };

  const accentColor = isMission ? 'from-rose-600 via-rose-400 to-indigo-600' : 'from-brand-600 via-brand-400 to-indigo-500';
  const overlayGlow = isMission ? 'bg-rose-500/20' : 'bg-brand-500/20';

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-950 px-4 overflow-hidden">
      
      {/* Dynamic Grid Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
          <div className={`absolute top-[-10%] left-[-10%] w-[50%] h-[50%] ${overlayGlow} blur-[120px] animate-pulse`}></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-purple-500/10 blur-[150px] animate-pulse" style={{ animationDelay: '3s' }}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:32px_32px]"></div>
      </div>

      <div className="max-w-3xl w-full relative z-10 flex flex-col gap-8">
        
        {/* Top Branding Section */}
        <div className="flex flex-col items-center">
          <div className="relative mb-8">
             <div className="w-24 h-24 bg-slate-900 rounded-[2rem] flex items-center justify-center shadow-[0_0_80px_rgba(239,68,68,0.3)] border border-white/10 relative z-10 animate-float">
                {isMission ? <span className="text-5xl">⚡</span> : <EduvaIcon className="w-14 h-14 text-brand-500" />}
             </div>
             <div className={`absolute inset-[-20px] border ${isMission ? 'border-rose-500/30' : 'border-brand-500/30'} rounded-full animate-[spin_15s_linear_infinite]`}></div>
             <div className={`absolute inset-[-20px] border-t-2 ${isMission ? 'border-rose-400' : 'border-brand-400'} rounded-full animate-[spin_3s_linear_infinite]`}></div>
          </div>
          <h2 className={`text-3xl md:text-4xl font-black text-white tracking-tighter mb-2 drop-shadow-2xl text-center`}>
             {isMission ? 'ACTIVE MISSION DISPATCH' : 'NEURAL CORE PROCESSING'}
          </h2>
          <div className="flex items-center gap-3">
             <span className="h-px w-8 bg-white/20"></span>
             <p className="text-[10px] font-black uppercase text-rose-500 tracking-[0.5em] animate-pulse whitespace-nowrap">Interactive Simulation Lab</p>
             <span className="h-px w-8 bg-white/20"></span>
          </div>
        </div>

        {/* Intelligence Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* Step Matrix (Checklist) */}
            <div className="lg:col-span-5 bg-slate-900/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 p-8 shadow-2xl relative overflow-hidden flex flex-col justify-center">
                <div className="space-y-6 relative z-10">
                    {steps.map((step, idx) => {
                    const isCompleted = idx < currentStepIndex;
                    const isActive = idx === currentStepIndex;
                    const isPending = idx > currentStepIndex;

                    return (
                        <div key={step.id} className={`flex items-center gap-4 transition-all duration-700 ${isPending ? 'opacity-20 scale-95' : 'opacity-100 scale-100'}`}>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 transition-all duration-500 ${
                            isCompleted ? 'bg-green-500 border-green-400 text-white shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 
                            isActive ? (isMission ? 'bg-rose-500/20 border-rose-500 animate-pulse' : 'bg-brand-500/20 border-brand-500 animate-pulse') : 
                            'border-slate-800'
                            }`}>
                            {isCompleted ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
                            ) : (
                                <span className="text-[10px] font-black text-slate-500">{idx + 1}</span>
                            )}
                            </div>
                            <div className="flex-grow min-w-0">
                                <p className={`text-[11px] font-black tracking-widest uppercase ${isActive ? 'text-white' : isCompleted ? 'text-slate-400' : 'text-slate-600'}`}>
                                {step.label}
                                </p>
                            </div>
                            {isActive && <div className="flex gap-1"><span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></span></div>}
                        </div>
                    );
                    })}
                </div>
            </div>

            {/* Diagnostic Logs (CRT Display) */}
            <div className={`lg:col-span-7 bg-black/60 backdrop-blur-xl rounded-[2.5rem] border ${isMission ? 'border-rose-500/20' : 'border-brand-500/20'} shadow-2xl p-6 font-mono relative overflow-hidden h-72 lg:h-auto flex flex-col`}>
                <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 ${isMission ? 'bg-rose-500' : 'bg-green-500'} rounded-full animate-pulse shadow-[0_0_10px_${isMission ? '#ef4444' : '#22c55e'}]`}></div>
                        <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isMission ? 'text-rose-500/80' : 'text-green-500/80'}`}>Protocol_Audit</span>
                    </div>
                    <button 
                        onClick={handleCopyLogs}
                        className="text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
                    >
                        [ {copyStatus === 'COPIED' ? 'Logs_Copied' : 'Copy_Trace'} ]
                    </button>
                </div>
                
                <div ref={logContainerRef} className="flex-grow overflow-y-auto custom-scrollbar space-y-2 pr-2">
                    {debugLogs.length === 0 ? (
                        <p className="text-[10px] text-slate-700 italic tracking-tighter">Establishing secure AI handshake...</p>
                    ) : (
                        debugLogs.map((log, i) => (
                            <div key={i} className="text-[10px] leading-tight flex gap-3 group">
                                <span className="text-slate-700 flex-shrink-0 font-bold">{new Date().toLocaleTimeString([], {hour12: false})}</span>
                                <span className={`${isMission ? 'text-rose-400/70 group-last:text-rose-400' : 'text-indigo-400/70 group-last:text-indigo-400'} group-last:font-black break-words tracking-tight`}>{log}</span>
                            </div>
                        ))
                    )}
                    <div ref={logEndRef} className="h-0 w-0" />
                </div>
                
                {/* CRT Screen Effect overlay */}
                <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.05)_50%),linear-gradient(90deg,rgba(255,0,0,0.01),rgba(0,255,0,0.01),rgba(0,0,255,0.01))] bg-[length:100%_2px,3px_100%] opacity-50"></div>
            </div>
        </div>
        
        {/* Progress & Actions */}
        <div className="space-y-8">
            <div className="px-4">
                <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-white/10 relative shadow-inner">
                    <div className={`h-full bg-gradient-to-r ${accentColor} rounded-full shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all duration-1000 ease-out relative overflow-hidden`} style={{ width: `${progress}%` }}>
                        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)] w-40 animate-[shimmer_2s_infinite]"></div>
                    </div>
                </div>
                <div className="flex justify-between mt-4 px-1">
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Current State</span>
                        <span className="text-[10px] font-bold text-white truncate max-w-[200px] md:max-w-md">{status}</span>
                    </div>
                    <div className="text-right flex flex-col">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Buffer Integrity</span>
                        <span className={`text-[10px] font-black ${isMission ? 'text-rose-500' : 'text-brand-500'} tracking-widest`}>{Math.round(progress)}% VERIFIED</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-center gap-6">
                <button 
                    onClick={onInBackground} 
                    className="group relative px-12 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.4em] transition-all hover:scale-105 active:scale-95 overflow-hidden"
                >
                    <span className="relative z-10">Neural background execution</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                </button>
                
                <div className="max-w-md text-center bg-indigo-500/5 px-6 py-4 rounded-3xl border border-indigo-500/10">
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed italic animate-fade-in" key={fact}>
                        &ldquo; {fact} &rdquo;
                    </p>
                </div>
            </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { transform: translateX(-150%); }
          100% { transform: translateX(250%); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(1deg); }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}} />
    </div>
  );
};

export default LoadingOverlay;
