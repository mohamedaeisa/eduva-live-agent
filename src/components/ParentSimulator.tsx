import React, { useState, useEffect } from 'react';
import { UserProfile, SubjectHealthState, ParentActionType, QuizType, Difficulty, DetailLevel, SignalType } from '../types';
import { handleParentAction, logRawActivity, resolveNudge, markFeedAsIgnored } from '../services/parentService';
import { evaluateSubjectHealth } from '../services/decisionService';
import { db } from '../services/firebaseConfig';
import Card from './ui/Card';
import Button from './ui/Button';

interface ParentSimulatorProps {
    students: UserProfile[];
    onClose: () => void;
}

const ParentSimulator: React.FC<ParentSimulatorProps> = ({ students, onClose }) => {
    const [selectedStudentId, setSelectedStudentId] = useState<string>(students[0]?.id || '');
    const [selectedSubject, setSelectedSubject] = useState<string>('Mathematics');
    const [currentHealth, setCurrentHealth] = useState<SubjectHealthState | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [isActing, setIsActing] = useState(false);

    const addLog = (msg: string) => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 10));
    };

    // Live health monitor for the simulator
    useEffect(() => {
        if (!selectedStudentId || !selectedSubject) return;
        
        const unsub = db.collection('student_decisions').doc(selectedStudentId)
            .collection('subjects').doc(selectedSubject)
            .onSnapshot(doc => {
                if (doc.exists) {
                    setCurrentHealth(doc.data() as SubjectHealthState);
                } else {
                    setCurrentHealth(null);
                }
            });
        
        return () => unsub();
    }, [selectedStudentId, selectedSubject]);

    // --- MACRO SCENARIOS ---

    const runScenarioReset = async () => {
        setIsActing(true);
        addLog(`SCENARIO: Wiping data for ${selectedSubject}...`);
        try {
            const snapshot = await db.collection('student_raw_activity')
                .where('studentId', '==', selectedStudentId)
                .where('subject', '==', selectedSubject)
                .get();
            
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            // Delete health doc too
            await db.collection('student_decisions').doc(selectedStudentId)
                  .collection('subjects').doc(selectedSubject).delete();

            addLog("SUCCESS: Subject state reset to Day 0.");
        } catch (e) {
            addLog("ERROR: Reset failed.");
        } finally {
            setIsActing(false);
        }
    };

    const runScenarioFriction = async () => {
        setIsActing(true);
        addLog(`SCENARIO: Injecting High Friction (15 Fails)...`);
        try {
            for (let i = 0; i < 15; i++) {
                await logRawActivity({
                    atomId: `friction_${Date.now()}_${i}`,
                    studentId: selectedStudentId,
                    subject: selectedSubject,
                    actionName: 'Quiz Friction',
                    conceptTag: `${selectedSubject} Gap ${i % 3}`,
                    timestamp: Date.now() - (i * 60000),
                    durationMs: 45000,
                    retries: 2,
                    wasSkipped: false,
                    isCorrect: false
                });
            }
            await evaluateSubjectHealth(selectedStudentId, selectedSubject);
            addLog("SUCCESS: Friction injected. System should trigger CRITICAL status.");
        } catch (e) { addLog("ERROR: Scenario failed."); }
        finally { setIsActing(false); }
    };

    const runScenarioMastery = async () => {
        setIsActing(true);
        addLog(`SCENARIO: Injecting Extreme Mastery (20 Successes)...`);
        try {
            for (let i = 0; i < 20; i++) {
                await logRawActivity({
                    atomId: `mastery_${Date.now()}_${i}`,
                    studentId: selectedStudentId,
                    subject: selectedSubject,
                    actionName: 'Advanced Challenge',
                    conceptTag: `${selectedSubject} Mastery Node ${i % 5}`,
                    timestamp: Date.now() - (i * 60000),
                    durationMs: 30000,
                    retries: 0,
                    wasSkipped: false,
                    isCorrect: true
                });
            }
            await evaluateSubjectHealth(selectedStudentId, selectedSubject);
            addLog("SUCCESS: Mastery injected. System should trigger STABLE/GOOD status.");
        } catch (e) { addLog("ERROR: Scenario failed."); }
        finally { setIsActing(false); }
    };

    const runScenarioRecoveryArc = async () => {
        setIsActing(true);
        addLog(`SCENARIO: Starting Recovery Arc (Struggle -> Support -> Success)...`);
        try {
            // 1. Struggle
            addLog("Step 1: Student fails initial attempts...");
            for (let i = 0; i < 5; i++) {
                await logRawActivity({
                    atomId: `arc_fail_${Date.now()}_${i}`,
                    studentId: selectedStudentId,
                    subject: selectedSubject,
                    actionName: 'Initial Assessment',
                    isCorrect: false,
                    timestamp: Date.now() - (10 * 60000)
                });
            }
            await evaluateSubjectHealth(selectedStudentId, selectedSubject);

            // 2. Parent Support
            addLog("Step 2: Parent dispatches Support Signal...");
            await handleParentAction(selectedStudentId, selectedSubject, 'TALK', undefined, undefined, currentHealth || undefined);

            // 3. Success
            addLog("Step 3: Student succeeds in subsequent session...");
            for (let i = 0; i < 8; i++) {
                await logRawActivity({
                    atomId: `arc_pass_${Date.now()}_${i}`,
                    studentId: selectedStudentId,
                    subject: selectedSubject,
                    actionName: 'Remedial Quiz',
                    isCorrect: true,
                    timestamp: Date.now()
                });
            }
            await evaluateSubjectHealth(selectedStudentId, selectedSubject);
            addLog("SUCCESS: Recovery Arc complete.");
        } catch (e) { addLog("ERROR: Arc failed."); }
        finally { setIsActing(false); }
    };

    // --- GRANULAR ACTIONS ---
    const parentTrigger = async (action: ParentActionType) => {
        setIsActing(true);
        addLog(`ACTION: Parent logged ${action}...`);
        try {
            await handleParentAction(selectedStudentId, selectedSubject, action, undefined, undefined, currentHealth || undefined);
            addLog(`SUCCESS: Parent ${action} documented.`);
        } catch (e) { addLog(`ERROR: Action failed.`); }
        finally { setIsActing(false); }
    };

    const studentTrigger = async (isSuccess: boolean) => {
        setIsActing(true);
        addLog(`ACTION: Student performing ${isSuccess ? 'Mastery' : 'Friction'} event...`);
        try {
            await logRawActivity({
                atomId: `manual_${Date.now()}`,
                studentId: selectedStudentId,
                subject: selectedSubject,
                actionName: 'Manual Activity',
                timestamp: Date.now(),
                isCorrect: isSuccess
            }, true);
            addLog(`SUCCESS: Activity logged. Evaluation triggered.`);
        } catch (e) { addLog(`ERROR: Action failed.`); }
        finally { setIsActing(false); }
    };

    return (
        <div className="fixed inset-0 z-[250] bg-slate-950 flex flex-col animate-fade-in font-sans overflow-hidden">
            {/* LAB HEADER */}
            <div className="bg-slate-900 border-b border-indigo-500/30 p-6 flex flex-col md:flex-row justify-between items-center shrink-0 shadow-2xl gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(79,70,229,0.4)] animate-pulse">🧪</div>
                    <div>
                        <h2 className="text-white text-xl font-black tracking-tight">Intelligence Lab</h2>
                        <p className="text-indigo-400 text-[9px] font-black uppercase tracking-[0.3em]">End-to-End Synergy Simulator</p>
                    </div>
                </div>

                <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto justify-between md:justify-end">
                    <div className="flex gap-4">
                        <div className="flex flex-col items-start">
                            <label className="text-[8px] font-black uppercase text-slate-500 mb-1">Target Student</label>
                            <select 
                                value={selectedStudentId} 
                                onChange={e => setSelectedStudentId(e.target.value)}
                                className="bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-700 outline-none focus:border-indigo-500"
                            >
                                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col items-start">
                            <label className="text-[8px] font-black uppercase text-slate-500 mb-1">Target Subject</label>
                            <select 
                                value={selectedSubject} 
                                onChange={e => setSelectedSubject(e.target.value)}
                                className="bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-700 outline-none focus:border-indigo-500"
                            >
                                {['Mathematics', 'Science', 'English', 'ICT', 'History'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={onClose} className="border-slate-700 text-slate-400 hover:text-white shrink-0">Exit Lab</Button>
                </div>
            </div>

            {/* SCENARIO BAR */}
            <div className="bg-slate-900 p-4 border-b border-white/5 flex gap-4 overflow-x-auto no-scrollbar">
                <ScenarioButton label="Total Reset" sub="Clear all activity" icon="🧹" onClick={runScenarioReset} disabled={isActing} color="red" />
                <ScenarioButton label="Deep Friction" sub="Inject failure loop" icon="🧨" onClick={runScenarioFriction} disabled={isActing} color="orange" />
                <ScenarioButton label="Recovery Arc" sub="Struggle to success" icon="🩹" onClick={runScenarioRecoveryArc} disabled={isActing} color="indigo" />
                <ScenarioButton label="Extreme Success" sub="Push to 100%" icon="👑" onClick={runScenarioMastery} disabled={isActing} color="emerald" />
            </div>

            {/* MAIN DUAL PANE */}
            <div className="flex-grow grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
                
                {/* LEFT: PARENT ACTOR */}
                <div className="p-6 border-r border-slate-900 bg-slate-950 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between">
                        <h3 className="text-indigo-500 font-black text-xs uppercase tracking-[0.4em] flex items-center gap-2">
                           <span className="w-2 h-2 bg-indigo-500 rounded-full"></span> PARENT COCKPIT
                        </h3>
                        <span className="text-[8px] font-black bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded">WRITE ACCESS</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <SimButton label="Send Support" sub="TALK Signal" icon="🤝" onClick={() => parentTrigger('TALK')} disabled={isActing} />
                        <SimButton label="Monitor Only" sub="CHECK State" icon="🔭" onClick={() => parentTrigger('MONITOR')} disabled={isActing} color="slate" />
                        <SimButton label="Repair Mission" sub="NUDGE: Revise" icon="🛠️" onClick={() => parentTrigger('FOUNDATION_REPAIR')} disabled={isActing} color="orange" />
                        <SimButton label="Strict Exam" sub="NUDGE: Challenge" icon="🎓" onClick={() => parentTrigger('EXAM')} disabled={isActing} color="indigo" />
                    </div>

                    {/* LIVE MONITOR PREVIEW */}
                    <div className="mt-auto">
                        <Card className="bg-slate-900 border-indigo-500/20 p-6 rounded-[2rem] relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-5 text-6xl">📊</div>
                            <h4 className="text-[9px] font-black uppercase text-indigo-400 tracking-widest mb-4">
                                LIVE TELEMETRY: {students.find(s => s.id === selectedStudentId)?.name}
                            </h4>
                            {currentHealth ? (
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-3xl font-black text-white italic">{currentHealth.confidenceScore}%</p>
                                        <p className="text-[10px] font-black uppercase text-slate-500 mt-1">CONFIDENCE</p>
                                    </div>
                                    <div className="text-right">
                                        <div className={`inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                            currentHealth.overallStatus === 'GOOD' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                            currentHealth.overallStatus === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                            'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                        }`}>
                                            {currentHealth.overallStatus}
                                        </div>
                                        <p className="text-[8px] font-bold text-slate-500 mt-1 uppercase tracking-tighter">
                                          TREND: {currentHealth.trend} | HRS: {currentHealth.hoursLogged}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-slate-600 text-xs italic">Awaiting initial signals for {selectedSubject}...</p>
                            )}
                        </Card>
                    </div>
                </div>

                {/* RIGHT: STUDENT ACTOR */}
                <div className="p-6 bg-slate-900/50 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between">
                        <h3 className="text-emerald-500 font-black text-xs uppercase tracking-[0.4em] flex items-center gap-2">
                           <span className="w-2 h-2 bg-emerald-500 rounded-full"></span> STUDENT COCKPIT
                        </h3>
                        <span className="text-[8px] font-black bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">WRITE ACCESS</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <SimButton label="Correct Answer" sub="+1 Activity" icon="📈" onClick={() => studentTrigger(true)} disabled={isActing} color="emerald" />
                        <SimButton label="Wrong Answer" sub="+1 Activity" icon="📉" onClick={() => studentTrigger(false)} disabled={isActing} color="red" />
                        <SimButton label="Force Resolve" sub="Complete Nudges" icon="✅" onClick={async () => {
                            setIsActing(true);
                            addLog("Resolving all pending nudges...");
                            const snap = await db.collection('parent_nudges').where('studentId', '==', selectedStudentId).where('subject', '==', selectedSubject).where('status', '==', 'PENDING').get();
                            for (const doc of snap.docs) { await resolveNudge(doc.id, 10, 10); }
                            addLog(`Done. ${snap.size} missions resolved.`);
                            setIsActing(false);
                        }} disabled={isActing} color="indigo" />
                        <SimButton label="Ignore Loop" sub="Dismiss Feed" icon="😴" onClick={async () => {
                            setIsActing(true);
                            addLog("Dismissing recent parent comms...");
                            const snap = await db.collection('parent_feed').where('studentId', '==', selectedStudentId).where('subject', '==', selectedSubject).orderBy('createdAt', 'desc').limit(1).get();
                            if (!snap.empty) { await markFeedAsIgnored(snap.docs[0].id); addLog("Feed dismissed."); }
                            setIsActing(false);
                        }} disabled={isActing} color="slate" />
                    </div>

                    {/* AUDIT LOGS */}
                    <div className="mt-auto flex flex-col h-48">
                      <div className="bg-black/40 rounded-t-2xl p-3 border-x border-t border-white/5 flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Database Audit Log</span>
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                      </div>
                      <div className="bg-black/60 rounded-b-2xl p-4 font-mono text-[10px] flex-grow overflow-y-auto border border-white/5 shadow-inner">
                          {logs.length === 0 && <p className="text-slate-800 italic">Handshaking with Educational Intelligence Matrix...</p>}
                          {logs.map((log, i) => (
                              <div key={i} className="text-green-500/70 mb-1 flex gap-2">
                                  <span className="shrink-0 text-slate-700">&gt;</span>
                                  <span className="break-words">{log}</span>
                              </div>
                          ))}
                      </div>
                    </div>
                </div>
            </div>

            <div className="bg-slate-900 p-4 text-center border-t border-slate-800 shrink-0">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.5em]">Scenario Lab Suite • Precision Engineering</p>
            </div>
        </div>
    );
};

const ScenarioButton: React.FC<{ label: string, sub: string, icon: string, onClick: () => void, disabled?: boolean, color: string }> = ({ label, sub, icon, onClick, disabled, color }) => {
    const colorMap: Record<string, string> = {
        red: 'border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/20',
        orange: 'border-orange-500/30 bg-orange-500/5 text-orange-400 hover:bg-orange-500/20',
        indigo: 'border-indigo-500/30 bg-indigo-500/5 text-indigo-400 hover:bg-indigo-500/20',
        emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/20'
    };
    return (
        <button 
            onClick={onClick} 
            disabled={disabled}
            className={`flex items-center gap-3 px-4 py-2 rounded-xl border-2 transition-all active:scale-95 disabled:opacity-20 shrink-0 text-left ${colorMap[color]}`}
        >
            <span className="text-2xl">{icon}</span>
            <div>
                <p className="text-[10px] font-black uppercase tracking-tight leading-none mb-1">{label}</p>
                <p className="text-[8px] font-bold opacity-60 uppercase tracking-widest leading-none">{sub}</p>
            </div>
        </button>
    );
};

const SimButton: React.FC<{ label: string, sub: string, icon: string, onClick: () => void, disabled?: boolean, color?: string }> = ({ label, sub, icon, onClick, disabled, color = 'indigo' }) => {
    const colorMap: Record<string, string> = {
        indigo: 'hover:border-indigo-500 hover:bg-indigo-500/10 text-indigo-100',
        emerald: 'hover:border-emerald-500 hover:bg-emerald-500/10 text-emerald-100',
        red: 'hover:border-red-500 hover:bg-red-500/10 text-red-100',
        orange: 'hover:border-orange-500 hover:bg-orange-500/10 text-orange-100',
        slate: 'hover:border-slate-500 hover:bg-slate-500/10 text-slate-100'
    };

    return (
        <button 
            onClick={onClick}
            disabled={disabled}
            className="flex flex-col items-center p-5 rounded-2xl border-2 border-slate-800 bg-slate-900/50 transition-all active:scale-95 disabled:opacity-20"
        >
            <div className={`w-full flex flex-col items-center ${colorMap[color]}`}>
                <span className="text-2xl mb-2">{icon}</span>
                <span className="text-[11px] font-black uppercase tracking-tight text-center">{label}</span>
                <span className="text-[8px] font-bold opacity-40 uppercase tracking-widest mt-1 text-center">{sub}</span>
            </div>
        </button>
    );
};

export default ParentSimulator;
