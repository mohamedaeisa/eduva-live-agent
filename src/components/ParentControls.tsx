
import React, { useState, useEffect } from 'react';
import { ParentPreferences, CoverageRule, AuthorityLevel } from '../types';
import { updateParentPreferences, getCoverageRules, updateCoverageRule, updateStudentAuthority } from '../services/parentService';
import Card from './ui/Card';
import Button from './ui/Button';
import firebase from 'firebase/compat/app';

interface ParentControlsProps {
    studentId: string;
    authority: AuthorityLevel;
    preferences: ParentPreferences;
    onUpdate: (prefs: ParentPreferences) => void;
}

const ParentControls: React.FC<ParentControlsProps> = ({ studentId, authority, preferences, onUpdate }) => {
    const [localPrefs, setLocalPrefs] = useState<ParentPreferences>(preferences);
    const [coverage, setCoverage] = useState<CoverageRule[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isEscalating, setIsEscalating] = useState(false);

    useEffect(() => {
        loadCoverage();
    }, [studentId]);

    const loadCoverage = async () => {
        const rules = await getCoverageRules(studentId);
        setCoverage(rules);
    };

    const handleEscalate = async () => {
        const parentId = firebase.auth().currentUser?.uid;
        if (!parentId) return;

        setIsEscalating(true);
        try {
            const nextLevel = authority === AuthorityLevel.MONITOR
                ? AuthorityLevel.CO_PILOT
                : AuthorityLevel.COMMANDER;

            await updateStudentAuthority(parentId, studentId, nextLevel);
            // Live subscription in Dashboard will handle state update
        } catch (e) {
            alert("Escalation failed.");
        } finally {
            setIsEscalating(false);
        }
    };

    const handleSavePrefs = async () => {
        if (authority === AuthorityLevel.MONITOR) return;
        setIsSaving(true);
        // Explicitly update parent_profiles with new preferences
        const parentId = firebase.auth().currentUser?.uid;
        if (parentId) {
            await updateParentPreferences(parentId, localPrefs);
        }
        onUpdate(localPrefs);
        setIsSaving(false);
    };

    const toggleCoverageStatus = async (rule: CoverageRule) => {
        if (authority !== AuthorityLevel.COMMANDER) {
            alert("COMMANDER AUTHORITY REQUIRED to modify coverage guardrails.");
            return;
        }
        const nextStatusMap: Record<string, CoverageRule['status']> = {
            'REQUIRED': 'OPTIONAL',
            'OPTIONAL': 'LOCKED',
            'LOCKED': 'REQUIRED'
        };
        const next = nextStatusMap[rule.status];
        await updateCoverageRule({ ...rule, status: next });
        loadCoverage();
    };

    const isControlsLocked = authority === AuthorityLevel.MONITOR;
    const isCommanderOnly = authority !== AuthorityLevel.COMMANDER;

    return (
        <div className="space-y-10 animate-slide-up">
            {/* AUTHORITY ESCALATION BANNER */}
            {authority !== AuthorityLevel.COMMANDER && (
                <div className="p-8 bg-indigo-50 dark:bg-indigo-900/30 border-2 border-indigo-200 dark:border-indigo-800 rounded-[2.5rem] flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl animate-fade-in">
                    <div className="flex items-center gap-6 text-center md:text-start">
                        <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-4xl shadow-inner border border-indigo-100 flex-shrink-0">
                            {authority === AuthorityLevel.MONITOR ? '🛡️' : '🎖️'}
                        </div>
                        <div>
                            <p className="text-sm font-black text-indigo-900 dark:text-indigo-100 uppercase tracking-widest mb-1">
                                {authority === AuthorityLevel.MONITOR ? 'Authority Level: Monitor' : 'Authority Level: Co-Pilot'}
                            </p>
                            <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium leading-relaxed max-w-sm">
                                {authority === AuthorityLevel.MONITOR
                                    ? 'Escalate to Co-Pilot to unlock AI Dials. To unlock Strategic Guardrails, you must reach Commander level.'
                                    : 'Personalized AI dials unlocked. Escalate to Commander Mode to manage topic locks and forced requirements.'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleEscalate}
                        disabled={isEscalating}
                        className="w-full md:w-auto px-10 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] shadow-2xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                    >
                        {isEscalating ? 'PROCESSING...' : authority === AuthorityLevel.MONITOR ? 'Escalate to Co-Pilot' : 'Unlock Strategic Guardrails'}
                    </button>
                </div>
            )}

            {/* TACTICAL DIALS */}
            <Card className={`p-10 transition-all duration-700 ${isControlsLocked ? 'opacity-30 grayscale pointer-events-none' : 'shadow-2xl border-indigo-200'}`}>
                <div className="flex justify-between items-center mb-10">
                    <div>
                        <h3 className="text-xl font-black flex items-center gap-3">
                            <span className="text-2xl">🎚️</span> Tactical AI Dials
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Behavioral synthesis overrides</p>
                    </div>
                    {isControlsLocked && <span className="text-[10px] font-black bg-slate-100 text-slate-400 px-3 py-1.5 rounded-xl border border-slate-200">READ-ONLY</span>}
                </div>

                <div className="space-y-10">
                    {/* ACADEMIC STRICTNESS */}
                    <div className="space-y-5">
                        <div className="flex justify-between items-end">
                            <div>
                                <label className="text-[11px] font-black uppercase text-slate-500 tracking-[0.2em] ltr:ml-1 rtl:mr-1">Academic Strictness</label>
                                <p className="text-[9px] text-slate-400 font-bold ltr:ml-1 rtl:mr-1 leading-tight mt-1">Controls the rigor of AI grading. Higher strictness requires more precise terminology and penalizes minor conceptual errors. Default: 50%.</p>
                            </div>
                            <span className="text-sm font-black text-indigo-600 font-mono">{Math.round(localPrefs.strictnessLevel * 100)}%</span>
                        </div>
                        <input
                            type="range" min="0" max="1" step="0.1"
                            disabled={isControlsLocked}
                            value={localPrefs.strictnessLevel}
                            onChange={e => setLocalPrefs({ ...localPrefs, strictnessLevel: parseFloat(e.target.value) })}
                            className="w-full h-3 bg-slate-100 dark:bg-slate-900 rounded-full appearance-none cursor-pointer accent-indigo-600 shadow-inner"
                        />
                    </div>

                    {/* CHALLENGE GRADIENT */}
                    <div className="space-y-5">
                        <div className="flex justify-between items-end">
                            <div>
                                <label className="text-[11px] font-black uppercase text-slate-500 tracking-[0.2em] ltr:ml-1 rtl:mr-1">Challenge Gradient</label>
                                <p className="text-[9px] text-slate-400 font-bold ltr:ml-1 rtl:mr-1 leading-tight mt-1">Determines how quickly the AI scales difficulty. High values accelerate the path to expert-level questions. Default: 50%.</p>
                            </div>
                            <span className="text-sm font-black text-indigo-600 font-mono">{Math.round(localPrefs.difficultyGrowthRate * 100)}%</span>
                        </div>
                        <input
                            type="range" min="0" max="1" step="0.1"
                            disabled={isControlsLocked}
                            value={localPrefs.difficultyGrowthRate}
                            onChange={e => setLocalPrefs({ ...localPrefs, difficultyGrowthRate: parseFloat(e.target.value) })}
                            className="w-full h-3 bg-slate-100 dark:bg-slate-900 rounded-full appearance-none cursor-pointer accent-indigo-600 shadow-inner"
                        />
                    </div>

                    {/* FOUNDATION REPAIR THRESHOLD */}
                    <div className="space-y-5">
                        <div className="flex justify-between items-end">
                            <div>
                                <label className="text-[11px] font-black uppercase text-slate-500 tracking-[0.2em] ltr:ml-1 rtl:mr-1">Foundation Repair Threshold</label>
                                <p className="text-[9px] text-slate-400 font-bold ltr:ml-1 rtl:mr-1 leading-tight mt-1">Defines the passing score for concept mastery. Topics below this threshold trigger automated remedial missions. Default: 80%.</p>
                            </div>
                            <span className="text-sm font-black text-emerald-600 font-mono">{Math.round((localPrefs.foundationRepairThreshold || 0.8) * 100)}%</span>
                        </div>
                        <input
                            type="range" min="0.5" max="1" step="0.05"
                            disabled={isControlsLocked}
                            value={localPrefs.foundationRepairThreshold || 0.8}
                            onChange={e => setLocalPrefs({ ...localPrefs, foundationRepairThreshold: parseFloat(e.target.value) })}
                            className="w-full h-3 bg-slate-100 dark:bg-slate-900 rounded-full appearance-none cursor-pointer accent-emerald-500 shadow-inner"
                        />
                    </div>

                    {/* MISSION SCHEDULING SECTION */}
                    <div className="pt-8 border-t border-slate-100 dark:border-slate-800 space-y-6">
                        <div className="flex items-center gap-3">
                            <span className="text-xl">⏳</span>
                            <h4 className="text-xs font-black uppercase text-indigo-600 tracking-widest">Mission Scheduling</h4>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ltr:ml-1 rtl:mr-1">Snooze Duration</label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        min="1"
                                        disabled={isControlsLocked}
                                        value={localPrefs.rescheduleInterval || 2}
                                        onChange={e => setLocalPrefs({ ...localPrefs, rescheduleInterval: parseInt(e.target.value) || 1 })}
                                        className="w-20 p-3 rounded-xl border-2 border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold outline-none focus:border-indigo-500"
                                    />
                                    <select
                                        disabled={isControlsLocked}
                                        value={localPrefs.rescheduleUnit || 'HOURS'}
                                        onChange={e => setLocalPrefs({ ...localPrefs, rescheduleUnit: e.target.value as any })}
                                        className="flex-grow p-3 rounded-xl border-2 border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold outline-none focus:border-indigo-500"
                                    >
                                        <option value="MINUTES">Minutes (Testing)</option>
                                        <option value="HOURS">Hours (Standard)</option>
                                        <option value="DAYS">Days (Strict)</option>
                                    </select>
                                </div>
                                <p className="text-[9px] text-slate-400 font-bold leading-relaxed italic pr-4">Set how long the mission disappears from the student cockpit after they click "Later".</p>
                            </div>
                        </div>
                    </div>
                </div>

                {!isControlsLocked && (
                    <div className="mt-12 pt-8 border-t border-slate-100 dark:border-slate-800">
                        <Button onClick={handleSavePrefs} isLoading={isSaving} className="w-full py-5 rounded-2xl font-black uppercase tracking-[0.3em] text-xs shadow-xl shadow-indigo-500/20">UPLOAD DIAL PARAMETERS</Button>
                    </div>
                )}
            </Card>

            {/* GUARDRAILS & COVERAGE */}
            <Card className={`p-10 transition-all duration-700 ${isCommanderOnly ? 'opacity-30 grayscale' : 'shadow-2xl border-indigo-200'}`}>
                <div className="flex justify-between items-center mb-10">
                    <div>
                        <h3 className="text-xl font-black flex items-center gap-3">
                            <span className="text-2xl">🚧</span> Strategic Guardrails
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Topic-level access and roadmap locking</p>
                    </div>
                    {isCommanderOnly && <span className="text-[10px] font-black bg-purple-50 text-purple-700 px-3 py-1.5 rounded-xl border border-purple-100 uppercase tracking-widest">COMMANDER REQ.</span>}
                </div>

                <div className="space-y-4">
                    {coverage.length > 0 ? coverage.map(rule => (
                        <div key={rule.id} className="flex items-center justify-between p-6 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm transition-all hover:border-indigo-400/50 hover:shadow-lg">
                            <div>
                                <p className="text-[9px] font-black uppercase text-indigo-500 tracking-[0.25em] mb-1">{rule.subject}</p>
                                <p className="text-lg font-black text-slate-800 dark:text-slate-100 italic tracking-tighter">{rule.topic}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <button
                                    onClick={() => toggleCoverageStatus(rule)}
                                    disabled={isCommanderOnly}
                                    className={`px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all border-2 ${rule.status === 'REQUIRED' ? 'bg-green-50 text-green-700 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]' :
                                            rule.status === 'OPTIONAL' ? 'bg-slate-100 text-slate-50 border-slate-300' :
                                                'bg-red-50 text-red-700 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                                        }`}
                                >
                                    {rule.status}
                                </button>
                                {!isCommanderOnly && <span className="text-[8px] font-bold text-slate-400 uppercase">Tap to cycle</span>}
                            </div>
                        </div>
                    )) : (
                        <div className="text-center py-20 border-4 border-dashed border-slate-100 dark:border-slate-800 rounded-[3rem]">
                            <span className="text-5xl block mb-6 opacity-30">🔓</span>
                            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em]">Zero Active Restrictions</p>
                            <p className="text-[11px] text-slate-400 mt-2 italic font-medium">Student has full autonomous flight.</p>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
};

export default ParentControls;
