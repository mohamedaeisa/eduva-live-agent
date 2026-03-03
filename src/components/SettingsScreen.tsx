import React, { useState, useEffect } from 'react';
import { UserProfile, Language, UserRole } from '../types';
import { TRANSLATIONS } from '../constants';
import { updateFullUserProfile } from '../services/authService';
import { nukeAllLocalData, nukeGlobalData, GLOBAL_COLLECTIONS, LOCAL_STORES, getLocalStoreStats, deleteLocalStores } from '../services/storageService';
import { requestNotificationPermission } from '../services/systemNotificationService';
import { db } from '../services/firebaseConfig';
import Card from './ui/Card';
import Button from './ui/Button';

interface SettingsScreenProps {
  user: UserProfile;
  appLanguage: Language;
  theme: 'light' | 'dark';
  onUpdate: (updatedUser: UserProfile) => void;
  onThemeChange: (t: 'light' | 'dark') => void;
  onLanguageChange: (l: Language) => void;
  onBack: () => void;
}

const AVAILABLE_MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Fast & Balanced)', category: 'Standard' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (High Precision)', category: 'Advanced' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite (Efficient)', category: 'Lightweight' },
];

const SettingsScreen: React.FC<SettingsScreenProps> = ({
  user,
  appLanguage,
  theme,
  onUpdate,
  onThemeChange,
  onLanguageChange,
  onBack
}) => {
  const t = TRANSLATIONS[appLanguage];

  const [enableNotifs, setEnableNotifs] = useState(user.preferences.enableNotifications);
  const [enableVibes, setEnableVibes] = useState(user.preferences.enableVibration);
  const [aiModel, setAiModel] = useState(user.preferences.aiModel || 'gemini-3-flash-preview');

  const [isLoading, setIsLoading] = useState(false);


  // Local Reset State
  const [nukeStatus, setNukeStatus] = useState<'idle' | 'confirm' | 'processing' | 'done' | 'error'>('idle');
  const [nukeLogs, setNukeLogs] = useState<string[]>([]);
  const [localStats, setLocalStats] = useState<Record<string, number>>({});
  const [selectedLocalStores, setSelectedLocalStores] = useState<string[]>([]);
  const [isRefreshingStats, setIsRefreshingStats] = useState(false);

  // Global Purge State
  const [globalNukeStatus, setGlobalNukeStatus] = useState<'idle' | 'confirm' | 'processing' | 'done' | 'error'>('idle');
  const [globalNukeLogs, setGlobalNukeLogs] = useState<string[]>([]);
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredCollections, setDiscoveredCollections] = useState<string[]>([]);

  useEffect(() => {
    refreshStats();
    if (user.email === 'nour@nour.nour' || user.role === UserRole.ADMIN) {
      discoverCollections();
    }
  }, []);

  const PRESERVED_COLLECTIONS = ['folders'];

  const discoverCollections = async () => {
    setIsDiscovering(true);
    // Note: Client-side Firestore SDK cannot dynamically list collections
    // This is a security limitation - collections must be maintained in GLOBAL_COLLECTIONS array
    setTimeout(() => {
      setDiscoveredCollections(GLOBAL_COLLECTIONS);
      // Auto-select all except preserved ones
      setSelectedCols(GLOBAL_COLLECTIONS.filter(c => !PRESERVED_COLLECTIONS.includes(c)));
      console.log(`[ADMIN] Loaded ${GLOBAL_COLLECTIONS.length} collections from registry:`, GLOBAL_COLLECTIONS);
      setIsDiscovering(false);
    }, 500);
  };

  const refreshStats = async () => {
    setIsRefreshingStats(true);
    const stats = await getLocalStoreStats();
    setLocalStats(stats);
    setIsRefreshingStats(false);
  };

  const handleModelSync = async () => {
    setIsLoading(true);
    try {
      await updateFullUserProfile(user.id, {
        name: user.name,
        year: user.preferences.defaultYear,
        curriculum: user.preferences.defaultCurriculum,
        subject: user.preferences.defaultSubject,
        aiModel: aiModel
      });

      onUpdate({
        ...user,
        preferences: { ...user.preferences, aiModel: aiModel }
      });
    } catch (e) {
      console.error("Failed to sync model", e);
    } finally {
      setIsLoading(false);
    }
  };



  const handleGranularLocalReset = async () => {
    if (selectedLocalStores.length === 0) return;
    setNukeStatus('processing');
    setNukeLogs(["Initiating Selective Local Purge..."]);
    try {
      await deleteLocalStores(selectedLocalStores);
      setNukeLogs(prev => [...prev, `Purged ${selectedLocalStores.length} local stores.`]);
      await refreshStats();
      setNukeStatus('done');
    } catch (e: any) {
      setNukeLogs(prev => [...prev, `ERROR: ${e.message}`]);
      setNukeStatus('error');
    }
  };

  const handleFactoryReset = async () => {
    setNukeStatus('processing');
    setNukeLogs(["Initiating Neural Purge..."]);
    const result = await nukeAllLocalData();
    result.steps.forEach((step, i) => {
      setTimeout(() => {
        setNukeLogs(prev => [...prev, step]);
        if (i === result.steps.length - 1) setNukeStatus(result.success ? 'done' : 'error');
      }, (i + 1) * 400);
    });
  };

  const handleGlobalPurge = async () => {
    if (selectedCols.length === 0) return;
    setGlobalNukeStatus('processing');
    setGlobalNukeLogs(["ESTABLISHING HANDSHAKE WITH FIRESTORE..."]);

    try {
      const success = await nukeGlobalData((msg) => {
        setGlobalNukeLogs(prev => [...prev, msg]);
      }, selectedCols);

      if (success) {
        setGlobalNukeLogs(prev => [...prev, "CLOUD SYNC COMPLETE. BUFFER SEALED."]);
        setGlobalNukeStatus('done');
      } else {
        setGlobalNukeStatus('error');
      }
    } catch (e: any) {
      setGlobalNukeLogs(prev => [...prev, `FAULT DETECTED: ${e.message}`]);
      setGlobalNukeStatus('error');
    }
  };

  const toggleCol = (col: string) => {
    setSelectedCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };

  const toggleLocalStore = (storeId: string) => {
    setSelectedLocalStores(prev => prev.includes(storeId) ? prev.filter(s => s !== storeId) : [...prev, storeId]);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 animate-fade-in pb-32 pt-4 md:pt-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white tracking-tighter italic">Settings</h1>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.4em] mt-1">Control Center Protocol v6.5</p>
        </div>
        <Button variant="outline" onClick={onBack} className="rounded-2xl border-slate-200 bg-white dark:bg-slate-800 shadow-sm px-8">
          ← Back
        </Button>
      </div>

      <div className="space-y-8">



        {/* User Preferences Section */}
        <Card className="rounded-[2.5rem] p-8 md:p-10 border-slate-100 dark:border-slate-800 shadow-sm bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 dark:text-white flex items-center gap-3">
              <span className="text-2xl">🎨</span> Appearance & Intelligence
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Theme & Language */}
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Interface Theme</label>
                <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  {['light', 'dark'].map((tMode) => (
                    <button
                      key={tMode}
                      onClick={() => onThemeChange(tMode as 'light' | 'dark')}
                      className={`flex-1 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${theme === tMode
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                      {tMode === 'light' ? 'Light Mode' : 'Dark Mode'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Language</label>
                <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  {[Language.ENGLISH, Language.ARABIC].map((lang) => (
                    <button
                      key={lang}
                      onClick={() => onLanguageChange(lang)}
                      className={`flex-1 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${appLanguage === lang
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                      {lang === Language.ENGLISH ? 'English' : 'Arabic'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Model Selection */}
            <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Cognitive Model</label>
              <div className="space-y-2">
                {AVAILABLE_MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setAiModel(model.id)}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all ${aiModel === model.id
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                      : 'border-slate-100 dark:border-slate-800 hover:border-slate-300'
                      }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-black uppercase tracking-wide ${aiModel === model.id ? 'text-brand-700 dark:text-brand-400' : 'text-slate-600 dark:text-slate-400'
                        }`}>
                        {model.name}
                      </span>
                      {aiModel === model.id && <span className="text-brand-600">✓</span>}
                    </div>
                  </button>
                ))}
              </div>
              <div className="pt-2">
                <Button
                  onClick={handleModelSync}
                  isLoading={isLoading}
                  disabled={aiModel === user.preferences.aiModel}
                  className="w-full rounded-xl"
                >
                  Save Preferences
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Global DB Purge Section - ADMIN ONLY */}
        {user.email === 'nour@nour.nour' && (
          <Card className="rounded-[2.5rem] p-8 md:p-10 border-purple-100 bg-purple-50/5 dark:bg-purple-950/10 shadow-xl overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-6 opacity-5 text-9xl group-hover:rotate-12 transition-transform duration-700 select-none">☁️</div>

            <div className="relative z-10">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-xl font-black text-purple-700 dark:text-purple-400 uppercase tracking-tight flex items-center gap-3">
                    <span className="text-2xl">🔮</span> Global Grid Maintenance
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Multi-tenant Cloud Purge Utility</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedCols(discoveredCollections.filter(c => !PRESERVED_COLLECTIONS.includes(c)))} className="text-[8px] font-black text-purple-600 hover:underline uppercase tracking-widest">Select All</button>
                  <span className="text-slate-300">|</span>
                  <button onClick={() => setSelectedCols([])} className="text-[8px] font-black text-slate-400 hover:underline uppercase tracking-widest">Clear</button>
                </div>
              </div>

              {isDiscovering ? (
                <div className="py-12 flex flex-col items-center justify-center">
                  <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest mt-4">Discovering Cloud Collections...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-2">
                    {discoveredCollections.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No collections discovered yet...</p>
                    ) : (
                      discoveredCollections.map(col => (
                        <button
                          key={col}
                          onClick={() => toggleCol(col)}
                          className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border-2 ${selectedCols.includes(col)
                            ? 'bg-purple-600 border-purple-500 text-white shadow-lg'
                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400'
                            }`}
                        >
                          {col}
                        </button>
                      ))
                    )}
                  </div>

                  {globalNukeStatus === 'processing' ? (
                    <div className="p-6 bg-slate-950 rounded-[1.5rem] font-mono text-[9px] h-48 overflow-y-auto text-green-400 border border-purple-500/30 shadow-inner">
                      {globalNukeLogs.map((log, i) => (
                        <div key={i} className="mb-1 opacity-80 group-last:opacity-100 group-last:font-black">
                          <span className="text-purple-500">#</span> {log}
                        </div>
                      ))}
                    </div>
                  ) : globalNukeStatus === 'confirm' ? (
                    <div className="p-6 bg-red-50 dark:bg-red-950/20 border-2 border-red-100 dark:border-red-900/50 rounded-3xl animate-pop">
                      <p className="text-xs font-black text-red-700 dark:text-red-400 uppercase tracking-widest mb-4">⚠️ AUTHORIZATION REQUIRED: This will wipe ${selectedCols.length} collections globally.</p>
                      <div className="flex gap-2">
                        <Button variant="danger" className="flex-1 rounded-xl bg-red-600 font-black text-[10px]" onClick={handleGlobalPurge}>I AUTHORIZE PURGE</Button>
                        <Button variant="outline" className="flex-1 rounded-xl font-black text-[10px]" onClick={() => setGlobalNukeStatus('idle')}>ABORT</Button>
                      </div>
                    </div>
                  ) : globalNukeStatus === 'done' ? (
                    <div className="text-center py-6 bg-green-50 rounded-3xl animate-pop">
                      <p className="text-sm font-black text-green-700 uppercase tracking-widest mb-4">Purge Protocol Finalized.</p>
                      <Button size="sm" variant="outline" onClick={() => setGlobalNukeStatus('idle')}>Reset Terminal</Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => selectedCols.length > 0 && setGlobalNukeStatus('confirm')}
                      disabled={selectedCols.length === 0}
                      className={`w-full py-5 rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-[10px] shadow-2xl transition-all active:scale-95 ${selectedCols.length > 0 ? 'bg-purple-700 text-white shadow-purple-500/20' : 'bg-slate-100 text-slate-300'}`}
                    >
                      Execute Cloud Nuke ({selectedCols.length})
                    </button>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Local Diagnostics */}
        <Card className="rounded-[2.5rem] p-8 md:p-10 border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 dark:text-white flex items-center gap-3">
              <span className="text-2xl">💾</span> Local Vault
            </h3>
            <Button size="sm" variant="outline" onClick={refreshStats} isLoading={isRefreshingStats} className="rounded-xl border-slate-200">
              Audit Storage
            </Button>
          </div>

          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {LOCAL_STORES.map(store => (
                <div
                  key={store.id}
                  onClick={() => toggleLocalStore(store.id)}
                  className={`p-5 rounded-[1.5rem] border-2 transition-all cursor-pointer flex items-center justify-between group ${selectedLocalStores.includes(store.id) ? 'border-indigo-600 bg-indigo-50/20 shadow-md' : 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800'}`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">{store.label}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-1">{localStats[store.id] || 0} Records Found</p>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedLocalStores.includes(store.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 group-hover:border-indigo-300'}`}>
                    {selectedLocalStores.includes(store.id) && <span className="text-[10px]">✓</span>}
                  </div>
                </div>
              ))}
            </div>

            {selectedLocalStores.length > 0 && nukeStatus === 'idle' && (
              <Button variant="danger" className="w-full py-5 rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-[11px] shadow-xl" onClick={() => setNukeStatus('confirm')}>
                Delete Selected Vaults
              </Button>
            )}

            {nukeStatus === 'confirm' && (
              <div className="p-6 bg-red-50 dark:bg-red-950/20 border-2 border-red-100 dark:border-red-900/50 rounded-[2rem] space-y-4 animate-pop">
                <p className="text-xs font-black text-red-700 dark:text-red-400 uppercase tracking-widest text-center">Irreversible Data Destruction Confirmed?</p>
                <div className="flex gap-3">
                  <Button variant="danger" className="flex-1 rounded-xl bg-red-600 font-black text-[10px]" onClick={handleGranularLocalReset}>DESTROY DATA</Button>
                  <Button variant="outline" className="flex-1 rounded-xl font-black text-[10px] bg-white" onClick={() => setNukeStatus('idle')}>CANCEL</Button>
                </div>
              </div>
            )}

            {nukeStatus === 'processing' && (
              <div className="p-6 bg-slate-900 rounded-[1.5rem] font-mono text-[9px] h-40 overflow-y-auto text-indigo-400 border border-white/5 shadow-inner">
                {nukeLogs.map((log, i) => (
                  <div key={i} className="mb-1 animate-fade-in">&gt; {log}</div>
                ))}
              </div>
            )}

            {nukeStatus === 'done' && (
              <div className="text-center py-6 animate-pop">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✓</div>
                <h4 className="text-lg font-black text-green-700 mb-6 uppercase tracking-tighter">Vault Purge Successful</h4>
                <Button onClick={() => setNukeStatus('idle')} className="w-full py-4 rounded-xl">Dismiss</Button>
              </div>
            )}
          </div>
        </Card>

      </div>

      <div className="mt-12 text-center opacity-30">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em]">System Configuration Matrix Layer v6.5</p>
      </div>
    </div>
  );
};

export default SettingsScreen;