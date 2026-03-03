import React, { useState } from 'react';
import { SubjectHealthState, ParentFeedEvent, AuthorityLevel, ParentPreferences, ParentActionType } from '../types';
import { handleParentAction } from '../services/parentService';
import { sendTelemetry } from '../services/telemetryBrainService';
import firebase from 'firebase/compat/app';
import Card from './ui/Card';
import Button from './ui/Button';

interface ParentSubjectDetailProps {
  studentId: string;
  health: SubjectHealthState;
  feed: ParentFeedEvent[];
  onClose: () => void;
  onActionComplete: () => void;
  onExplain?: (event: ParentFeedEvent) => void;
  authority: AuthorityLevel;
  preferences: ParentPreferences;
  onUpdatePreferences: (prefs: ParentPreferences) => void;
  onCompare?: () => void;
}

const ParentSubjectDetail: React.FC<ParentSubjectDetailProps> = ({ 
  studentId, health, feed, onClose, onActionComplete, onExplain, authority, preferences, onUpdatePreferences, onCompare 
}) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const performAction = async (type: ParentActionType, topic?: string, sourceFile?: string, contentId?: string) => {
    setLoadingAction(type);
    
    // --- BRAIN LAYER HOOK ---
    sendTelemetry({
      userId: firebase.auth()?.currentUser?.uid || 'unknown',
      studentId: studentId,
      module: 'ParentControl',
      eventType: 'parent_intervention',
      payload: {
        actionType: type,
        atoms: topic ? [topic] : [],
        materialId: contentId || 'GLOBAL',
        metadata: { sourceFile }
      },
      timestamp: new Date().toISOString()
    });

    try {
      await handleParentAction(studentId, health.subjectId, type, topic, { contentId, fileName: sourceFile }, health);
      onActionComplete();
    } catch (e) {
      console.error("Action failed", e);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
      <Card className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-between items-center">
           <div>
              <h2 className="text-3xl font-black italic tracking-tighter text-indigo-600">{health.subjectId} Report</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Mastery Depth: {health.confidenceScore}%</p>
           </div>
           <button onClick={onClose} className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all">✕</button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar flex-grow space-y-10">
           <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-[2rem] border border-indigo-100 text-center">
                 <p className="text-[10px] font-black text-indigo-400 uppercase mb-2">Trend</p>
                 <p className="text-2xl font-black text-indigo-600">{health.trend}</p>
              </div>
              <div className="p-6 bg-emerald-50 dark:bg-emerald-900/20 rounded-[2rem] border border-emerald-100 text-center">
                 <p className="text-[10px] font-black text-emerald-400 uppercase mb-2">Effort</p>
                 <p className="text-2xl font-black text-emerald-600">{health.hoursLogged}h</p>
              </div>
              <div className="p-6 bg-amber-50 dark:bg-amber-900/20 rounded-[2rem] border border-amber-100 text-center">
                 <p className="text-[10px] font-black text-amber-400 uppercase mb-2">Risk Topic</p>
                 <p className="text-lg font-black text-amber-600 truncate">{health.primaryRiskTopic || 'NONE'}</p>
              </div>
           </section>

           <section className="space-y-6">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.3em]">Tactical Interventions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <button 
                   onClick={() => performAction('FOUNDATION_REPAIR', health.primaryRiskTopic || health.subjectId)}
                   className="p-6 rounded-[2rem] border-2 border-orange-100 bg-orange-50/50 hover:bg-orange-100 text-left transition-all group"
                 >
                    <span className="text-2xl block mb-2">🔧</span>
                    <h4 className="font-black text-orange-700">Dispatch Foundation Repair</h4>
                    <p className="text-xs text-orange-600 font-medium mt-1">Force a simplified remedial session to fix core gaps.</p>
                 </button>
                 <button 
                   onClick={() => performAction('EXAM')}
                   className="p-6 rounded-[2rem] border-2 border-indigo-100 bg-indigo-50/50 hover:bg-indigo-100 text-left transition-all"
                 >
                    <span className="text-2xl block mb-2">🎓</span>
                    <h4 className="font-black text-indigo-700">Trigger Mock Exam</h4>
                    <p className="text-xs text-indigo-600 font-medium mt-1">Full paper simulation to verify exam readiness.</p>
                 </button>
              </div>
           </section>
        </div>
      </Card>
    </div>
  );
};

export default ParentSubjectDetail;
