import React, { useState, useEffect, useMemo } from 'react';
import { 
  UserProfile, Language, LocalTrainingSource, 
  Difficulty, QuizType, DetailLevel, AppView
} from '../../types';
import { getLocalTrainingSources } from '../../services/storageService';
import Button from '../ui/Button';
import Card from '../ui/Card';

interface PracticeMatrixV2Props {
  user: UserProfile;
  appLanguage: Language;
  onLaunch: (req: any) => void;
}

const PracticeMatrixV2: React.FC<PracticeMatrixV2Props> = ({ user, appLanguage, onLaunch }) => {
  const [sources, setSources] = useState<LocalTrainingSource[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>(user.preferences.defaultSubject || user.preferences.subjects[0]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => { loadSources(); }, [user.id]);

  const loadSources = async () => {
    const data = await getLocalTrainingSources(user.id);
    setSources(data);
  };

  const currentSubjectSources = useMemo(() => {
      return sources.filter(s => s.subject === selectedSubject).sort((a,b) => {
          if (a.status === 'Completed' && b.status !== 'Completed') return -1;
          return b.createdAt - a.createdAt;
      });
  }, [sources, selectedSubject]);

  const toggleDoc = (hash: string) => {
    setSelectedDocIds(prev => {
        const next = new Set(prev);
        if (next.has(hash)) next.delete(hash);
        else next.add(hash);
        return next;
    });
  };

  const handleLaunch = () => {
    if (selectedDocIds.size === 0) return;
    onLaunch({
        year: user.preferences.defaultYear,
        curriculum: user.preferences.defaultCurriculum,
        subject: selectedSubject,
        topic: `Matrix: ${selectedSubject}`,
        mode: 'quiz',
        language: appLanguage,
        difficulty: Difficulty.MEDIUM,
        detailLevel: DetailLevel.DETAILED,
        quizType: QuizType.MIX,
        questionCount: 10,
        selectedDocumentIds: Array.from(selectedDocIds),
        quizMode: 'PRACTICE'
    });
  };

  return (
    <div className="max-w-xl mx-auto p-4 animate-fade-in pb-44 pt-6 flex flex-col min-h-screen">
      <div className="mb-10 text-center lg:text-left">
        <h1 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter leading-none">Practice Matrix</h1>
        <p className="text-slate-400 font-bold text-sm mt-3 uppercase tracking-widest">Select your knowledge vaults to begin simulation.</p>
      </div>
      
      <div className="space-y-10">
          <section className="space-y-4">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">1. Select Domain</label>
              <select 
                  className="w-full p-5 rounded-[1.5rem] border-2 border-slate-100 bg-white text-xl font-black text-slate-800 outline-none focus:border-indigo-500 shadow-xl transition-all"
                  value={selectedSubject}
                  onChange={(e) => { setSelectedSubject(e.target.value); setSelectedDocIds(new Set()); }}
              >
                  {user.preferences.subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
          </section>

          <section className="space-y-4">
              <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">2. Select Trained Material</label>
                  <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{selectedDocIds.size} Selected</span>
              </div>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                  {currentSubjectSources.length > 0 ? (
                      currentSubjectSources.map(s => (
                          <div 
                              key={s.fileHash}
                              onClick={() => s.status === 'Completed' && toggleDoc(s.fileHash)}
                              className={`p-5 rounded-[1.5rem] border-2 transition-all cursor-pointer flex items-center justify-between group ${
                                  selectedDocIds.has(s.fileHash) 
                                  ? 'border-indigo-600 bg-indigo-50/10 shadow-lg' 
                                  : 'border-slate-100 bg-white opacity-80 hover:opacity-100 hover:border-indigo-200'
                              } ${s.status !== 'Completed' ? 'grayscale opacity-40 cursor-not-allowed' : ''}`}
                          >
                              <div className="min-w-0 flex-grow pr-4">
                                  <p className={`font-black text-sm lg:text-base truncate ${selectedDocIds.has(s.fileHash) ? 'text-indigo-900' : 'text-slate-800'}`}>{s.fileName}</p>
                                  <div className="flex items-center gap-2 mt-1.5">
                                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${s.status === 'Completed' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-slate-100 text-slate-400'}`}>
                                          {s.status === 'Completed' ? 'Knowledge Verified' : 'Untrained'}
                                      </span>
                                      {s.status === 'Completed' && (
                                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Density: {s.trustScore}%</span>
                                      )}
                                  </div>
                              </div>
                              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                                  selectedDocIds.has(s.fileHash) ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'border-slate-200'
                              }`}>
                                  {selectedDocIds.has(s.fileHash) && <span className="text-xs">✓</span>}
                              </div>
                          </div>
                      ))
                  ) : (
                      <div className="py-20 text-center border-4 border-dashed border-slate-100 rounded-[3rem] bg-slate-50/50">
                          <span className="text-5xl block mb-6 opacity-20">🌫️</span>
                          <p className="text-slate-400 font-black text-xs uppercase tracking-[0.3em]">No Material Found</p>
                          <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase">Train your PDFs in Library to unlock the matrix.</p>
                      </div>
                  )}
              </div>
          </section>

          <Button 
              onClick={handleLaunch} 
              disabled={selectedDocIds.size === 0 || isProcessing}
              className="w-full py-7 rounded-[2rem] bg-indigo-600 text-white font-black uppercase tracking-[0.4em] text-xs shadow-2xl transition-all hover:scale-[1.02] active:scale-95 disabled:grayscale disabled:opacity-30 border-none"
          >
              {selectedDocIds.size === 0 ? "Select Material to Start" : "Launch Neural Simulation"}
          </Button>
      </div>
    </div>
  );
};

export default PracticeMatrixV2;