
import React from 'react';
import { ParentNudge, InteractionState } from '../types';
import Card from './ui/Card';

interface ParentFollowUpProps {
    nudges: ParentNudge[];
}

const ParentFollowUp: React.FC<ParentFollowUpProps> = ({ nudges }) => {
    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.4em] ml-1">Mission Monitor</h3>
                <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg border border-indigo-100 uppercase tracking-tighter">Live E2E Feed</span>
            </div>

            {nudges.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                    {nudges.map((nudge) => {
                        const state = nudge.interactionState || InteractionState.ISSUED;
                        const isDone = nudge.status === 'COMPLETED';
                        const isStalled = nudge.status === 'STALLED';
                        const isStrategic = !!nudge.metadata?.isStrategic;

                        // Step Mapping for Visualizer
                        const stepIndexMap: Record<InteractionState, number> = {
                            [InteractionState.ISSUED]: 0,
                            [InteractionState.ACKNOWLEDGED]: 1,
                            [InteractionState.STUDYING]: 1, 
                            [InteractionState.IN_PROGRESS]: 2,
                            [InteractionState.VERIFYING]: 2, 
                            [InteractionState.COMPLETED]: 3, 
                            [InteractionState.IGNORED]: -1,
                            [InteractionState.ACTION_SKIPPED]: -1,
                            [InteractionState.STALLED]: -1
                        };
                        const currentStepIndex = isDone ? 3 : stepIndexMap[state];

                        // SANITIZE TITLE: Ensure system wrappers don't leak into the monitor
                        let displayTitle = nudge.subject;
                        if (displayTitle.toLowerCase().includes('generated quiz')) {
                            displayTitle = nudge.metadata?.targetTopic || 'Strategic Rescue';
                        }

                        return (
                            <Card key={nudge.id} className={`p-0 border-0 shadow-sm overflow-hidden group transition-all duration-500 ${isStalled ? 'ring-2 ring-red-500/50' : ''}`}>
                                <div className="flex items-stretch">
                                    <div className={`w-1.5 shrink-0 ${isDone ? 'bg-emerald-500' : isStalled ? 'bg-red-600 animate-pulse' : nudge.intent === 'FIX' ? (isStrategic ? 'bg-indigo-600 animate-pulse' : 'bg-orange-500 animate-pulse') : 'bg-indigo-400 animate-pulse'}`}></div>
                                    
                                    <div className="flex-grow p-6">
                                        <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-6">
                                            <div className="flex items-start gap-4">
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner shrink-0 ${isDone ? 'bg-emerald-50 text-emerald-600' : isStalled ? 'bg-red-100 text-red-600' : nudge.intent === 'FIX' ? (isStrategic ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600') : 'bg-indigo-50 text-indigo-600'}`}>
                                                    {isStalled ? '⌛' : nudge.intent === 'FIX' ? (isStrategic ? '🧬' : '🔧') : nudge.intent === 'REVISE' ? '🧬' : '⚔️'}
                                                </div>
                                                <div>
                                                    <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isStalled ? 'text-red-500' : isStrategic ? 'text-indigo-500' : 'text-slate-400'}`}>
                                                        {isStalled ? 'Mission Zombie / Stalled' : isStrategic ? 'Task Force Repair' : nudge.intent === 'FIX' ? 'Urgent Repair' : nudge.intent === 'REVISE' ? 'Repair Protocol' : 'Combat Protocol'}
                                                    </p>
                                                    <h4 className="text-lg font-black text-slate-800 dark:text-white leading-tight">{displayTitle}</h4>
                                                    {nudge.metadata?.targetTopic && !isStrategic && (
                                                        <p className="text-[10px] font-bold text-slate-400 italic mt-1">Focus: {nudge.metadata.targetTopic}</p>
                                                    )}
                                                    {isStrategic && (
                                                        <p className="text-[10px] font-bold text-indigo-400 italic mt-1">Status: Cluster Rescue Active</p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="text-right">
                                                {isDone ? (
                                                    <div>
                                                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-tighter mb-1">Result</p>
                                                        <p className="text-2xl font-black text-emerald-600 italic">{nudge.resultScore}/{nudge.resultTotal}</p>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-end gap-2">
                                                        <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                                            isStalled ? 'bg-red-100 text-red-700' :
                                                            state === InteractionState.VERIFYING ? 'bg-blue-100 text-blue-700 animate-pulse' :
                                                            state === InteractionState.STUDYING ? 'bg-orange-100 text-orange-700 animate-pulse' :
                                                            state === InteractionState.ACKNOWLEDGED ? 'bg-amber-100 text-amber-700' :
                                                            'bg-slate-100 text-slate-500'
                                                        }`}>
                                                            {isStalled ? 'STALLED (24H+)' : state.replace('_', ' ')}
                                                        </div>
                                                        {isStalled && (
                                                            <button className="text-[9px] font-black uppercase text-indigo-600 hover:underline">
                                                                Nudge Student Again →
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* State Pipeline Visualizer */}
                                        <div className="relative">
                                            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 dark:bg-slate-800 -translate-y-1/2"></div>
                                            <div className="relative flex justify-between">
                                                {[
                                                    { id: InteractionState.ISSUED, label: 'Issued' },
                                                    { id: InteractionState.STUDYING, label: 'Study' },
                                                    { id: InteractionState.VERIFYING, label: 'Verify' },
                                                    { id: InteractionState.COMPLETED, label: 'Done' }
                                                ].map((s, i) => {
                                                    const isActive = currentStepIndex === i;
                                                    const isPassed = currentStepIndex > i;
                                                    
                                                    return (
                                                        <div key={i} className="flex flex-col items-center gap-2 relative z-10">
                                                            <div className={`w-3 h-3 rounded-full border-2 transition-all duration-500 ${
                                                                isStalled ? 'bg-slate-300 border-slate-400' :
                                                                isActive ? (isStrategic ? 'bg-indigo-600 border-indigo-300 scale-125 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-orange-500 border-orange-200 scale-125 shadow-[0_0_10px_rgba(249,115,22,0.5)]') :
                                                                isPassed || isDone ? 'bg-emerald-500 border-emerald-200' : 'bg-white dark:bg-slate-900 border-slate-200'
                                                            }`}></div>
                                                            <span className={`text-[7px] font-black uppercase tracking-tighter ${isActive ? (isStrategic ? 'text-indigo-600' : 'text-orange-600') : 'text-slate-400'}`}>{s.label}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-20 bg-slate-50 dark:bg-slate-900/50 border-4 border-dashed border-slate-100 dark:border-slate-800 rounded-[2.5rem] opacity-30">
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em]">Awaiting Signals</p>
                </div>
            )}
        </div>
    );
};

export default ParentFollowUp;
