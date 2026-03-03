
import React, { useState, useEffect } from 'react';
import { ParentFeedEvent, AIExplanation, SystemActionItem } from '../types';
import { getAIExplanation } from '../services/parentService';
import Card from './ui/Card';
import Button from './ui/Button';

interface ExplainabilityModalProps {
  event: ParentFeedEvent;
  onClose: () => void;
}

const ExplainabilityModal: React.FC<ExplainabilityModalProps> = ({ event, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [explanation, setExplanation] = useState<AIExplanation | null>(null);
  const [localSystemActions, setLocalSystemActions] = useState<SystemActionItem[]>([]);

  useEffect(() => {
    const fetch = async () => {
        try {
            const res = await getAIExplanation(event);
            setExplanation(res);
            if (res.systemActions) {
                setLocalSystemActions(res.systemActions);
            } else {
                // Fallback if AI didn't return list
                setLocalSystemActions([
                    { label: res.actionTakenByAI || 'Optimized learning path', status: 'DONE' },
                    { label: 'Scheduled progress check', status: 'PENDING' }
                ]);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };
    fetch();
  }, [event]);

  const handleUndoPause = () => {
      setLocalSystemActions(prev => prev.map(a => {
          if (a.label.toLowerCase().includes('pause') || a.label.toLowerCase().includes('slow')) {
              return { ...a, label: 'Resume normal pace', status: 'DONE' };
          }
          return a;
      }));
  };

  const handleAddPractice = () => {
      setLocalSystemActions(prev => {
          const hasQuiz = prev.some(a => a.label.toLowerCase().includes('quiz') || a.label.toLowerCase().includes('practice'));
          if (hasQuiz) {
              return prev.map(a => (a.label.toLowerCase().includes('quiz') || a.label.toLowerCase().includes('practice')) ? { ...a, status: 'DONE' } : a);
          } else {
              return [...prev, { label: 'Added reinforcement quiz', status: 'DONE' }];
          }
      });
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-start md:items-center justify-center bg-slate-950/85 backdrop-blur-lg p-4 animate-fade-in overflow-y-auto py-10 md:py-20">
      <Card className="w-full max-w-xl bg-white dark:bg-slate-900 border-t-8 border-indigo-600 p-6 md:p-10 relative shadow-2xl my-auto">
        {/* Top Right Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-red-500 transition-colors z-[260] shadow-sm hover:scale-110 active:scale-95"
          aria-label="Close modal"
        >
          <span className="text-xl font-bold">✕</span>
        </button>

        <div className="absolute top-0 right-0 p-8 opacity-5 text-9xl pointer-events-none select-none">🧠</div>
        
        <div className="relative z-10">
            <h3 className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.4em] mb-6 flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
               AI Behavioral Insight
            </h3>
            
            {loading ? (
                <div className="py-20 flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Decoding Telemetry...</p>
                </div>
            ) : explanation ? (
                <div className="space-y-8 animate-slide-up">
                    <div className="space-y-4">
                        <p className="text-xl md:text-3xl font-black text-slate-800 dark:text-white leading-tight pr-10">"{explanation.insight}"</p>
                        
                        {/* Missing Foundations Block (Step 2) */}
                        <div className="bg-amber-50 dark:bg-amber-900/10 p-5 rounded-2xl border border-amber-100 dark:border-amber-800/50">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-widest flex items-center gap-2">
                                    <span className="text-lg">🧱</span> Missing Foundations
                                </h4>
                                <div className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-900 rounded-full border border-slate-100 dark:border-slate-800 shadow-sm">
                                    <span className="text-sm">⏱</span>
                                    <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                                        Est. {explanation.catchUpTime || 'Analysis...'}
                                    </span>
                                </div>
                            </div>
                            <ul className="space-y-2">
                                {(explanation.missingFoundations || [explanation.rootCause]).map((item, i) => (
                                    <li key={i} className="flex items-center gap-3 text-xs font-bold text-slate-700 dark:text-slate-300">
                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Control Panel (Step 3) */}
                        <div className="bg-slate-50 dark:bg-slate-950 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-inner flex flex-col justify-between">
                           <div>
                               <h4 className="text-[9px] font-black uppercase text-indigo-600 mb-4 tracking-widest flex items-center gap-2">
                                  <span>🎛️</span> System Action (Active)
                               </h4>
                               <div className="space-y-3 mb-6">
                                   {localSystemActions.map((action, i) => (
                                       <div key={i} className="flex items-start gap-3">
                                           <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold border ${action.status === 'DONE' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-transparent'}`}>
                                               {action.status === 'DONE' && '✓'}
                                           </div>
                                           <p className={`text-xs font-bold leading-tight ${action.status === 'DONE' ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}`}>
                                               {action.label}
                                           </p>
                                       </div>
                                   ))}
                               </div>
                           </div>
                           
                           <div className="flex gap-2">
                               <button 
                                   onClick={handleUndoPause}
                                   className="flex-1 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[9px] font-black uppercase text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm active:scale-95"
                               >
                                   Undo Pause
                               </button>
                               <button 
                                   onClick={handleAddPractice}
                                   className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-indigo-700 transition-all shadow-md active:scale-95"
                               >
                                   + Practice
                               </button>
                           </div>
                        </div>

                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-3xl border border-indigo-100 dark:border-indigo-800 shadow-sm flex flex-col">
                           <h4 className="text-[9px] font-black uppercase text-indigo-600 mb-3 tracking-widest flex items-center gap-2">
                              <span>💡</span> Parent Recommendation
                           </h4>
                           <p className="text-xs font-bold text-indigo-900 dark:text-indigo-100 leading-relaxed mb-4">{explanation.parentActionRecommended}</p>
                           
                           {explanation.technicalLog && (
                               <div className="mt-auto pt-3 border-t border-indigo-100 dark:border-indigo-800/50">
                                   <p className="text-[8px] font-mono text-indigo-400 uppercase mb-1">System Log</p>
                                   <div className="font-mono text-[9px] text-slate-500 break-all opacity-70">
                                       {explanation.technicalLog}
                                   </div>
                               </div>
                           )}
                        </div>
                    </div>

                    <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3">
                        <Button onClick={onClose} className="w-full py-5 rounded-2xl font-black uppercase tracking-[0.3em] text-xs shadow-xl shadow-indigo-500/20 active:scale-95 transition-all">Return to Dashboard</Button>
                        <p className="text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest">Insight derived from real-time student activity</p>
                    </div>
                </div>
            ) : (
                <div className="text-center py-10 space-y-4">
                    <div className="text-4xl">⚠️</div>
                    <p className="text-red-500 font-bold text-sm">Synchronous Handshake Failed.</p>
                    <Button onClick={onClose} variant="outline" className="w-full">Close Interface</Button>
                </div>
            )}
        </div>
      </Card>
    </div>
  );
};

export default ExplainabilityModal;
