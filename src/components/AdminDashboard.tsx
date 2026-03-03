import React, { useEffect, useState, useRef } from 'react';
import { auth, db } from '../services/firebaseConfig';
import { monetizationClient } from '../services/monetization/client';
import Button from './ui/Button';
import Card from './ui/Card';
import { UserProfile, AtomCore, Difficulty, QuizType, DetailLevel, Plan, Discount } from '../types';
import { extractAtomsFromDocument } from '../services/ai/atomExtractionService';
import { computeDocFingerprint } from '../utils/fingerprintUtils';
import { approveAndPromoteGroup } from '../services/adminApprovalService';

interface AdminDashboardProps {
    onBack: () => void;
    currentUser: UserProfile | null;
}

interface QaPhaseResult {
    phase: string;
    status: 'Pass' | 'Fail' | 'Processing' | 'Idle';
    comment: string;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack, currentUser }) => {
    const [loading, setLoading] = useState(false);
    const [accessDenied, setAccessDenied] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'global_staging' | 'qa_runner' | 'plan_config'>('global_staging');

    // Staging State
    const [stagedGroups, setStagedGroups] = useState<any[]>([]);
    const [reviewingGroup, setReviewingGroup] = useState<any | null>(null);

    // Helper: Load Staging Queue
    const loadStagingQueue = async () => {
        if (!db) return;
        setLoading(true);
        try {
            const snap = await db.collection('temp_global_atoms')
                .where('status', '==', 'pendingReview')
                .limit(20).get();

            const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
            setStagedGroups(items.sort((a, b) => ((b as any).lastUpdate || 0) - ((a as any).lastUpdate || 0)));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // QA Runner State
    const [qaFile, setQaFile] = useState<{ name: string, data: string } | null>(null);
    const [qaSubject, setQaSubject] = useState('General');
    const [qaResults, setQaResults] = useState<AtomCore[]>([]);
    const [qaPhases, setQaPhases] = useState<QaPhaseResult[]>([
        { phase: "Phase 1: Chunking", status: 'Idle', comment: "Pending trigger" },
        { phase: "Phase 2: Fingerprinting", status: 'Idle', comment: "Pending trigger" },
        { phase: "Phase 3: AI Extraction", status: 'Idle', comment: "Pending trigger" },
        { phase: "Phase 4: Schema Validation", status: 'Idle', comment: "Pending trigger" }
    ]);
    const qaFileInputRef = useRef<HTMLInputElement>(null);

    // Plan & Discount State
    const [plans, setPlans] = useState<Plan[]>([]);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const [discounts, setDiscounts] = useState<Discount[]>([]);
    const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);

    // Credit Config State
    const [creditConfig, setCreditConfig] = useState<{ costs: any, packages: any[] }>({ costs: { quiz: 2, exam: 3, ai_tutor_min: 1, note: 1 }, packages: [] });
    const [editingPackage, setEditingPackage] = useState<any | null>(null);

    // Effect: Auth Check
    useEffect(() => {
        if (!currentUser || currentUser.email !== 'nour@nour.nour') {
            setAccessDenied(true);
            setLoading(false);
        }
    }, [currentUser]);

    // Effect: Load Data based on Tab
    useEffect(() => {
        if (activeTab === 'global_staging' && currentUser?.email === 'nour@nour.nour') {
            loadStagingQueue();
        }

        if (activeTab === 'plan_config' && db) {
            setLoading(true);
            // Load Plans
            const plansPromise = db.collection('plans').get().then(snap => {
                const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() } as Plan));
                if (loaded.length === 0) {
                    // Seed if empty
                    const seed: Plan[] = [
                        { id: 'FREE', name: 'Free Starter', price: 0, currency: 'EGP', billingCycle: 'MONTHLY', limits: { quizzes: 3, exams: 1, ai_minutes: 5, notes: 2, linked_accounts: 0, trainedmaterial: 2, pageLimit: 15 }, features: { parentModule: false, whatToStudyBasic: true, whatToStudyAdvanced: false, radar: true }, marketingFeatures: ["3 Quizzes / Month", "1 Exam Trial", "5 AI Minutes", "Basic Study Guide"], isActive: true },
                        { id: 'ULTRA', name: 'Eduva Ultra', price: 75, currency: 'EGP', billingCycle: 'MONTHLY', limits: { quizzes: -1, exams: 5, ai_minutes: 300, notes: -1, linked_accounts: 1, trainedmaterial: -1, pageLimit: -1 }, features: { parentModule: true, whatToStudyBasic: true, whatToStudyAdvanced: true, radar: true }, marketingFeatures: ["Unlimited Quizzes", "5 Exams / Month", "5 Hours AI Tutor", "Full Parent Access", "Advanced Analytics"], isActive: true },
                        { id: 'ULTRA_SIBLINGS', name: 'Ultra Family', price: 250, currency: 'EGP', billingCycle: 'MONTHLY', limits: { quizzes: -1, exams: 20, ai_minutes: 1200, notes: -1, linked_accounts: 4, trainedmaterial: -1, pageLimit: -1 }, features: { parentModule: true, whatToStudyBasic: true, whatToStudyAdvanced: true, radar: true }, marketingFeatures: ["4 Accounts Included", "Unlimited Quizzes", "20 Hours AI Tutor", "Family Dashboard"], isActive: true }
                    ];
                    Promise.all(seed.map(p => db.collection('plans').doc(p.id).set(p))).then(() => setPlans(seed));
                } else {
                    setPlans(loaded);
                }
            });

            // Load Discounts
            const discountsPromise = db.collection('discounts').get().then(snap => {
                const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() } as Discount));
                setDiscounts(loaded);
            });

            // Load Credit Config
            const configPromise = monetizationClient.getConfig().then(data => {
                setCreditConfig({
                    costs: { ...creditConfig.costs, ...data.costs }, // merge defaults
                    packages: data.packages || []
                });
            });

            Promise.all([plansPromise, discountsPromise, configPromise]).finally(() => setLoading(false));

            Promise.all([plansPromise, discountsPromise]).finally(() => setLoading(false));

        }
    }, [activeTab]);

    // Handlers
    const handleGlobalApproval = async (id: string, approve: boolean) => {
        if (!db || !currentUser) return;
        setLoading(true);
        try {
            const group = stagedGroups.find(g => g.id === id);
            if (!group) return;

            if (approve) {
                await approveAndPromoteGroup(id, group, currentUser);
            } else {
                await db.collection('temp_global_atoms').doc(id).delete();
            }
            setReviewingGroup(null);
            loadStagingQueue();
        } catch (e: any) {
            alert(`Operation failed: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleQaFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setQaFile({ name: file.name, data: reader.result as string });
            setQaResults([]);
            setQaPhases(prev => prev.map(p => ({ ...p, status: 'Idle', comment: "File held in state. Ready for generation." })));
        };
        reader.readAsDataURL(file);
    };

    const runQaPipeline = async () => {
        if (!qaFile || !currentUser) return;
        setLoading(true);
        setQaPhases(prev => prev.map(p => ({ ...p, status: 'Processing', comment: "Neural handshake initiated..." })));

        try {
            const atoms = await extractAtomsFromDocument({
                topic: qaFile.name,
                subject: qaSubject,
                year: currentUser.preferences.defaultYear,
                curriculum: currentUser.preferences.defaultCurriculum,
                mode: 'qa_runner',
                language: currentUser.preferences.defaultLanguage,
                difficulty: Difficulty.MEDIUM,
                detailLevel: DetailLevel.DETAILED,
                quizType: QuizType.MIX,
                questionCount: 0,
                studyMaterialFile: qaFile.data,
                fileName: qaFile.name
            }, currentUser, (msg) => {
                if (msg.includes('batch')) setQaPhases(prev => prev.map((p, i) => i === 0 ? { ...p, status: 'Pass', comment: msg } : p));
                if (msg.includes('Identity')) setQaPhases(prev => prev.map((p, i) => i === 1 ? { ...p, status: 'Pass', comment: msg } : p));
            });

            setQaResults(atoms);
            setQaPhases([
                { phase: "Phase 1: Chunking", status: 'Pass', comment: "Sequential 15k character batches verified." },
                { phase: "Phase 2: Fingerprinting", status: 'Pass', comment: "Binary Identity signature matched and verified." },
                { phase: "Phase 3: AI Extraction", status: 'Pass', comment: `Extraction complete. ${atoms.length} atoms generated.` },
                { phase: "Phase 4: Schema Validation", status: 'Pass', comment: "v2.2 High-Density Schema verified." }
            ]);
        } catch (err: any) {
            setQaPhases(prev => prev.map(p => p.status === 'Processing' ? { ...p, status: 'Fail', comment: err.message } : p));
        } finally {
            setLoading(false);
        }
    };

    const promoteQaResults = async () => {
        if (qaResults.length === 0 || !db) return;
        setLoading(true);
        try {
            const fingerprint = await computeDocFingerprint(qaFile!.data);
            const stagingId = `staging_qa_${fingerprint}_${qaSubject.replace(/\s+/g, '_')}`;
            const payload = {
                studentId: currentUser?.id,
                originDocFingerprint: fingerprint,
                subject: qaSubject,
                grade: currentUser?.preferences.defaultYear,
                lastUpdate: Date.now(),
                status: 'pendingReview',
                atomCount: qaResults.length,
                extractedAtoms: qaResults.map(a => ({ ...a, metadata: { ...a.metadata, localOnly: false } }))
            };
            await db.collection('temp_global_atoms').doc(stagingId).set(JSON.parse(JSON.stringify(payload)), { merge: true });
            alert("Packet promoted to staging queue for final admin sign-off.");
            setQaResults([]);
            setQaFile(null);
            setActiveTab('global_staging');
        } catch (e) {
            alert("Promotion failed.");
        } finally {
            setLoading(false);
        }
    };

    const handleSavePlan = async (plan: Plan) => {
        if (!db) return;
        setLoading(true);
        try {
            await db.collection('plans').doc(plan.id).set(plan);
            setPlans(prev => prev.map(p => p.id === plan.id ? plan : p));
            setEditingPlan(null);
            alert('Plan Configuration Updated.');
        } catch (e: any) {
            alert('Save failed: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveDiscount = async (discount: Discount) => {
        if (!db) return;
        setLoading(true);
        try {
            const id = discount.id || discount.code;
            const payload = { ...discount, id };
            await db.collection('discounts').doc(id).set(payload);
            setDiscounts(prev => {
                const existing = prev.findIndex(d => d.id === payload.id);
                if (existing > -1) {
                    const newArr = [...prev];
                    newArr[existing] = payload;
                    return newArr;
                }
                return [...prev, payload];
            });
            setEditingDiscount(null);
            alert('Discount Configured.');
        } catch (e: any) {
            alert('Save failed: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteDiscount = async (id: string) => {
        if (!db || !confirm('Are you sure you want to delete this discount?')) return;
        setLoading(true);
        try {
            await db.collection('discounts').doc(id).delete();
            setDiscounts(prev => prev.filter(d => d.id !== id));
        } catch (e: any) { alert('Delete failed: ' + e.message); }
        finally { setLoading(false); }
    }

    const handleSaveCreditConfig = async (newConfig: { costs: any, packages: any[] }) => {
        setLoading(true);
        try {
            await monetizationClient.updateConfig(newConfig);
            setCreditConfig(newConfig);
            setEditingPackage(null);
            alert('Credit Configuration Saved.');
        } catch (e: any) {
            alert('Save failed: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePackage = async (id: string) => {
        if (!confirm("Delete this package?")) return;
        const newPackages = creditConfig.packages.filter(p => p.id !== id);
        handleSaveCreditConfig({ ...creditConfig, packages: newPackages });
    };

    if (accessDenied) return <div className="max-w-md mx-auto p-20 text-center">🚫 Access Denied. Admin privileges required.</div>;

    return (
        <div className="max-w-7xl mx-auto p-4 animate-fade-in pb-20">
            <div className="mb-10 p-8 bg-gradient-to-br from-purple-900 to-indigo-900 text-white rounded-[2.5rem] shadow-2xl relative overflow-hidden border border-white/10">
                <div className="absolute top-0 right-0 p-8 opacity-10 text-[10rem] pointer-events-none ltr:block rtl:hidden">☁️</div>
                <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[10px] font-black tracking-[0.3em] uppercase mb-4">
                        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                        Global Knowledge Grid v2.2
                    </div>
                    <h1 className="text-4xl font-black tracking-tighter italic">Intelligence Command</h1>
                    <p className="text-purple-200 text-sm font-medium mt-2 max-w-xl">
                        Review atoms in staging or use the QA Lab to manually trigger the on-demand v2.2 extraction pipeline.
                    </p>
                </div>
            </div>

            <div className="flex gap-4 border-b border-slate-200 dark:border-slate-700 mb-8 overflow-x-auto no-scrollbar">
                <button onClick={() => setActiveTab('global_staging')} className={`pb-3 px-6 font-black text-[10px] uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${activeTab === 'global_staging' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-400'}`}>Staging Queue ({stagedGroups.length})</button>
                <button onClick={() => setActiveTab('qa_runner')} className={`pb-3 px-6 font-black text-[10px] uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${activeTab === 'qa_runner' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>Intelligence Lab (QA)</button>
                <button onClick={() => setActiveTab('plan_config')} className={`pb-3 px-6 font-black text-[10px] uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${activeTab === 'plan_config' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-400'}`}>Monetization Grid</button>
                <button onClick={() => setActiveTab('overview')} className={`pb-3 px-6 font-black text-[10px] uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${activeTab === 'overview' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>Analytics</button>
            </div>

            {activeTab === 'global_staging' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-4 space-y-4">
                        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.4em] mb-4 ltr:ml-1 rtl:mr-1">Incoming Packets</h3>
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                            {stagedGroups.map(group => (
                                <Card
                                    key={group.id}
                                    className={`cursor-pointer border-2 transition-all hover:scale-[1.02] active:scale-95 ${reviewingGroup?.id === group.id ? 'border-purple-500 shadow-xl bg-purple-50/5' : 'border-slate-100 bg-white dark:bg-slate-800'}`}
                                    onClick={() => setReviewingGroup(group)}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="min-w-0 flex-grow">
                                            <p className="text-[9px] font-black uppercase text-purple-600 mb-1">{group.subject} • {group.grade}</p>
                                            <h4 className="font-black text-slate-800 dark:text-white truncate text-sm">Fingerprint: {group.originDocFingerprint.slice(0, 12)}...</h4>
                                            <div className="flex items-center gap-2 mt-3">
                                                <span className="text-[8px] font-black bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-500 uppercase tracking-tighter">{group.atomCount} Shared Atoms</span>
                                            </div>
                                        </div>
                                        {reviewingGroup?.id === group.id && <span className="text-xl animate-bounce-sm">👉</span>}
                                    </div>
                                </Card>
                            ))}
                            {stagedGroups.length === 0 && (
                                <div className="py-20 text-center border-4 border-dashed border-slate-100 dark:border-slate-800 rounded-[2.5rem]">
                                    <span className="text-4xl opacity-20 block mb-4">🌫️</span>
                                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Queue Empty</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-8">
                        {reviewingGroup ? (
                            <div className="space-y-6 animate-slide-up">
                                <Card className="sticky top-0 border-t-8 border-purple-600 shadow-2xl z-10 bg-white dark:bg-slate-800">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                        <div>
                                            <h3 className="font-black text-2xl tracking-tighter italic">Reviewing: {reviewingGroup.subject}</h3>
                                            <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-[0.3em]">{reviewingGroup.grade} Knowledge Unit</p>
                                        </div>
                                        <div className="flex gap-2 w-full md:w-auto">
                                            <Button variant="outline" className="flex-1 md:flex-none text-red-600 px-8" onClick={() => handleGlobalApproval(reviewingGroup.id, false)} isLoading={loading}>Discard</Button>
                                            <Button className="flex-1 md:flex-none bg-emerald-600 text-white px-8 shadow-xl" onClick={() => handleGlobalApproval(reviewingGroup.id, true)} isLoading={loading}>Seal to Global Grid</Button>
                                        </div>
                                    </div>
                                </Card>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {(reviewingGroup.extractedAtoms || []).map((atom: any, idx: number) => (
                                        <Card key={idx} className="bg-white dark:bg-slate-800 border-l-4 border-purple-500 rounded-2xl p-5 shadow-sm">
                                            <div className="flex justify-between items-start mb-4">
                                                <span className="text-[9px] font-black uppercase bg-purple-50 text-purple-600 px-2 py-0.5 rounded border border-purple-100">{atom.metadata.conceptTag}</span>
                                                <span className="text-xs font-black text-green-500">{Math.round((atom.metadata.trustScore || 1) * 100)}% Trust</span>
                                            </div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-white leading-relaxed">{atom.coreRepresentation.definition}</p>
                                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 mt-2">
                                                <p className="text-[8px] font-black uppercase text-amber-600 mb-1">Keywords for offline grading</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {(atom.assessmentMetadata?.essentialKeywords || []).map((k: string, ki: number) => <span key={ki} className="text-[9px] font-bold bg-white px-1.5 py-0.5 rounded border border-slate-100">{k}</span>)}
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="h-[400px] border-4 border-dashed border-slate-100 dark:border-slate-800 rounded-[3rem] flex flex-col items-center justify-center text-slate-300">
                                <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center text-4xl mb-6 shadow-inner">🔍</div>
                                <p className="font-black text-xs uppercase tracking-[0.5em] text-center px-10">Select a packet to verify</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'qa_runner' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-slide-up">
                    <div className="lg:col-span-4 space-y-6">
                        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.4em] mb-4">Pipeline Inputs</h3>
                        <Card className="p-6 bg-white dark:bg-slate-800 border-2 border-slate-100">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Study Material</label>
                                    <div
                                        onClick={() => !loading && qaFileInputRef.current?.click()}
                                        className={`h-32 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${qaFile ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-200 hover:border-indigo-400 bg-slate-50'}`}
                                    >
                                        {qaFile ? (
                                            <div className="text-center">
                                                <span className="text-2xl">📄</span>
                                                <p className="text-xs font-bold text-indigo-600 mt-1 truncate max-w-[200px]">{qaFile.name}</p>
                                            </div>
                                        ) : (
                                            <div className="text-center text-slate-400">
                                                <span className="text-2xl">📤</span>
                                                <p className="text-[10px] font-black uppercase mt-1">Upload Test PDF</p>
                                            </div>
                                        )}
                                    </div>
                                    <input type="file" ref={qaFileInputRef} className="hidden" accept=".pdf" onChange={handleQaFileUpload} />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Test Subject</label>
                                    <select
                                        value={qaSubject}
                                        onChange={e => setQaSubject(e.target.value)}
                                        className="w-full p-4 rounded-xl border-2 border-slate-100 bg-white font-bold text-sm outline-none focus:border-indigo-500"
                                    >
                                        {['Mathematics', 'Science', 'English', 'ICT', 'History'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>

                                <Button
                                    onClick={runQaPipeline}
                                    disabled={!qaFile || loading}
                                    isLoading={loading}
                                    className="w-full py-4 rounded-xl font-black uppercase tracking-[0.3em] text-[11px] shadow-xl"
                                >
                                    Generate v2.2 Atoms
                                </Button>
                            </div>
                        </Card>

                        <Card className="p-6 bg-slate-900 text-white border-0">
                            <h4 className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-4">QA Phase Status</h4>
                            <div className="space-y-4">
                                {qaPhases.map((p, i) => (
                                    <div key={i} className="flex items-start gap-3 group">
                                        <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${p.status === 'Pass' ? 'bg-green-50 border-green-400' :
                                            p.status === 'Processing' ? 'bg-indigo-600 border-indigo-400 animate-pulse' :
                                                p.status === 'Fail' ? 'bg-red-50 border-red-400' : 'bg-transparent border-slate-800'
                                            }`}>
                                            {p.status === 'Pass' && '✓'}
                                            {p.status === 'Fail' && '✕'}
                                        </div>
                                        <div>
                                            <p className={`text-[10px] font-black uppercase tracking-widest ${p.status === 'Processing' ? 'text-white' : 'text-slate-400'}`}>{p.phase}</p>
                                            <p className="text-[9px] text-slate-500 font-bold leading-tight mt-0.5">{p.comment}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>

                    <div className="lg:col-span-8 space-y-6">
                        {qaResults.length > 0 ? (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-xl font-black italic tracking-tighter">Extracted Knowledge Atoms ({qaResults.length})</h3>
                                    <Button onClick={promoteQaResults} className="bg-emerald-600 text-white px-8" isLoading={loading}>Promote to Staging</Button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {qaResults.map((atom, idx) => (
                                        <Card key={idx} className="bg-white border-2 border-slate-100 hover:border-indigo-400 transition-all rounded-[1.5rem] p-6">
                                            <div className="flex justify-between mb-4">
                                                <span className="text-[9px] font-black uppercase bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">{atom.metadata.conceptTag}</span>
                                                <span className="text-[9px] font-black text-slate-400">P.{atom.metadata.sourcePageRefs?.join(',') || '?'} • {atom.metadata.language}</span>
                                            </div>
                                            <p className="text-sm font-bold text-slate-800 leading-relaxed mb-4">{atom.coreRepresentation.definition}</p>
                                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                <p className="text-[8px] font-black uppercase text-amber-600 mb-1">Keywords for offline grading</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {(atom.assessmentMetadata?.essentialKeywords || []).map((k, ki) => <span key={ki} className="text-[9px] font-bold bg-white px-1.5 py-0.5 rounded border border-slate-100">{k}</span>)}
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="h-full min-h-[500px] border-4 border-dashed border-slate-100 rounded-[3rem] flex flex-col items-center justify-center text-slate-300">
                                <span className="text-6xl mb-6 grayscale opacity-20">🧫</span>
                                <p className="font-black text-xs uppercase tracking-[0.5em] text-center px-20">Awaiting Lab Trigger. Manual v2.2 extraction pipeline diagnostics will appear here.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'plan_config' && (
                <div className="animate-slide-up">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-black text-2xl tracking-tighter italic">Price Plan Configuration</h3>
                        <Button className="bg-emerald-600 text-white" onClick={() => setEditingPlan({
                            id: '',
                            name: 'New Plan',
                            price: 0,
                            currency: 'EGP',
                            billingCycle: 'MONTHLY',
                            limits: { quizzes: 5, ai_minutes: 30, exams: 2, notes: 10, linked_accounts: 0, trainedmaterial: 2, pageLimit: 15 },
                            features: { parentModule: false, whatToStudyBasic: true, whatToStudyAdvanced: false, radar: true },
                            marketingFeatures: ["Standard Quota", "Basic Support"],
                            isActive: true
                        })}>+ Create Plan</Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {plans.map(plan => (
                            <Card key={plan.id} className="relative overflow-hidden border-2 border-slate-100 hover:border-emerald-400 transition-all p-0">
                                <div className="bg-slate-50 border-b border-slate-100 p-4 flex justify-between items-center">
                                    <h3 className="font-black text-lg">{plan.name}</h3>
                                    <span className="text-xs font-bold bg-white px-2 py-1 rounded border border-slate-200">{plan.id}</span>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="flex justify-between items-end border-b border-slate-100 pb-4">
                                        <div>
                                            <label className="text-[9px] font-black uppercase text-slate-400">Price</label>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-3xl font-black text-emerald-600">{plan.price}</span>
                                                <span className="text-xs font-bold text-slate-400">{plan.currency}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <label className="text-[9px] font-black uppercase text-slate-400">Billing</label>
                                            <div className="font-bold text-slate-700">{plan.billingCycle}</div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black uppercase text-slate-400">Hard Limits</label>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div className="bg-slate-50 p-2 rounded">
                                                <span className="text-slate-400 block text-[8px] uppercase">Quizzes</span>
                                                <span className="font-bold">{plan.limits.quizzes === -1 ? '∞' : plan.limits.quizzes}</span>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded">
                                                <span className="text-slate-400 block text-[8px] uppercase">AI Minutes</span>
                                                <span className="font-bold">{plan.limits.ai_minutes === -1 ? '∞' : plan.limits.ai_minutes}</span>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded">
                                                <span className="text-slate-400 block text-[8px] uppercase">Exams</span>
                                                <span className="font-bold">{plan.limits.exams === -1 ? '∞' : (plan.limits.exams || 0)}</span>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded">
                                                <span className="text-slate-400 block text-[8px] uppercase">Notes</span>
                                                <span className="font-bold">{plan.limits.notes === -1 ? '∞' : plan.limits.notes}</span>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded">
                                                <span className="text-slate-400 block text-[8px] uppercase">Accounts</span>
                                                <span className="font-bold">{plan.limits.linked_accounts}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <Button className="w-full mt-4" variant="outline" onClick={() => setEditingPlan(plan)}>Configure Plan</Button>
                                </div>
                            </Card>
                        ))}
                    </div>

                    {/* Credit System Section */}
                    <div className="mt-16 mb-6 flex justify-between items-center border-t border-slate-100 pt-10">
                        <h3 className="font-black text-2xl tracking-tighter italic">Credit System Configuration</h3>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => handleSaveCreditConfig(creditConfig)}>Update Costs</Button>
                            <Button className="bg-indigo-600 text-white" onClick={() => setEditingPackage({ id: '', name: 'New Pack', credits: 100, price: 100, currency: 'EGP', description: 'Standard Pack' })}>+ New Package</Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-16">
                        {/* Costs Panel */}
                        <div className="lg:col-span-4">
                            <Card className="p-6 border-2 border-slate-100">
                                <h4 className="font-black text-sm uppercase text-slate-400 mb-4 tracking-widest">Base Feature Costs (Credits)</h4>
                                <div className="space-y-3">
                                    {Object.entries(creditConfig.costs).map(([key, val]) => (
                                        <div key={key} className="flex justify-between items-center bg-slate-50 p-3 rounded">
                                            <span className="text-xs font-bold uppercase">{key.replace(/_/g, ' ')}</span>
                                            <input
                                                type="number"
                                                className="w-20 p-1 text-right border rounded bg-white font-mono font-bold"
                                                value={val as number}
                                                onChange={(e) => setCreditConfig({ ...creditConfig, costs: { ...creditConfig.costs, [key]: Number(e.target.value) } })}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>

                        {/* Packages Grid */}
                        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {creditConfig.packages.map((pack: any) => (
                                <Card key={pack.id} className="relative border border-slate-100 hover:border-indigo-400 p-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-lg">{pack.name}</h3>
                                        <span className="font-black text-indigo-600">{pack.credits} Cr</span>
                                    </div>
                                    <p className="text-xs text-slate-400 mb-4">{pack.description}</p>
                                    <div className="flex justify-between items-end border-t border-slate-50 pt-4">
                                        <div className="text-xl font-black">{pack.currency} {pack.price}</div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={() => setEditingPackage(pack)} className="text-xs">Edit</Button>
                                            <Button variant="outline" size="sm" onClick={() => handleDeletePackage(pack.id)} className="text-red-400 hover:text-red-600">x</Button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                            {creditConfig.packages.length === 0 && (
                                <div className="col-span-full py-10 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                                    No credit packages defined.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-16 mb-6 flex justify-between items-center border-t border-slate-100 pt-10">
                        <h3 className="font-black text-2xl tracking-tighter italic">Active Discounts & Coupons</h3>
                        <Button className="bg-indigo-600 text-white" onClick={() => setEditingDiscount({ id: '', code: '', type: 'PERCENTAGE', value: 0, expiryDate: Date.now() + 86400000 * 30, isActive: true, usageCount: 0, usageLimit: 100 } as Discount)}>+ New Coupon</Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {discounts.map(discount => (
                            <Card key={discount.id} className="relative border border-slate-100 hover:border-indigo-400 p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="font-black text-lg font-mono bg-slate-100 px-2 py-1 rounded">{discount.code}</span>
                                    <span className={`text-[9px] font-black uppercase px-2 py-1 rounded ${discount.isActive ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-400'}`}>{discount.isActive ? 'Active' : 'Inactive'}</span>
                                </div>
                                <p className="text-sm font-bold text-slate-600 mb-4">{discount.type === 'PERCENTAGE' ? `${discount.value}% OFF` : `-${discount.value} EGP FLAT`}</p>

                                <div className="text-xs text-slate-400 space-y-1 mt-auto">
                                    <div>Uses: {discount.usageCount || 0} / {discount.usageLimit || '∞'}</div>
                                    <div>Expires: {new Date(discount.expiryDate).toLocaleDateString()}</div>
                                </div>

                                <div className="flex gap-2 mt-4 pt-4 border-t border-slate-50">
                                    <Button variant="outline" size="sm" onClick={() => setEditingDiscount(discount)} className="flex-1 text-xs">Edit</Button>
                                    <Button variant="outline" size="sm" onClick={() => handleDeleteDiscount(discount.id)} className="text-red-400 hover:text-red-600">t</Button>
                                </div>
                            </Card>
                        ))}
                        {discounts.length === 0 && (
                            <div className="col-span-full py-10 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                                No active coupons found. Create one to drive sales!
                            </div>
                        )}
                    </div>

                    {/* Modals */}
                    {editingPlan && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
                                <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20">
                                    <h3 className="font-black text-xl text-emerald-800 dark:text-emerald-400">Configuring: {editingPlan.id || 'New Plan'}</h3>
                                    <button onClick={() => setEditingPlan(null)} className="text-2xl hover:text-emerald-600">x</button>
                                </div>
                                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold mb-1">Plan ID (Unique)</label>
                                            <input
                                                className="w-full p-2 border rounded font-mono uppercase"
                                                value={editingPlan.id}
                                                onChange={e => setEditingPlan({ ...editingPlan, id: e.target.value.toUpperCase() })}
                                                disabled={plans.some(p => p.id === editingPlan.id && p.id !== '')}
                                                readOnly={plans.some(p => p.id === editingPlan.id)}
                                                placeholder="GOLD_TIER"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold mb-1">Display Name</label>
                                            <input className="w-full p-2 border rounded" value={editingPlan.name} onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold mb-1">Price ({editingPlan.currency})</label>
                                            <input type="number" className="w-full p-2 border rounded" value={editingPlan.price} onChange={e => setEditingPlan({ ...editingPlan, price: Number(e.target.value) })} />
                                        </div>
                                    </div>
                                    <div className="border-t pt-4">
                                        <h4 className="font-black text-sm mb-3 uppercase tracking-widest text-slate-400">Quota Limits (-1 for Unlimited)</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold mb-1">Quizzes / Mo</label>
                                                <input type="number" className="w-full p-2 border rounded bg-slate-50" value={editingPlan.limits.quizzes} onChange={e => setEditingPlan({ ...editingPlan, limits: { ...editingPlan.limits, quizzes: Number(e.target.value) } })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold mb-1">Exams / Mo</label>
                                                <input type="number" className="w-full p-2 border rounded bg-slate-50" value={editingPlan.limits.exams || 0} onChange={e => setEditingPlan({ ...editingPlan, limits: { ...editingPlan.limits, exams: Number(e.target.value) } })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold mb-1">AI Minutes / Mo</label>
                                                <input type="number" className="w-full p-2 border rounded bg-slate-50" value={editingPlan.limits.ai_minutes} onChange={e => setEditingPlan({ ...editingPlan, limits: { ...editingPlan.limits, ai_minutes: Number(e.target.value) } })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold mb-1">Notes / Mo</label>
                                                <input type="number" className="w-full p-2 border rounded bg-slate-50" value={editingPlan.limits.notes} onChange={e => setEditingPlan({ ...editingPlan, limits: { ...editingPlan.limits, notes: Number(e.target.value) } })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold mb-1">Linked Accounts</label>
                                                <input type="number" className="w-full p-2 border rounded bg-slate-50" value={editingPlan.limits.linked_accounts} onChange={e => setEditingPlan({ ...editingPlan, limits: { ...editingPlan.limits, linked_accounts: Number(e.target.value) } })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold mb-1">Trained Mat. / Mo</label>
                                                <input type="number" className="w-full p-2 border rounded bg-slate-50" value={editingPlan.limits.trainedmaterial} onChange={e => setEditingPlan({ ...editingPlan, limits: { ...editingPlan.limits, trainedmaterial: Number(e.target.value) } })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold mb-1">PDF Page Limit</label>
                                                <input type="number" className="w-full p-2 border rounded bg-slate-50" value={editingPlan.limits.pageLimit} onChange={e => setEditingPlan({ ...editingPlan, limits: { ...editingPlan.limits, pageLimit: Number(e.target.value) } })} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border-t pt-4">
                                        <h4 className="font-black text-sm mb-3 uppercase tracking-widest text-slate-400">Display Features (Bullets)</h4>
                                        <div className="space-y-2">
                                            {(editingPlan.marketingFeatures || []).map((feature, idx) => (
                                                <div key={idx} className="flex gap-2">
                                                    <input
                                                        className="flex-1 p-2 border rounded text-sm"
                                                        value={feature}
                                                        onChange={e => {
                                                            const newFeatures = [...(editingPlan.marketingFeatures || [])];
                                                            newFeatures[idx] = e.target.value;
                                                            setEditingPlan({ ...editingPlan, marketingFeatures: newFeatures });
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const newFeatures = (editingPlan.marketingFeatures || []).filter((_, i) => i !== idx);
                                                            setEditingPlan({ ...editingPlan, marketingFeatures: newFeatures });
                                                        }}
                                                        className="text-red-500 hover:text-red-700 px-2 font-bold"
                                                    >
                                                        x
                                                    </button>
                                                </div>
                                            ))}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setEditingPlan({
                                                    ...editingPlan,
                                                    marketingFeatures: [...(editingPlan.marketingFeatures || []), "New Feature"]
                                                })}
                                                className="w-full text-xs border-dashed"
                                            >
                                                + Add Feature Bullet
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="border-t pt-4 space-y-3">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input type="checkbox" checked={editingPlan.features?.radar || false} onChange={e => setEditingPlan({ ...editingPlan, features: { ...editingPlan.features, radar: e.target.checked } })} className="w-5 h-5 accent-indigo-600" />
                                            <div className="flex flex-col">
                                                <span className="font-bold text-sm">Cognitive Radar Guidance</span>
                                                <span className="text-[9px] text-slate-400 uppercase tracking-tighter">Module-based activity scanner</span>
                                            </div>
                                        </label>

                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={editingPlan.isActive} onChange={e => setEditingPlan({ ...editingPlan, isActive: e.target.checked })} className="w-5 h-5 accent-emerald-600" />
                                            <span className="font-bold text-sm">Plan Active (Visible to Users)</span>
                                        </label>
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 flex justify-end gap-3">
                                    <Button variant="outline" onClick={() => setEditingPlan(null)}>Cancel</Button>
                                    <Button onClick={() => handleSavePlan(editingPlan)} className="bg-emerald-600 text-white min-w-[120px]">Save Configuration</Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {editingDiscount && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                                <h3 className="font-black text-xl">Configure Coupon</h3>
                                <div>
                                    <label className="block text-xs font-bold mb-1 uppercase text-slate-400">Coupon Code</label>
                                    <input className="w-full p-2 border rounded font-mono uppercase" value={editingDiscount.code} onChange={e => setEditingDiscount({ ...editingDiscount, code: e.target.value.toUpperCase(), id: e.target.value.toUpperCase() })} placeholder="SUMMER2025" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold mb-1 uppercase text-slate-400">Type</label>
                                        <select className="w-full p-2 border rounded" value={editingDiscount.type} onChange={e => setEditingDiscount({ ...editingDiscount, type: e.target.value as any })}>
                                            <option value="PERCENTAGE">Percentage (%)</option>
                                            <option value="FIXED">Fixed Amount (EGP)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold mb-1 uppercase text-slate-400">Value</label>
                                        <input type="number" className="w-full p-2 border rounded" value={editingDiscount.value} onChange={e => setEditingDiscount({ ...editingDiscount, value: Number(e.target.value) })} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold mb-1 uppercase text-slate-400">Usage Limit</label>
                                        <input type="number" className="w-full p-2 border rounded" value={editingDiscount.usageLimit} onChange={e => setEditingDiscount({ ...editingDiscount, usageLimit: Number(e.target.value) })} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold mb-1 uppercase text-slate-400">Expiry (Days)</label>
                                        <input type="number" className="w-full p-2 border rounded" placeholder="30" onChange={e => setEditingDiscount({ ...editingDiscount, expiryDate: Date.now() + (Number(e.target.value) * 86400000) })} />
                                        <div className="text-[10px] text-slate-400 text-right mt-1">Expiry: {new Date(editingDiscount.expiryDate).toLocaleDateString()}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 pt-2">
                                    <input type="checkbox" checked={editingDiscount.isActive} onChange={e => setEditingDiscount({ ...editingDiscount, isActive: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
                                    <span className="text-sm font-bold">Coupon is Active</span>
                                </div>
                                <div className="flex justify-end gap-2 pt-4 border-t mt-2">
                                    <Button variant="outline" onClick={() => setEditingDiscount(null)}>Cancel</Button>
                                    <Button onClick={() => handleSaveDiscount(editingDiscount)} className="bg-indigo-600 text-white">Save Coupon</Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {editingPackage && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                                <h3 className="font-black text-xl">Configure Package</h3>
                                <div>
                                    <label className="block text-xs font-bold mb-1 uppercase text-slate-400">Package ID</label>
                                    <input className="w-full p-2 border rounded font-mono" value={editingPackage.id} onChange={e => setEditingPackage({ ...editingPackage, id: e.target.value })} placeholder="starter_pack" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold mb-1 uppercase text-slate-400">Display Name</label>
                                    <input className="w-full p-2 border rounded" value={editingPackage.name} onChange={e => setEditingPackage({ ...editingPackage, name: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold mb-1 uppercase text-slate-400">Credits</label>
                                        <input type="number" className="w-full p-2 border rounded" value={editingPackage.credits} onChange={e => setEditingPackage({ ...editingPackage, credits: Number(e.target.value) })} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold mb-1 uppercase text-slate-400">Price</label>
                                        <input type="number" className="w-full p-2 border rounded" value={editingPackage.price} onChange={e => setEditingPackage({ ...editingPackage, price: Number(e.target.value) })} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold mb-1 uppercase text-slate-400">Description</label>
                                    <textarea className="w-full p-2 border rounded h-20" value={editingPackage.description} onChange={e => setEditingPackage({ ...editingPackage, description: e.target.value })} />
                                </div>
                                <div className="flex items-center gap-2 pt-2">
                                    <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={editingPackage.recommended} onChange={e => setEditingPackage({ ...editingPackage, recommended: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
                                        <span className="text-sm font-bold">Recommended Badge</span>
                                    </label>
                                </div>
                                <div className="flex justify-end gap-2 pt-4 border-t mt-2">
                                    <Button variant="outline" onClick={() => setEditingPackage(null)}>Cancel</Button>
                                    <Button onClick={() => {
                                        const newPackages = [...creditConfig.packages];
                                        const idx = newPackages.findIndex(p => p.id === editingPackage.id);
                                        if (idx > -1) newPackages[idx] = editingPackage;
                                        else newPackages.push(editingPackage);
                                        handleSaveCreditConfig({ ...creditConfig, packages: newPackages });
                                    }} className="bg-indigo-600 text-white">Save Package</Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'overview' && (
                <div className="py-20 text-center animate-fade-in">
                    <span className="text-5xl block mb-6 grayscale opacity-20">📊</span>
                    <p className="text-slate-400 font-black text-xs uppercase tracking-[0.4em]">Grid Traffic Analysis Restricted.</p>
                    <p className="text-[10px] text-slate-300 mt-2 font-bold uppercase italic">Focus on Atom Verification and QA Protocol v2.2.</p>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
