
import React, { useState, useEffect, useRef } from 'react';
import {
    AppView, UserProfile, GenerationRequest,
    EducationSystem, Language, Difficulty, QuizType, DetailLevel, UserRole, StudyNoteData, AtomCore, QuestionResult, LibraryItem, QuizData, ExamData, HomeworkData, CheatSheetData, BillingEvent
} from './types';
import AuthScreen from './components/AuthScreen';
import Layout from './components/Layout';
import LoadingOverlay from './components/LoadingOverlay';
import WelcomeModal from './components/WelcomeModal';
import Card from './components/ui/Card';
import Button from './components/ui/Button';
import AlertModal from './components/ui/AlertModal';
import LoadingSpinner from './components/ui/LoadingSpinner';
import { ExtractionProgressModal } from './components/ExtractionProgressModal';

// --- LAZY LOADED VIEWS (Code Splitting) ---
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const CheatSheetView = React.lazy(() => import('./components/CheatSheetView'));
const QuizArena = React.lazy(() => import('./components/QuizArena'));
const DebriefView = React.lazy(() => import('./components/DebriefView'));
const NoteDisplay = React.lazy(() => import('./components/NoteDisplay'));
const QuizDisplay = React.lazy(() => import('./components/QuizDisplay'));
const ExamDisplay = React.lazy(() => import('./components/ExamDisplay'));
const ProfileScreen = React.lazy(() => import('./components/ProfileScreen'));
const SettingsScreen = React.lazy(() => import('./components/SettingsScreen'));
const ParentDashboard = React.lazy(() => import('./components/ParentDashboard'));
const LibraryDashboard = React.lazy(() => import('./components/LibraryDashboard'));
const StudyNotesAssembler = React.lazy(() => import('./components/StudyNotesAssembler'));
const AdaptiveQuizModuleV2 = React.lazy(() => import('./components/v2/AdaptiveQuizModuleV2'));
const ClassroomDashboard = React.lazy(() => import('./components/ClassroomDashboard'));
const GamificationScreen = React.lazy(() => import('./components/GamificationScreen'));
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'));
const AppShell = React.lazy(() => import('./components/dashboard/AppShell'));
const GrowthMirrorScreen = React.lazy(() => import('./components/GrowthMirror/GrowthMirrorScreen').then(module => ({ default: module.GrowthMirrorScreen })));
const StudentHistoryScreen = React.lazy(() => import('./components/StudentHistory/StudentHistoryScreen').then(module => ({ default: module.StudentHistoryScreen })));
const StudentDashboard = React.lazy(() => import('./components/StudentDashboard'));
const CheatSheetDisplay = React.lazy(() => import('./components/CheatSheetDisplay'));
const ContactUs = React.lazy(() => import('./components/ContactUs'));

// Monetization
const PricingTable = React.lazy(() => import('./components/monetization/PricingTable').then(module => ({ default: module.PricingTable })));
const BillingHistory = React.lazy(() => import('./components/monetization/BillingHistory').then(module => ({ default: module.BillingHistory })));
const InvoiceModal = React.lazy(() => import('./components/monetization/InvoiceModal').then(module => ({ default: module.InvoiceModal })));
const SubscriptionDashboard = React.lazy(() => import('./components/monetization/SubscriptionDashboard').then(module => ({ default: module.SubscriptionDashboard })));
const MockCheckout = React.lazy(() => import('./components/monetization/MockCheckout').then(module => ({ default: module.MockCheckout })));
import {
    generateQuiz,
    generateExamPaper
} from './services/geminiService';
import { assembleStudyNotes } from './services/ai/notesAssemblerService';
import { generateCheatSheet } from './services/ai/cheatSheetService';
import { auth, db } from './services/firebaseConfig';
import { syncUserProfile, updateFullUserProfile, cacheUserProfile } from './services/authService';
import { getLocalAtoms, updateMasteryBatch, getHistory } from './services/storageService';
import { registerModule, getModules } from './core/modules/registry';
import { AiPrivateTutorModule } from './components/ai-private-tutor/module';
import { QuotaGuard } from './components/monetization/QuotaGuard';
import { monetizationClient } from './services/monetization/client';
import { JourneySyncService } from './services/journey/journeySyncService';

// Register Modules
registerModule(AiPrivateTutorModule);

// 🔒 Stabilized Loader Component to prevent unmounts/hook errors
const PrivateTutorLoader = React.memo(({ user }: { user: UserProfile | null }) => {
    // Memoize module lookup to ensure stable reference
    const module = React.useMemo(() => getModules().find(m => m.id === 'ai-private-tutor'), []);
    const ModuleComponent = module?.routes[0]?.component;

    // Memoize the rendered component to prevent unmounts/remounts
    return React.useMemo(() => (
        <React.Suspense fallback={<LoadingSpinner message="Loading My Private Teacher..." />}>
            <QuotaGuard capability="ai_minutes" key="tutor-guard">
                {ModuleComponent ? <ModuleComponent user={user} /> : <div>Module Not Found</div>}
            </QuotaGuard>
        </React.Suspense>
    ), [ModuleComponent, user]);
});

const App: React.FC = () => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [selectedInvoice, setSelectedInvoice] = useState<BillingEvent | null>(null);
    const [view, setView] = useState<AppView>(AppView.LIVING_DASHBOARD);

    // Debug Wrapper for View Navigation
    const handleSetView = (newView: AppView) => {
        console.log(`[App] Navigation requested to: ${newView}`);
        setView(newView);
    };

    const [isAuthResolving, setIsAuthResolving] = useState(true); // New state to prevent ghost login

    const [appLanguage, setAppLanguage] = useState<Language>(() => {
        const saved = localStorage.getItem('app_language');
        return (saved === 'ar' || saved === 'en') ? saved as Language : Language.ENGLISH;
    });

    // Persist Language
    useEffect(() => {
        localStorage.setItem('app_language', appLanguage);
    }, [appLanguage]);

    const [isProcessing, setIsProcessing] = useState(false);
    const [activeMission, setActiveMission] = useState<any>(null);
    const [activeAtom, setActiveAtom] = useState<AtomCore | null>(null);
    const [arenaQuestions, setArenaQuestions] = useState<any[]>([]);
    const [lastArenaResults, setLastArenaResults] = useState<QuestionResult[]>([]);
    const [historyItems, setHistoryItems] = useState<any[]>([]);

    const [activeNoteData, setActiveNoteData] = useState<StudyNoteData | null>(null);
    const [activeCheatSheetData, setActiveCheatSheetData] = useState<CheatSheetData | null>(null);
    const [activeQuizData, setActiveQuizData] = useState<QuizData | null>(null);
    const [activeExamData, setActiveExamData] = useState<ExamData | null>(null);

    const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);

    const [activeGenerationRequest, setActiveGenerationRequest] = useState<GenerationRequest | null>(null);

    const [sourceView, setSourceView] = useState<AppView>(AppView.HOME);
    const [assemblerParams, setAssemblerParams] = useState({
        selectedSubject: '', selectedDocIds: [] as string[], docConfigs: {} as Record<string, any>,
        mode: 'fullNotes' as 'fullNotes' | 'cheatSheet', searchTerm: ''
    });

    const [billingSessionId, setBillingSessionId] = useState<string | null>(null);
    const [billingError, setBillingError] = useState<string | null>(null);

    const [processingStatus, setProcessingStatus] = useState('');
    const [processingLogs, setProcessingLogs] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);
    const [bootError, setBootError] = useState<string | null>(null);
    const [genError, setGenError] = useState<{ title: string; message: string } | null>(null);

    // v1.3: Global Extraction Progress Modal State
    const [activeExtractionFingerprint, setActiveExtractionFingerprint] = useState<string | null>(null);
    const [isExtractionProgressVisible, setIsExtractionProgressVisible] = useState(false);

    const handleShowExtractionProgress = (fingerprint: string) => {
        setActiveExtractionFingerprint(fingerprint);
        setIsExtractionProgressVisible(true);
    };

    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        // Load theme from localStorage or default to 'light'
        const savedTheme = localStorage.getItem('theme');
        return (savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : 'light';
    });

    // Save theme to localStorage when it changes
    useEffect(() => {
        localStorage.setItem('theme', theme);
    }, [theme]);

    const isAdminEmail = (email: string | null) => email === 'nour@nour.nour';

    const handleLaunchMockCheckout = (planId: string) => {
        setCheckoutPlanId(planId);
        setView(AppView.MOCK_CHECKOUT);
    };

    useEffect(() => {
        if (!user || user.role !== UserRole.STUDENT) return;
        const unsubscribe = db.collection('parent_nudges')
            .where('studentId', '==', user.id)
            .where('status', '==', 'SENT')
            .onSnapshot(snap => {
                if (!snap.empty) {
                    const latest = snap.docs[0].data();
                    setUser(prev => prev ? {
                        ...prev,
                        activeMission: {
                            id: snap.docs[0].id,
                            topic: latest.subject,
                            subject: latest.subject,
                            progress: 0,
                            type: latest.intent === 'FIX' ? 'REPAIR' : 'BOOST'
                        }
                    } : null);
                }
            });
        return () => unsubscribe();
    }, [user?.id, user?.role]);

    // [LOCAL BRIDGE] redirection
    // If landing on Production but we have a Local Origin param, bounce back to Local.
    // This allows testing HTTPS-only payment gateways on localhost.
    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const localOrigin = searchParams.get('localOrigin');
        if (localOrigin && window.location.origin !== localOrigin) {
            console.log("[BOOT] Local Bridge detected. Bouncing back to:", localOrigin);
            const targetUrl = new URL(window.location.href);
            targetUrl.searchParams.delete('localOrigin');
            window.location.href = `${localOrigin.replace(/\/$/, '')}${targetUrl.pathname}${targetUrl.search}`;
        }
    }, []);

    // AUTH & DATA SYNC (LAZY LOADING PATTERN)
    useEffect(() => {
        console.log("[BOOT] Auth Effect Started");
        const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
            console.log("[BOOT] Auth State Changed:", firebaseUser ? `User ${firebaseUser.uid}` : "No User");

            if (firebaseUser) {
                // 0. URL INTERCEPTION (Billing Success/Failure)
                const searchParams = new URLSearchParams(window.location.search);
                const sessionId = searchParams.get('session_id'); // Stripe / Internal
                const paymobSuccess = searchParams.get('success'); // Paymob 'true'/'false'
                const paymobId = searchParams.get('id'); // Paymob Trans ID
                const kashierStatus = searchParams.get('paymentStatus'); // Kashier status
                const kashierId = searchParams.get('transactionId'); // Kashier Trans ID

                if (sessionId) {
                    console.log("[BOOT] Detected Billing Session (Internal/Stripe):", sessionId);
                    setBillingSessionId(sessionId);
                    window.history.replaceState({}, '', window.location.pathname);
                } else if (paymobSuccess === 'true' && paymobId) {
                    console.log("[BOOT] Detected Billing Success (Paymob):", paymobId);

                    // FORCE fulfillment check via backend (Backup to Webhook)
                    const fulfillmentUrl = `/api/monetization/webhooks/paymob${window.location.search}`;
                    fetch(fulfillmentUrl).then(r => {
                        console.log("[BOOT] Paymob Fulfillment Check Status:", r.status);
                        // Refresh profile after a short delay
                        setTimeout(() => {
                            syncUserProfile(firebaseUser).then(profile => {
                                if (profile) {
                                    setUser(profile);
                                    cacheUserProfile(profile);
                                    setBillingSessionId(paymobId);
                                }
                            });
                        }, 800);
                    }).catch(err => console.error("[BOOT] Paymob Fulfillment Call Failed:", err));

                    window.history.replaceState({}, '', window.location.pathname);
                } else if (kashierStatus === 'SUCCESS') {
                    console.log("[BOOT] Detected Billing Success (Kashier):", kashierId);

                    // FORCE fulfillment check via backend (Backup to Webhook)
                    // This calls the same handler we just updated to support GET redirects
                    const fulfillmentUrl = `/api/monetization/webhooks/kashier${window.location.search}`;
                    fetch(fulfillmentUrl).then(r => {
                        console.log("[BOOT] Kashier Fulfillment Check Status:", r.status);
                        // Refresh profile after a short delay to ensure DB transaction finished
                        setTimeout(() => {
                            syncUserProfile(firebaseUser).then(profile => {
                                if (profile) {
                                    setUser(profile);
                                    cacheUserProfile(profile);
                                    setBillingSessionId(kashierId || 'kashier_success');
                                }
                            });
                        }, 800);
                    }).catch(err => console.error("[BOOT] Kashier Fulfillment Call Failed:", err));

                    window.history.replaceState({}, '', window.location.pathname);
                } else if (paymobSuccess === 'false' || kashierStatus === 'FAILURE') {
                    console.warn("[BOOT] Detected Billing Failure");

                    // Comprehensive error extraction
                    const dataMessage = searchParams.get('data.message') || searchParams.get('error_msg') || searchParams.get('message');
                    const txnResponseCode = searchParams.get('txn_response_code');
                    const acqResponseCode = searchParams.get('acq_response_code');

                    let errorMsg = dataMessage || "Transaction Declined";

                    // If we have a code but no message, or even with message, append codes for clarity
                    if (txnResponseCode || acqResponseCode) {
                        errorMsg += ` (Code: ${txnResponseCode || acqResponseCode})`;
                    }

                    const lastPlan = localStorage.getItem('last_attempted_plan_id');

                    setBillingError(errorMsg);
                    // Pass the failed plan ID if we have it, to auto-reopen or highlight
                    if (lastPlan) {
                        console.log("Found interrupted plan attempt:", lastPlan);
                        // We can potentially pass this to the view state if we expand the state setter or url
                    }
                    window.history.replaceState({}, '', window.location.pathname);
                }

                // 1. OPTIMISTIC LOAD (Instant UI)
                console.log("[BOOT] Checking local cache...");
                const cached = await import('./services/authService').then(m => m.getCachedUserProfile(firebaseUser.uid));

                if (cached) {
                    console.log("[BOOT] Loaded cached profile (Fast Path)");
                    setUser(cached);
                    // Set View immediately based on cached role
                    if (isAdminEmail(cached.email) || cached.role === UserRole.ADMIN) {
                        setView(AppView.ADMIN);
                    } else if (cached.role === UserRole.PARENT) {
                        setView(AppView.PARENT_DASHBOARD);
                    } else if (sessionId || paymobSuccess || kashierStatus) {
                        // If returning from payment (Success OR Failure), FORCE billing view
                        setView(AppView.BILLING);
                    } else {
                        // Keep current view if already set (e.g. Living Dashboard)
                        if (view === AppView.HOME) setView(AppView.LIVING_DASHBOARD);
                    }
                    // Start preloading the AppShell (Dashboard) to avoid Suspense flash
                    import('./components/dashboard/AppShell').then(() => {
                        console.log("[BOOT] AppShell Preloaded");
                        setIsAuthResolving(false); // <--- UNBLOCK UI AFTER DASHBOARD IS READY
                    });
                } else {
                    console.log("[BOOT] No cache found. Waiting for sync...");
                }

                // 1.5. WARMUP (Background monetization boot)
                monetizationClient.getPlans().catch(() => { });
                monetizationClient.getConfig().catch(() => { });
                monetizationClient.checkEntitlementsBulk(['quizzes', 'notes', 'radar', 'ai_minutes']).catch(() => { });

                // 2. BACKGROUND SYNC (Fresh Data)
                syncUserProfile(firebaseUser).then(profile => {
                    console.log("[BOOT] Sync completed. Profile:", profile ? "Found" : "Null");
                    if (profile) {
                        // Update state only if changed (deep compare simplified or just set)
                        setUser(profile);

                        // Cache it for next time
                        import('./services/authService').then(m => m.cacheUserProfile(profile));

                        setAssemblerParams(prev => ({
                            ...prev,
                            selectedSubject: prev.selectedSubject || profile.preferences.defaultSubject || profile.preferences.subjects[0] || ""
                        }));

                        // Routing Update (only if we didn't have cache, OR if role changed)
                        if (!cached || sessionId || paymobSuccess) { // Force update if billing params present
                            if (isAdminEmail(profile.email) || profile.role === UserRole.ADMIN) {
                                setView(AppView.ADMIN);
                            } else if (profile.role === UserRole.PARENT) {
                                setView(AppView.PARENT_DASHBOARD);
                            } else if (sessionId || paymobSuccess || kashierStatus) { // Redirect to Billing on any billing event
                                setView(AppView.BILLING);
                            } else if (view === AppView.HOME) {
                                setView(AppView.LIVING_DASHBOARD);
                            }
                            import('./components/dashboard/AppShell').then(() => {
                                setIsAuthResolving(false); // Unblock after preload
                            });
                        }

                        // 3. LAZY LOAD HISTORY (Non-Blocking)
                        getHistory(profile.id).then(h => setHistoryItems(h)).catch(err => console.error("History fetch failed", err));

                        // 4. BACKGROUND SYNC (Journey Data)
                        JourneySyncService.sync(profile.id).catch(() => { });
                    } else {
                        // Profile failed to load/create?
                        console.error("[BOOT] Profile sync returned null!");
                        setIsAuthResolving(false); // Make sure we don't hang even if error
                    }
                }).catch(err => {
                    console.error("[BOOT] Sync Failed:", err);
                    setIsAuthResolving(false);
                });

            } else {
                console.log("[BOOT] No authenticated user. showing Login.");
                setUser(null);
                setIsAuthResolving(false); // <--- FIX: Ensure we stop loading if no user
            }
        });
        return () => unsubscribe();
    }, []);

    const handleLaunchMission = async (mission: any) => {
        setActiveMission(mission);
        setIsProcessing(true);
        setProcessingLogs([]);
        const trackStatus = (m: string) => {
            setProcessingStatus(m);
            setProcessingLogs(prev => [...prev, m]);
        };
        trackStatus(`Hydrating Bridge for ${mission.topic}...`);
        try {
            const allAtoms = await getLocalAtoms(user!.id);
            const topicAtom = allAtoms.find(a => a.core.metadata.conceptTag === mission.topic) || allAtoms[0];
            if (topicAtom) {
                setActiveAtom(topicAtom.core);
                setView(AppView.BRIDGE);
            } else {
                alert("Knowledge Atom not found. Please train this subject first in Library.");
                setView(AppView.LIBRARY);
            }
        } catch (e) { console.error(e); }
        finally { setIsProcessing(false); }
    };

    const handleLibraryUseItem = (item: LibraryItem) => {
        setAssemblerParams(prev => ({
            ...prev,
            selectedDocIds: [item.contentId]
        }));
        setView(AppView.STUDY_NOTES_ASSEMBLER);
    };

    const handleStartArena = async () => {
        if (!activeAtom) return;
        setIsProcessing(true);
        setProcessingLogs([]);
        const trackStatus = (m: string) => {
            setProcessingStatus(m);
            setProcessingLogs(prev => [...prev, m]);
        };
        trackStatus("Initializing Arena HUD...");
        try {
            const req: GenerationRequest = {
                year: user!.preferences.defaultYear, curriculum: user!.preferences.defaultCurriculum,
                subject: activeMission.subject, topic: activeAtom.metadata.conceptTag,
                mode: 'quiz', language: appLanguage, difficulty: Difficulty.MEDIUM, detailLevel: DetailLevel.DETAILED,
                quizType: QuizType.MIX, questionCount: 5, contentId: activeAtom.metadata.sourceDocumentId
            };
            const result = await generateQuiz(req, trackStatus);
            setActiveQuizData(result);
            setArenaQuestions(result.questions);
            setView(AppView.ARENA);
        } catch (e) { alert("Simulation Handshake Failed."); }
        finally { setIsProcessing(false); }
    };

    const handleArenaFinish = async (results: QuestionResult[]) => {
        setLastArenaResults(results);
        setIsProcessing(true);
        setProcessingLogs([]);
        const trackStatus = (m: string) => {
            setProcessingStatus(m);
            setProcessingLogs(prev => [...prev, m]);
        };
        trackStatus("Sealing Mastery Loop...");
        try {
            const updates = results.map(r => ({ atomId: (r as any).atomId || activeAtom?.atomId || '', isCorrect: !!r.isCorrect }));
            await updateMasteryBatch(user!.id, updates);
            setView(AppView.SUMMARY);
        } catch (e) { console.error(e); }
        finally { setIsProcessing(false); }
    };

    const handleGenerate = async (req: GenerationRequest) => {
        console.group("%c[APP_FLOW] Pipeline Start", "color: #0ea5e9; font-weight: bold;");
        console.info("[APP_FLOW] Incoming Request Object:", req);

        setIsProcessing(true);
        setProcessingLogs([]);
        setSourceView(view);
        setGenError(null);

        const trackStatus = (m: string) => {
            console.log(`%c[PROGRESS] ${m}`, "color: #94a3b8;");
            setProcessingStatus(m);
            setProcessingLogs(prev => [...prev, m]);
        };

        try {
            if (req.mode === 'quiz' || req.mode === 'adaptive-quiz') {
                setActiveGenerationRequest(req);
                setView(AppView.ADAPTIVE_QUIZ);
            } else if (req.mode === 'exam-generator') {
                const data = await generateExamPaper(req, trackStatus);
                setActiveExamData(data);
                setView(AppView.EXAM);
            } else if (req.selectedDocumentIds && req.selectedDocumentIds.length > 0) {
                if (req.mode === 'cheatSheet') {
                    // Mode 2: Cheat Sheet Generation
                    const data = await generateCheatSheet(req, trackStatus);
                    setActiveCheatSheetData(data);
                    setActiveNoteData(null); // Clear master guide
                    setView(AppView.NOTES);

                    // ✅ TELEMETRY: Quota Consumption (Centralized)
                    import('./services/lis/telemetryIngestion').then(({ ingestEvent }) => {
                        ingestEvent({
                            id: crypto.randomUUID(),
                            idempotencyKey: `cs_gen_${data.contentId}_${Date.now()}`,
                            studentId: user!.id,
                            eventType: 'notes.generated',
                            schemaVersion: '2.1.1',
                            timestamp: new Date().toISOString(),
                            timeContext: { durationSec: 0, mode: 'practice', attemptType: 'first' },
                            payload: { contentId: data.contentId, subject: req.subject, mode: 'cheatSheet' } // mode maps to 'notesUsed' quota
                        });
                    });

                } else {
                    // Mode 1: Master Guide (Normal)
                    const data = await assembleStudyNotes(req, user!, trackStatus);
                    setActiveNoteData(data);
                    setActiveCheatSheetData(null); // Clear cheat sheet
                    setView(AppView.NOTES);

                    // ✅ TELEMETRY: Quota Consumption (Centralized)
                    import('./services/lis/telemetryIngestion').then(({ ingestEvent }) => {
                        ingestEvent({
                            id: crypto.randomUUID(),
                            idempotencyKey: `notes_gen_${data.contentId}_${Date.now()}`,
                            studentId: user!.id,
                            eventType: 'notes.generated',
                            schemaVersion: '2.1.1',
                            timestamp: new Date().toISOString(),
                            timeContext: { durationSec: 0, mode: 'practice', attemptType: 'first' },
                            payload: { contentId: data.contentId, subject: req.subject, mode: 'fullNotes' }
                        });
                    });
                }
            }
        } catch (e: any) {
            console.error("[PIPELINE_FAULT]", e);
            setGenError({
                title: "Synthesis Error",
                message: e.message || "Generation failed. Please try again."
            });
        } finally {
            setIsProcessing(false);
            console.groupEnd();
        }
    };

    // Show loading while resolving auth state (prevents "Login does nothing" ghost state)
    if (isAuthResolving) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-slate-900 animate-pulse">
                <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                    <span className="text-2xl">⚡</span>
                </div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Initializing...</p>
            </div>
        );
    }

    if (!user) return <AuthScreen appLanguage={appLanguage} />;

    const renderContent = () => {
        switch (view) {
            case AppView.LIVING_DASHBOARD:
                return <AppShell
                    user={user}
                    appLanguage={appLanguage}
                    onGenerate={handleGenerate}
                    onNavigate={setView}
                    onLogout={() => auth.signOut()}
                    isProcessing={isProcessing}
                    processingLogs={processingLogs}
                    assemblerParams={assemblerParams}
                    onUpdateAssemblerParams={(p) => setAssemblerParams(prev => ({ ...prev, ...p }))}
                />;
            case AppView.DASHBOARD:
                return <GrowthMirrorScreen studentId={user.id} />;
            case AppView.STUDENT_HISTORY:
                return <StudentHistoryScreen studentId={user.id} />;
            case AppView.PARENT_DASHBOARD:
                return <ParentDashboard user={user} appLanguage={appLanguage} onNavigate={setView} />;
            case AppView.ADMIN:
                return <AdminDashboard currentUser={user} onBack={() => setView(AppView.LIVING_DASHBOARD)} />;
            case AppView.LIBRARY:
                return <LibraryDashboard
                    user={user}
                    appLanguage={appLanguage}
                    onUseItem={handleLibraryUseItem}
                    onBack={() => setView(AppView.LIVING_DASHBOARD)}
                    onShowExtractionProgress={handleShowExtractionProgress}
                />;
            case AppView.PROFILE:
                return <ProfileScreen user={user} appLanguage={appLanguage} onUpdate={setUser} onBack={() => setView(AppView.LIVING_DASHBOARD)} />;
            case AppView.SETTINGS:
                return <SettingsScreen user={user} appLanguage={appLanguage} theme="light" onUpdate={setUser} onThemeChange={() => { }} onLanguageChange={setAppLanguage} onBack={() => setView(AppView.LIVING_DASHBOARD)} />;
            case AppView.GAMIFICATION:
                return <GamificationScreen user={user} appLanguage={appLanguage} onBack={() => setView(AppView.LIVING_DASHBOARD)} />;
            case AppView.QUIZ:
                return activeQuizData ? <QuizDisplay data={activeQuizData} onBack={() => setView(AppView.LIVING_DASHBOARD)} language={appLanguage} appLanguage={appLanguage} userId={user.id} /> : null;
            case AppView.EXAM:
                const dummyExamData: any = {
                    id: 'exam_demo',
                    schoolName: "Demo School",
                    subject: "General Knowledge",
                    grade: "10",
                    duration: "30",
                    sections: [
                        {
                            title: "Section A: Multiple Choice",
                            instructions: "Select the best answer for each question.",
                            questions: [
                                { number: "1", text: "What is the powerhouse of the cell?", marks: 1, options: ["Mitochondria", "Nucleus", "Ribosome"], correctAnswer: "Mitochondria", questionType: "MCQ" },
                                { number: "2", text: "Who wrote Romeo and Juliet?", marks: 1, options: ["Charles Dickens", "William Shakespeare", "Jane Austen"], correctAnswer: "William Shakespeare", questionType: "MCQ" }
                            ]
                        }
                    ]
                }
                return <ExamDisplay
                    data={activeExamData || dummyExamData}
                    appLanguage={appLanguage}
                    onBack={() => setView(AppView.LIVING_DASHBOARD)}
                    user={user}
                />;
            case AppView.NOTES:
                if (activeCheatSheetData) {
                    return <CheatSheetDisplay
                        data={activeCheatSheetData}
                        appLanguage={appLanguage}
                        onBack={() => setView(sourceView)}
                    />;
                }
                return activeNoteData ?
                    <NoteDisplay
                        data={activeNoteData}
                        appLanguage={appLanguage}
                        onBack={() => setView(sourceView)}
                        user={user}
                    /> : null;
            case AppView.ARENA:
                return activeAtom ? <QuizArena
                    questions={arenaQuestions}
                    appLanguage={appLanguage}
                    onBack={() => setView(AppView.LIVING_DASHBOARD)}
                    onFinish={handleArenaFinish}
                /> : null;
            case AppView.SUMMARY:
                return <DebriefView
                    results={lastArenaResults}
                    questions={arenaQuestions}
                    appLanguage={appLanguage}
                    user={user}
                    onBack={() => setView(AppView.LIVING_DASHBOARD)}
                    onRetry={handleStartArena}
                    onGapCloser={() => alert("Gap Closer coming soon!")}
                />;
            case AppView.HOME:
                return <Dashboard
                    user={user}
                    appLanguage={appLanguage}
                    onNavigate={setView}
                    onLaunchMission={(mission) => handleGenerate({ ...user.preferences, subject: mission.subject, topic: mission.topic, mode: 'quick' } as any)}
                />;
            case AppView.STUDY_NOTES_ASSEMBLER:
                return <StudyNotesAssembler
                    user={user}
                    appLanguage={appLanguage}
                    onSubmit={handleGenerate}
                    onBack={() => handleSetView(AppView.LIVING_DASHBOARD)}
                    setView={handleSetView}
                    params={assemblerParams}
                    onUpdateParams={(p) => setAssemblerParams(prev => ({ ...prev, ...p }))}
                    isProcessing={isProcessing}
                    debugLogs={processingLogs}
                />;
            case AppView.ADAPTIVE_QUIZ:
                return <AdaptiveQuizModuleV2
                    user={user}
                    appLanguage={appLanguage}
                    onBack={() => setView(AppView.LIVING_DASHBOARD)}
                    onComplete={() => setView(AppView.LIVING_DASHBOARD)}
                    initialRequest={activeGenerationRequest}
                />;
            case AppView.CLASSROOM:
                return <ClassroomDashboard
                    user={user}
                    appLanguage={appLanguage}
                    onNavigateToContent={(topic: string, mode: 'quiz' | 'notes', assignmentId?: string) => {
                        // Logic to handle navigation to content based on topic/mode
                        console.log("Navigating to content:", topic, mode, assignmentId);
                        // Likely needs a handleGenerate call or similar
                    }}
                    onBack={() => setView(AppView.LIVING_DASHBOARD)}
                />;




            case AppView.MY_PRIVATE_TEACHER:
                // MICRO-APP LOADER -> MODULE RENDERER
                return <PrivateTutorLoader user={user} />;

            case AppView.MOCK_CHECKOUT:
                return (
                    <MockCheckout
                        planId={checkoutPlanId}
                        onSuccess={() => {
                            alert('🎉 Payment Successful! \n\nWelcome to your new plan.');
                            // Optimistic State Update
                            if (user && checkoutPlanId) {
                                setUser({
                                    ...user,
                                    plan: {
                                        id: checkoutPlanId as any,
                                        status: 'active',
                                        startDate: Date.now(),
                                        expiryDate: Date.now() + 30 * 24 * 60 * 60 * 1000
                                    }
                                });
                            }
                            setView(AppView.PRICING); // Navigate to pricing to show updated plan
                        }}
                        onCancel={() => setView(AppView.PRICING)}
                    />
                );

            case AppView.BILLING_HISTORY:
                // FIX: Navigate to Dashboard with history tab active
                return (
                    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
                        <SubscriptionDashboard
                            user={user}
                            initialTab="history"
                            onNavigate={setView}
                            onMockCheckout={handleLaunchMockCheckout}
                            onViewInvoice={setSelectedInvoice}
                        />
                        {selectedInvoice && (
                            <InvoiceModal
                                invoice={selectedInvoice}
                                onClose={() => setSelectedInvoice(null)}
                            />
                        )}
                    </div>
                );

            case AppView.PRICING:
            case AppView.BILLING:
                return (
                    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
                        <SubscriptionDashboard
                            user={user}
                            initialTab="plans"
                            onNavigate={setView}
                            onMockCheckout={handleLaunchMockCheckout}
                            onViewInvoice={setSelectedInvoice}
                            successSessionId={billingSessionId}
                            billingError={billingError}
                            onClearSuccess={() => {
                                setBillingSessionId(null);
                                setBillingError(null);
                                // Also ensure URL is clean
                                window.history.replaceState({}, '', window.location.pathname);
                            }}
                        />
                        {selectedInvoice && (
                            <InvoiceModal
                                invoice={selectedInvoice}
                                onClose={() => setSelectedInvoice(null)}
                            />
                        )}
                    </div>
                );

            case AppView.CONTACT_US:
                return <ContactUs />;

            default:
                return <div>View Found: {view}</div>;
        }
    };

    return (
        <Layout
            currentView={view}
            onNavigate={setView}
            appLanguage={appLanguage}
            setAppLanguage={setAppLanguage}
            theme={theme}
            setTheme={setTheme}
            user={user}
            onLogout={() => auth.signOut()}
            xpNotification={null}
        >
            {genError && (
                <AlertModal
                    isOpen={!!genError}
                    title={genError.title}
                    message={genError.message}
                    onClose={() => setGenError(null)}
                />
            )}
            <React.Suspense fallback={<LoadingSpinner message="Loading View..." />}>
                {renderContent()}
            </React.Suspense>

            {/* Global Extraction Progress Modal */}
            {activeExtractionFingerprint && (
                <ExtractionProgressModal
                    docFingerprint={activeExtractionFingerprint}
                    visible={isExtractionProgressVisible}
                    onClose={() => setIsExtractionProgressVisible(false)}
                    currentPlanId={user?.plan?.id}
                    onUpgrade={() => {
                        setIsExtractionProgressVisible(false);
                        handleSetView(AppView.PRICING);
                    }}
                />
            )}
        </Layout>
    );

};

export default App;
