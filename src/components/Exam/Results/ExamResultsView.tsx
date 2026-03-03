import React from 'react';
import { ExamResult } from '../../../services/scoring/types';
import { ExamSession } from '../../../types';
import { identifyMicroLoopCandidates } from '../../../services/scoring/scoringService';
import Button from '../../ui/Button';
import Card from '../../ui/Card';

interface ExamResultsViewProps {
    result: ExamResult;
    session?: ExamSession; // Optional for legacy compat
    onViewMirror: () => void;
    onBack: () => void;
    onStartMicroLoop?: (atomId: string) => void;
}

const ExamResultsView: React.FC<ExamResultsViewProps> = ({ result, session, onViewMirror, onBack, onStartMicroLoop }) => {

    const { normalizedScore, evaluated, totalSlots, failedSlots, durationSec, correct } = result;
    const accuracy = evaluated > 0 ? Math.round((correct / evaluated) * 100) : 0;

    // Identify Candidates
    const loopCandidates = React.useMemo(() => {
        if (!session || !onStartMicroLoop) return [];
        return identifyMicroLoopCandidates(result);
    }, [result, session]);

    // Format Duration
    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}m ${s}s`;
    };

    const getAtomDetails = (atomId: string) => {
        const item = session?.items.find(i => i.atomId === atomId);
        return item?.atomSnapshot?.metadata?.conceptTag || atomId;
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-900 animate-fade-in p-4 overflow-y-auto">
            <div className="w-full max-w-sm space-y-4 my-8">

                {/* 1. Score Card */}
                <Card className="p-6 text-center border-t-8 border-indigo-500 shadow-2xl bg-white relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

                    <span className="text-5xl mb-4 block animate-bounce-subtle">
                        {normalizedScore >= 80 ? '🏆' : (normalizedScore >= 50 ? '✅' : '📚')}
                    </span>

                    <h1 className="text-xl font-black text-slate-900 mb-1">Session Complete</h1>
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-6">
                        {new Date(result.finishedAt).toLocaleDateString()}
                    </p>

                    {/* Big Score */}
                    <div className="mb-6">
                        <span className="text-6xl font-black text-indigo-600 tracking-tighter">
                            {normalizedScore}
                            <span className="text-2xl text-slate-300 align-top">%</span>
                        </span>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">
                            Based on {evaluated} Evaluated Items
                        </p>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="text-xl font-black text-slate-700">{formatTime(durationSec)}</div>
                            <div className="text-[10px] uppercase font-bold text-slate-400">Time Taken</div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="text-xl font-black text-slate-700">{correct} / {evaluated}</div>
                            <div className="text-[10px] uppercase font-bold text-slate-400">Accuracy</div>
                        </div>
                    </div>

                    {/* Trust Warning */}
                    {failedSlots > 0 && (
                        <div className="mb-8 p-3 bg-amber-50 border border-amber-200 rounded-lg text-left text-xs text-amber-800 flex items-start gap-2">
                            <span className="text-amber-500 text-lg">⚠</span>
                            <div>
                                <strong className="block font-bold">Trust Mode Active</strong>
                                {failedSlots} questions were excluded from grading due to technical availability. They do not count against you.
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="space-y-3">
                        <Button
                            onClick={onViewMirror}
                            className="w-full py-4 bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:scale-[1.02] active:scale-[0.98] transition-all font-black"
                        >
                            View Growth Mirror ✨
                        </Button>
                        <Button
                            onClick={onBack}
                            variant="outline"
                            className="w-full border-none text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                        >
                            Return to Dashboard
                        </Button>
                    </div>

                </Card>

                {/* 2. Micro-Loop Suggestions (Stage 6) */}
                {loopCandidates.length > 0 && (
                    <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
                        <div className="flex items-center justify-between mb-2 px-2">
                            <h3 className="text-slate-400 text-xs font-black uppercase tracking-widest">Surgical Corrections</h3>
                            <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">New</span>
                        </div>
                        <div className="space-y-3">
                            {loopCandidates.map(atomId => (
                                <Card key={atomId} className="p-4 border-l-4 border-rose-500 bg-white hover:bg-rose-50 transition-colors group cursor-pointer" onClick={() => onStartMicroLoop?.(atomId)}>
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <div className="text-xs font-bold text-rose-500 uppercase mb-1">Missed Concept</div>
                                            <div className="font-bold text-slate-800">{getAtomDetails(atomId)}</div>
                                        </div>
                                        <button className="bg-white border-2 border-rose-100 group-hover:border-rose-500 text-rose-600 w-8 h-8 rounded-full flex items-center justify-center font-bold transition-all">
                                            ⚡
                                        </button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}


                <p className="text-center text-slate-500 text-[10px] uppercase font-bold tracking-widest opacity-50">
                    Eduva Growth Engine
                </p>
            </div>
        </div>
    );
};

export default ExamResultsView;
