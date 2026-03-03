
import React, { useState, useEffect, useRef } from 'react';
// Fix: Removed non-existent AtomLocalStatus from imports.
import { UserProfile, Language, LocalTrainingSource, EducationSystem, Difficulty, QuizType, DetailLevel, GenerationRequest } from '../types';
import { saveLocalAtoms, getLocalTrainingSources, saveLocalTrainingSource, deleteLocalTrainingSource, deleteLocalAtomsByContent } from '../services/storageService';
import { extractAtomsFromDocument } from '../services/ai/atomExtractionService';
import { computeDocFingerprint } from '../utils/fingerprintUtils';
import Button from './ui/Button';
import Card from './ui/Card';
import AlertModal from './ui/AlertModal';

interface AtomTrainingDashboardProps {
  user: UserProfile;
  appLanguage: Language;
  onBack: () => void;
}

const AtomTrainingDashboard: React.FC<AtomTrainingDashboardProps> = ({ user, appLanguage, onBack }) => {
  const [sources, setSources] = useState<LocalTrainingSource[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [viewingError, setViewingError] = useState<LocalTrainingSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSources();
  }, [user.id]);

  const loadSources = async () => {
    setIsLoadingSources(true);
    try {
        const data = await getLocalTrainingSources(user.id);
        setSources(data.sort((a, b) => b.createdAt - a.createdAt));
    } finally {
        setIsLoadingSources(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    setIsUploading(true);
    const newSources: LocalTrainingSource[] = [];

    for (const file of files) {
      // 1. Generate Canonical Fingerprint (Matches Atom Extraction Logic)
      const fingerprint = await computeDocFingerprint(file);
      
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      
      const source: LocalTrainingSource = {
        id: `src_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        studentId: user.id,
        educationSystem: user.preferences.defaultCurriculum,
        grade: user.preferences.defaultYear,
        subject: user.preferences.defaultSubject, 
        fileName: file.name,
        fileHash: fingerprint, // FIXED: Now uses consistent fingerprinting
        status: 'Pending',
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: fileData
      };

      newSources.push(source);
      await saveLocalTrainingSource(source);
    }

    setSources(prev => [...newSources, ...prev]);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleTrainSelected = async () => {
    const toTrain = sources.filter(s => selectedIds.has(s.id) && s.status !== 'Completed');
    if (toTrain.length === 0) return;

    setActiveJobId(`job_${Date.now()}`);
    
    for (const source of toTrain) {
      const updatedSource: LocalTrainingSource = { ...source, status: 'Training', progress: 5, error: undefined };
      setSources(prev => prev.map(s => s.id === source.id ? updatedSource : s));
      await saveLocalTrainingSource(updatedSource);

      try {
        const req: GenerationRequest = {
          year: source.grade,
          curriculum: source.educationSystem as EducationSystem,
          subject: source.subject,
          topic: source.fileName,
          mode: 'atom_extraction',
          language: appLanguage,
          difficulty: Difficulty.MEDIUM,
          detailLevel: DetailLevel.DETAILED,
          quizType: QuizType.MIX,
          questionCount: 0,
          studyMaterialFile: source.data,
          studyMaterialUrl: source.fileHash,
          fileName: source.fileName
        };

        const atoms = await extractAtomsFromDocument(req, user, (msg) => {
          setSources(prev => prev.map(s => {
            if (s.id === source.id) {
               const newProgress = Math.min(95, s.progress + 15);
               return { ...s, progress: newProgress };
            }
            return s;
          }));
        });

        // Fix: Added required 'notes' feature argument to saveLocalAtoms
        await saveLocalAtoms(atoms, 'notes');

        // Fix: Property 'trustScore' is at top level of AtomCore, not in metadata
        const avgTrust = atoms.length > 0 ? (atoms.reduce((acc, a) => acc + a.trustScore, 0) / atoms.length) : 1;
        const finalSource: LocalTrainingSource = { 
          ...source, 
          status: 'Completed', 
          progress: 100, 
          trustScore: Math.round(avgTrust * 100), // Scale to percentage
          updatedAt: Date.now() 
        };
        setSources(prev => prev.map(s => s.id === source.id ? finalSource : s));
        await saveLocalTrainingSource(finalSource);

      } catch (err: any) {
        console.error(err);
        const failedSource: LocalTrainingSource = { 
            ...source, 
            status: 'Failed', 
            progress: 0,
            updatedAt: Date.now(),
            error: err.message || "Knowledge extraction failed."
        };
        setSources(prev => prev.map(s => s.id === source.id ? failedSource : s));
        await saveLocalTrainingSource(failedSource);
      }
    }
    
    setActiveJobId(null);
    setSelectedIds(new Set());
  };

  const handleUntrain = async (id: string) => {
    const source = sources.find(s => s.id === id);
    if (!source) return;

    if (confirm(`Untrain "${source.fileName}"? This will delete all local knowledge atoms derived from this file.`)) {
      await deleteLocalAtomsByContent(source.fileHash);
      const resetSource: LocalTrainingSource = { ...source, status: 'Pending', progress: 0, trustScore: undefined, error: undefined };
      setSources(prev => prev.map(s => s.id === id ? resetSource : s));
      await saveLocalTrainingSource(resetSource);
    }
  };

  const handleDeleteSource = async (id: string) => {
    if (confirm("Remove this file from the training matrix? Local atoms will remain unless you 'Untrain' first.")) {
      await deleteLocalTrainingSource(id);
      setSources(prev => prev.filter(s => s.id !== id));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const updateSourceSubject = async (id: string, subject: string) => {
    const source = sources.find(s => s.id === id);
    if (source) {
      const updated = { ...source, subject };
      setSources(prev => prev.map(s => s.id === id ? updated : s));
      await saveLocalTrainingSource(updated);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 animate-fade-in pb-32 pt-8">
      {viewingError && (
        <AlertModal 
          isOpen={!!viewingError}
          title="Extraction Fault"
          message={viewingError.error || "Neural synthesis interrupted."}
          faultCode={viewingError.id.split('_').pop()}
          remedy="Ensure the PDF text is selectable and the subject is correctly assigned."
          type="error"
          onClose={() => setViewingError(null)}
        />
      )}

      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-800 dark:text-white">Train Learning Content</h1>
          <p className="text-slate-500 text-lg mt-1">Prepare content once. Use it forever.</p>
        </div>
        <div className="flex gap-3">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf" multiple />
          <Button variant="outline" onClick={onBack}>← Back</Button>
          <Button onClick={() => fileInputRef.current?.click()} isLoading={isUploading}>
            {isUploading ? "Uploading..." : "➕ Add PDFs"}
          </Button>
        </div>
      </div>

      <div className="bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl mb-10 flex items-center justify-between border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 text-7xl">🧬</div>
          <div className="flex gap-12 relative z-10">
              <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] mb-1">Education System</p>
                  <p className="text-lg font-black tracking-tight">{user.preferences.defaultCurriculum}</p>
              </div>
              <div className="w-px h-10 bg-white/10"></div>
              <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] mb-1">Grade Level</p>
                  <p className="text-lg font-black tracking-tight">{user.preferences.defaultYear}</p>
              </div>
          </div>
          <div className="text-right">
              <p className="text-[10px] font-black uppercase text-indigo-400 tracking-[0.3em] mb-1">Matrix Status</p>
              <p className="text-lg font-black">{sources.length} Indexed Documents</p>
          </div>
      </div>

      <Card className="p-0 overflow-hidden border-2 border-slate-100 dark:border-slate-800 shadow-2xl rounded-[2.5rem]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] border-b border-slate-100 dark:border-slate-800">
                <th className="p-6 w-16 text-center">
                    <input 
                      type="checkbox" 
                      className="w-5 h-5 rounded border-slate-300 accent-indigo-600"
                      checked={selectedIds.size === sources.length && sources.length > 0}
                      onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(sources.map(s => s.id)));
                          else setSelectedIds(new Set());
                      }}
                    />
                </th>
                <th className="p-6">Subject</th>
                <th className="p-6">Source File</th>
                <th className="p-6">Local Status</th>
                <th className="p-6 text-center">Trust Score</th>
                <th className="p-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoadingSources ? (
                  <tr>
                    <td colSpan={6} className="p-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs font-bold text-slate-400 uppercase">Synchronizing Matrix...</span>
                        </div>
                    </td>
                  </tr>
              ) : sources.map(source => (
                <tr key={source.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                  <td className="p-6 text-center">
                    <input 
                        type="checkbox" 
                        disabled={source.status === 'Training'}
                        checked={selectedIds.has(source.id)}
                        onChange={() => toggleSelect(source.id)}
                        className="w-5 h-5 rounded border-slate-300 accent-indigo-600 cursor-pointer"
                    />
                  </td>
                  <td className="p-6">
                    <select 
                        disabled={source.status === 'Completed' || source.status === 'Training'}
                        className="bg-transparent font-black text-indigo-600 outline-none cursor-pointer disabled:cursor-default"
                        value={source.subject}
                        onChange={(e) => updateSourceSubject(source.id, e.target.value)}
                    >
                        {user.preferences.subjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="p-6">
                    <p className="font-bold text-slate-800 dark:text-white truncate max-w-[200px]" title={source.fileName}>{source.fileName}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-1 opacity-60">{source.fileHash.substring(0, 12)}...</p>
                  </td>
                  <td className="p-6">
                    <div className="flex flex-col gap-2 min-w-[140px]">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase">
                            {source.status === 'Failed' ? (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setViewingError(source); }}
                                    className="text-red-600 hover:underline flex items-center gap-1"
                                >
                                    Fault Detected ⚠️
                                </button>
                            ) : (
                                <span className={source.status === 'Completed' ? 'text-green-600' : source.status === 'Training' ? 'text-indigo-600 animate-pulse' : 'text-slate-400'}>
                                    {source.status === 'Completed' ? 'Completed ✔' : source.status === 'Training' ? 'Training...' : 'Pending ⏳'}
                                </span>
                            )}
                            {source.status === 'Training' && <span className="text-indigo-600">{Math.round(source.progress)}%</span>}
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div 
                                className={`h-full transition-all duration-1000 ${source.status === 'Completed' ? 'bg-green-50' : source.status === 'Failed' ? 'bg-red-50' : 'bg-indigo-600'}`} 
                                style={{ width: source.status === 'Failed' ? '100%' : `${source.progress}%` }}
                            ></div>
                        </div>
                    </div>
                  </td>
                  <td className="p-6 text-center">
                    {source.trustScore !== undefined ? (
                        <div className={`text-sm font-black ${source.trustScore >= 80 ? 'text-emerald-500' : source.trustScore >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                            {source.trustScore}%
                        </div>
                    ) : (
                        <span className="text-slate-300 font-black">-</span>
                    )}
                  </td>
                  <td className="p-6 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {source.status === 'Completed' && (
                            <button 
                                onClick={() => handleUntrain(source.id)}
                                className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 transition-all"
                            >
                                Untrain
                            </button>
                        )}
                        <button 
                            disabled={source.status === 'Training'}
                            onClick={() => handleDeleteSource(source.id)}
                            className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                            title="Delete Source"
                        >
                            🗑️
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoadingSources && sources.length === 0 && (
                  <tr>
                      <td colSpan={6} className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
                          Matrix Empty. Upload PDFs to start training.
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-6 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <div className="text-[10px] font-black uppercase text-slate-400">
                Selected: <span className="text-indigo-600">{selectedIds.size}</span> Documents
            </div>
            <Button 
                disabled={selectedIds.size === 0 || !!activeJobId}
                onClick={handleTrainSelected}
                className="px-12 py-4 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl"
            >
                {activeJobId ? "Batch Processing..." : "🚀 Train Selected"}
            </Button>
        </div>
      </Card>

      <div className="mt-8 p-6 bg-indigo-50 dark:bg-indigo-900/10 rounded-[2rem] border border-indigo-100 dark:border-indigo-800 flex items-start gap-4">
          <span className="text-2xl mt-1">🔒</span>
          <div>
              <p className="text-xs font-black text-indigo-900 dark:text-indigo-200 uppercase tracking-widest mb-1">Privacy & Security Gate</p>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400 leading-relaxed">
                  Knowledge extraction happens strictly for your private profile. Global synchronization is an asynchronous background process that only triggers for verified, high-trust content and is subject to admin moderation.
              </p>
          </div>
      </div>
    </div>
  );
};

export default AtomTrainingDashboard;
