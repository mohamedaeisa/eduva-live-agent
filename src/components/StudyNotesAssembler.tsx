import React, { useState, useEffect, useMemo, useRef } from 'react';
import { QuotaGuard } from './monetization/QuotaGuard';
import GeneratorHeader from './ui/GeneratorHeader';
//import { TRANSLATIONS } from '../constants';
import { TRANSLATIONS } from '../i18n';

import {
  UserProfile, Language, LocalTrainingSource,
  Difficulty, DetailLevel, QuizType, GenerationRequest, AppView
} from '../types';
import { getLocalTrainingSources } from '../services/storageService';
import { db } from '../services/firebaseConfig';
import { getDB } from '../services/idbService';
import { normalizeSubjectName } from '../utils/subjectUtils';
import Button from './ui/Button';
import Card from './ui/Card';
import AlertModal from './ui/AlertModal';
import { monetizationClient } from '../services/monetization/client';
import { logger } from '../utils/logger';
import { sendTelemetry } from '../services/telemetryBrainService';

interface SourceConfig {
  useCustomRange: boolean;
  start: number;
  end: number;
}

const SourceRow: React.FC<{
  source: LocalTrainingSource,
  isSelected: boolean,
  onToggle: () => void,
  config: SourceConfig,
  onConfigChange: (config: SourceConfig) => void,
  disabled?: boolean,
  t: any
}> = ({ source, isSelected, onToggle, config, onConfigChange, disabled, t }) => {
  const isTrained = source.status === 'Completed';

  return (
    <div className={`mb-3 rounded-[1.5rem] border-2 transition-all duration-300 overflow-hidden ${!isTrained ? 'opacity-40 grayscale border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900' :
      isSelected ? 'border-indigo-600 bg-white dark:bg-slate-800 shadow-xl ring-4 ring-indigo-500/5' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-200 dark:hover:border-indigo-900'
      }`}>
      <div
        className={`p-4 flex items-center justify-between gap-4 ${isTrained ? 'cursor-pointer' : 'cursor-not-allowed'}`}
        onClick={isTrained && !disabled ? onToggle : undefined}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
            }`}>
            {isSelected && <span className="text-[10px] font-black">✓</span>}
            {!isTrained && <span className="text-slate-400 text-xs">🔒</span>}
          </div>
          <div className="min-w-0">
            <p className="font-black text-slate-800 dark:text-slate-200 text-sm break-words leading-tight">{source.fileName}</p>
            <div className="flex gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${isTrained ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-200 text-slate-500'}`}>
                {isTrained ? t.notes.source.ready : t.notes.source.needsTraining}
              </span>
              {isTrained && (
                <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase tracking-widest border border-emerald-100">
                  {source.trustScore || 0}% {t.notes.source.density}
                </span>
              )}
            </div>
          </div>
        </div>
        {isTrained && (
          <span className={`text-slate-300 transition-transform duration-300 ${isSelected ? 'rotate-180 text-indigo-500' : ''}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </span>
        )}
      </div>

      {isTrained && isSelected && (
        <div className="px-4 pb-3 pt-1 bg-indigo-50/20 animate-slide-up border-t border-indigo-50">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="space-y-0.5">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.notes.source.range.start}</label>
              <input
                type="number"
                value={config.start}
                disabled={disabled}
                onChange={(e) => onConfigChange({ ...config, start: parseInt(e.target.value) || 1, useCustomRange: true })}
                className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.notes.source.range.end}</label>
              <input
                type="number"
                value={config.end}
                disabled={disabled}
                onChange={(e) => onConfigChange({ ...config, end: parseInt(e.target.value) || 100, useCustomRange: true })}
                className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); onConfigChange({ ...config, useCustomRange: false }); }}
              className={`flex-1 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all border ${!config.useCustomRange ? 'bg-white dark:bg-slate-800 border-indigo-400 text-indigo-600 shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-400'}`}
            >
              {t.notes.source.range.full}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onConfigChange({ ...config, useCustomRange: true }); }}
              className={`flex-1 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all border ${config.useCustomRange ? 'bg-white dark:bg-slate-800 border-indigo-400 text-indigo-600 shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-400'}`}
            >
              {t.notes.source.range.custom}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface StudyNotesAssemblerProps {
  user: UserProfile;
  appLanguage: Language;
  onSubmit: (req: GenerationRequest) => void;
  onBack: () => void;
  setView?: (view: AppView) => void;
  isProcessing?: boolean;
  debugLogs?: string[];
  params?: {
    selectedSubject: string;
    selectedDocIds: string[];
    docConfigs: Record<string, any>;
    mode: 'fullNotes' | 'cheatSheet';
    searchTerm: string;
  };
  onUpdateParams: (params: Partial<StudyNotesAssemblerProps['params']>) => void;
}

const StudyNotesAssembler: React.FC<StudyNotesAssemblerProps> = (props) => {
  const {
    user,
    appLanguage,
    onSubmit,
    onBack,
    setView,
    isProcessing = false,
    debugLogs = [],
    onUpdateParams = () => { }
  } = props;

  const [internalSubject, setInternalSubject] = useState<string>(
    props.params?.selectedSubject || user.preferences.defaultSubject || (user.preferences.subjects && user.preferences.subjects[0]) || ""
  );

  // Internal state for selected document hashes (fileHash is the common link)
  const [internalSelectedDocIds, setInternalSelectedDocIds] = useState<string[]>(
    props.params?.selectedDocIds || []
  );

  // Defensive translation initialization
  const rawT: any = TRANSLATIONS[appLanguage] || TRANSLATIONS['English'];
  const t = {
    ...rawT,
    notes: rawT?.notes || {
      //header: { title: "Note Assembler", subtitle: "Personalized knowledge synthesis", protocol: "Protocol v2.9 Active" },
      steps: { step1: { label: "SELECT SUBJECT" }, step2: { label: "OUTPUT TYPE" }, step3: { label: "SELECT MATERIAL" } },
      source: {
        ready: "Ready",
        needsTraining: "Needs Training",
        density: "Density",
        range: { start: "Start", end: "End", full: "Full", custom: "Range" }
      },
      modes: {
        masterGuide: "Master Guide",
        detailed: "Detailed",
        cheatSheet: { title: "Cheat Sheet", desc: "For quick revision" },
        quick: "Quick",
        fullNotes: { title: "Full Notes", desc: "Comprehensive coverage" }
      },
      actions: {
        filter: "Filter...",
        noMatches: "No matches",
        noFiles: "No files",
        synthesize: "ROCKET SYNTHESIZE",
        processing: "PROCESSING..."
      },
      footer: { selected: "Selected", files: "File(s)", mode: "Mode" },
      status: {
        neuralSynthesisActive: "NEURAL SYNTHESIS ACTIVE",
        readyForAssembly: "READY FOR ASSEMBLY",
        needsTraining: "NEEDS TRAINING",
        density: "Density"
      },
      config: { start: "Start", end: "End", full: "Full", range: "Range" },
      stats: { selected: "Selected", files: "Files", mode: "Mode" },
      searchPlaceholder: "Search...",
      noMatches: "No Matches",
      noFiles: "No Files"
    }
  };
  // Handle mixed state referencing notesT
  const notesT = t.notes;

  const params = props.params || {
    selectedSubject: internalSubject,
    selectedDocIds: internalSelectedDocIds,
    docConfigs: {},
    mode: 'fullNotes',
    searchTerm: ''
  };

  const [sources, setSources] = useState<LocalTrainingSource[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSources();
  }, [user.id]);

  // Sync internal subject state if parent state changes
  useEffect(() => {
    if (props.params?.selectedSubject && props.params.selectedSubject !== internalSubject) {
      setInternalSubject(props.params.selectedSubject);
    }
  }, [props.params?.selectedSubject]);

  // Sync internal selection state if parent state changes
  useEffect(() => {
    if (props.params?.selectedDocIds && JSON.stringify(props.params.selectedDocIds) !== JSON.stringify(internalSelectedDocIds)) {
      setInternalSelectedDocIds(props.params.selectedDocIds);
    }
  }, [props.params?.selectedDocIds]);

  useEffect(() => {
    if (isProcessing && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [debugLogs, isProcessing]);

  const loadSources = async () => {
    logger.assembler("Syncing knowledge registry from cloud...");
    setIsSyncing(true);

    try {
      // 1. Fetch Local First & Dedup
      const localData = await getLocalTrainingSources(user.id);

      // Dedup helper
      const dedup = (items: LocalTrainingSource[]) => {
        const m = new Map();
        items.forEach(i => m.set(i.fileHash, i));
        return Array.from(m.values()) as LocalTrainingSource[];
      };

      setSources(dedup(localData));

      // 2. Refresh from Cloud
      const cloudSourcesSnap = await db.collection('training_sources')
        .where('studentId', '==', user.id)
        .get();

      const cloudData = cloudSourcesSnap.docs.map(d => d.data() as LocalTrainingSource);

      const idb = await getDB();
      const tx = idb.transaction('training_sources', 'readwrite');
      for (const s of cloudData) {
        await tx.store.put(s);
      }
      await tx.done;

      // 3. Re-set state with merged data (Cloud wins collisions)
      setSources(prev => {
        const map = new Map(prev.map(s => [s.fileHash, s]));
        cloudData.forEach(c => map.set(c.fileHash, c));
        return Array.from(map.values());
      });

      const newConfigs = { ...params.docConfigs };
      let configsChanged = false;
      cloudData.forEach(s => {
        if (!newConfigs[s.fileHash]) {
          newConfigs[s.fileHash] = { useCustomRange: false, start: 1, end: 100 };
          configsChanged = true;
        }
      });
      if (configsChanged) onUpdateParams({ docConfigs: newConfigs });

      logger.assembler(`Sync successful. ${cloudData.length} sources hydrated.`);
    } catch (e) {
      logger.error("ASSEMBLER", "[SYNC_FAULT] Failed to sync sources", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const currentSubjectSources = useMemo(() => {
    const targetSub = normalizeSubjectName(internalSubject);

    let filtered = sources.filter(s => {
      const sourceSub = normalizeSubjectName(s.subject || "general");
      return sourceSub === targetSub;
    });

    if (params.searchTerm.trim()) {
      const query = params.searchTerm.toLowerCase();
      filtered = filtered.filter(s => s.fileName.toLowerCase().includes(query));
    }

    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }, [sources, internalSubject, params.searchTerm]);

  const totalSelectedCount = internalSelectedDocIds.length;

  const handleToggleDoc = (hash: string) => {
    if (isProcessing) return;

    // Enforce Single Selection
    const next = internalSelectedDocIds.includes(hash)
      ? []
      : [hash];

    logger.assembler(`Toggled document hash ${hash}. Total selected: ${next.length}`);
    setInternalSelectedDocIds(next);
    onUpdateParams({ selectedDocIds: next });
  };

  const updateDocConfig = (hash: string, config: SourceConfig) => {
    onUpdateParams({ docConfigs: { ...params.docConfigs, [hash]: config } });
  };

  /* DOUBLE CLICK PROTECTION */
  const submittingRef = useRef(false);

  // Reset lock when processing finishes or component unmounts
  useEffect(() => {
    if (!isProcessing) {
      submittingRef.current = false;
    }
  }, [isProcessing]);

  const handleAssemble = async () => {
    logger.assembler("Launching Synthesis.", { subject: internalSubject, mode: params.mode, docCount: internalSelectedDocIds.length });
    if (internalSelectedDocIds.length === 0) return;
    if (isProcessing || submittingRef.current) return;

    // Lock immediately
    submittingRef.current = true;

    const configMap: Record<string, { start: number; end: number; useCustomRange: boolean }> = {};
    internalSelectedDocIds.forEach(hash => {
      const cfg = params.docConfigs[hash];
      if (cfg) {
        configMap[hash] = {
          start: Number(cfg.start),
          end: Number(cfg.end),
          useCustomRange: cfg.useCustomRange
        };
      }
    });

    // --- BRAIN LAYER HOOK ---
    sendTelemetry({
      userId: user.id,
      studentId: user.id,
      module: 'StudyNotesAssembler',
      eventType: 'synthesis_launched',
      payload: {
        atoms: [],
        metadata: { subject: internalSubject, mode: params.mode, docCount: internalSelectedDocIds.length }
      },
      timestamp: new Date().toISOString()
    });

    // ✅ Increment Usage Quota
    // Fire and forget, but now protected by ref
    monetizationClient.incrementUsage('notesUsed');

    onSubmit({
      year: user.preferences.defaultYear,
      curriculum: user.preferences.defaultCurriculum,
      subject: internalSubject,
      topic: `Assembled ${internalSubject} Guide`,
      mode: params.mode,
      language: appLanguage,
      difficulty: Difficulty.MEDIUM,
      detailLevel: DetailLevel.DETAILED,
      quizType: QuizType.MIX,
      questionCount: 0,
      selectedDocumentIds: internalSelectedDocIds,
      documentConfigs: configMap,
      fileName: `Assembly: ${internalSelectedDocIds.length} Source(s)`
    });
  };

  const assemblerLogs = useMemo(() => debugLogs.filter(log => log.includes('[ASSEMBLER]')), [debugLogs]);

  return (
    <>
      <div className="w-full max-w-3xl mx-auto animate-fade-in pb-60 md:pb-44 flex flex-col min-h-[calc(100vh-4rem)]">
        <GeneratorHeader
          title="Notes Generator"
          onBack={onBack}
          onExit={onBack} // For now, Exit and Back do the same (go back to vault)
        />

        <div className="px-4 flex flex-col gap-6">

          {/* STEP 1: SUBJECT */}
          <section className="space-y-1.5 animate-slide-up">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[10px] font-black">1</span>
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.notes.steps.step1.label}</h4>
            </div>
            <div className="relative group">
              <select
                disabled={isProcessing}
                className="w-full p-2.5 rounded-xl border-2 border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-black text-slate-800 dark:text-white outline-none focus:border-indigo-500 appearance-none shadow-sm cursor-pointer transition-all"
                value={internalSubject}
                onChange={(e) => {
                  const val = e.target.value;
                  logger.assembler(`Filter Subject changed to: ${val}`);
                  setInternalSubject(val);
                  setInternalSelectedDocIds([]);
                  onUpdateParams({ selectedSubject: val, selectedDocIds: [], searchTerm: '' });
                }}
              >
                {user.preferences.subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300 text-xs">▼</div>
            </div>
          </section>

          {/* STEP 2: OUTPUT TYPE */}
          <section className="space-y-1.5 animate-slide-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-black">2</span>
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.notes.steps.step2.label}</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                disabled={isProcessing}
                onClick={() => onUpdateParams({ mode: 'fullNotes' })}
                className={`relative p-3.5 rounded-2xl border-2 transition-all flex flex-row items-center gap-3 group ${params.mode === 'fullNotes' ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-80 hover:opacity-100'}`}
              >
                {params.mode === 'fullNotes' && <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></div>}
                <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 flex items-center justify-center text-xl">📖</div>
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-white leading-none">{t.notes.modes.fullNotes.title}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">{t.notes.modes.fullNotes.desc}</p>
                </div>
              </button>
              <button
                disabled={isProcessing}
                onClick={() => onUpdateParams({ mode: 'cheatSheet' })}
                className={`relative p-3.5 rounded-2xl border-2 transition-all flex flex-row items-center gap-3 group ${params.mode === 'cheatSheet' ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-80 hover:opacity-100'}`}
              >
                {params.mode === 'cheatSheet' && <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></div>}
                <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 flex items-center justify-center text-xl">⚡</div>
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-white leading-none">{notesT.modes.cheatSheet.title}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">{notesT.modes.cheatSheet.desc}</p>
                </div>
              </button>
            </div>
          </section>

          {/* STEP 3: MATERIAL */}
          <section className="space-y-1.5 animate-slide-up" style={{ animationDelay: '200ms' }}>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">3</span>
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.notes.steps.step3.label}</h4>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={params.searchTerm}
                    onChange={e => onUpdateParams({ searchTerm: e.target.value })}
                    placeholder={notesT.searchPlaceholder}
                    className="w-48 p-1.5 pl-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[10px] font-bold outline-none focus:border-indigo-500 transition-all shadow-sm dark:text-white"
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">🔍</span>
                </div>
                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{currentSubjectSources.length}</span>
              </div>
            </div>

            <div className="space-y-1">{/* Dynamic height based on content */}
              {currentSubjectSources.length > 0 ? (
                currentSubjectSources.map(s => (
                  <SourceRow
                    key={s.fileHash}
                    source={s}
                    isSelected={internalSelectedDocIds.includes(s.fileHash)}
                    onToggle={() => handleToggleDoc(s.fileHash)}
                    config={params.docConfigs[s.fileHash] || { useCustomRange: false, start: 1, end: 100 }}
                    onConfigChange={(cfg) => updateDocConfig(s.fileHash, cfg)}
                    disabled={isProcessing}
                    t={t}
                  />
                ))
              ) : (
                <div className="p-8 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50">
                  <span className="text-2xl block mb-2 opacity-20">📂</span>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    {params.searchTerm ? t.notes.noMatches : t.notes.noFiles}
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="fixed bottom-20 md:bottom-0 left-0 right-0 p-4 z-40 flex justify-center bg-gradient-to-t from-white via-white/80 to-transparent dark:from-slate-900 dark:via-slate-900/80 pt-16">
          <div className="w-full max-w-3xl flex flex-col sm:flex-row gap-3 items-center">

            <div className="w-full sm:flex-1 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md rounded-2xl p-3 border border-slate-100 dark:border-slate-700 flex items-center justify-between px-5 shadow-sm">
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{notesT.stats.selected}</span>
                <span className="text-xs font-black text-slate-800 dark:text-slate-200">{totalSelectedCount} {notesT.stats.files}</span>
              </div>

              <div className="flex flex-col text-right">
                <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{notesT.stats.mode}</span>
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{params.mode === 'fullNotes' ? notesT.modes.fullNotes.title.toUpperCase() : notesT.modes.cheatSheet.title.toUpperCase()}</span>
              </div>
            </div>

            <QuotaGuard
              capability="notes"
              setView={setView}
              disabled={totalSelectedCount === 0 || isProcessing}
            >
              <Button
                onClick={handleAssemble}
                isLoading={isProcessing}
                className="w-full sm:flex-1 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-indigo-500/30 active:scale-95 transition-all"
              >
                {isProcessing ? t.notes.actions.processing : t.notes.actions.synthesize}
              </Button>
            </QuotaGuard>
          </div>
        </div>
      </div>

      {/* Quota Exceeded Modal removal moved to QuotaGuard */}

      {isProcessing && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-slate-900 rounded-3xl p-6 w-full max-w-md border border-slate-700 shadow-2xl animate-pop">
            <h3 className="text-white font-black text-lg mb-4 flex items-center gap-3">
              <span className="animate-spin text-2xl">⚡</span>
              {t.notes.processing.title}
            </h3>
            <div className="bg-black/50 rounded-xl p-4 h-48 overflow-y-auto custom-scrollbar font-mono text-xs border border-slate-800">
              {assemblerLogs.map((log, i) => (
                <div key={i} className="flex gap-2 text-emerald-400 mb-1">
                  <span className="opacity-50">&gt;</span>
                  <span>{log.replace('[ASSEMBLER] ', '')}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default StudyNotesAssembler;