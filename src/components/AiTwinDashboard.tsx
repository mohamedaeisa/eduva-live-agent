
import React, { useState, useEffect } from 'react';
import { UserProfile, HistoryItem, QuizResult, AiTwinProfile } from '../types';
import { generateAiTwinProfile } from '../services/geminiService';
import { getHistory, getQuizResults } from '../services/storageService';
import Button from './ui/Button';
import Card from './ui/Card';

interface AiTwinProps {
  user: UserProfile;
  onBack: () => void;
}

const AiTwinDashboard: React.FC<AiTwinProps> = ({ user, onBack }) => {
  const [profile, setProfile] = useState<AiTwinProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initTwin = async () => {
      try {
        const history = await getHistory(user.id);
        const results = await getQuizResults(user.id);
        const data = await generateAiTwinProfile(user, history, results);
        setProfile(data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    initTwin();
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
        <div className="text-6xl mb-6 animate-bounce">🧬</div>
        <h2 className="text-2xl font-black text-brand-600">Cloning Your Brain...</h2>
        <p className="text-slate-500">Analyzing study patterns and mistakes.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 pb-20 animate-slide-up">
      <div className="flex justify-between items-center mb-8">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
          <span className="text-3xl">🧬</span> Study AI Twin
        </h1>
      </div>

      {profile && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* 1. Identity Card */}
          <Card className="md:col-span-1 bg-gradient-to-br from-slate-900 to-slate-800 text-white border-slate-700">
             <div className="text-center mb-6">
                <div className="w-24 h-24 bg-brand-500 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl shadow-lg shadow-brand-500/50 border-4 border-white/10">
                   🤖
                </div>
                <h2 className="text-xl font-bold">Digital {user.name}</h2>
                <p className="text-slate-400 text-sm uppercase tracking-widest mt-1">{profile.learningStyle}</p>
             </div>
             <div className="space-y-4">
                <div>
                   <h4 className="text-xs font-bold uppercase text-slate-500 mb-2">Predicted Grades</h4>
                   <div className="grid grid-cols-2 gap-2">
                      {Object.entries(profile.predictedGrades || {}).map(([subj, grade]) => (
                        <div key={subj} className="bg-white/10 p-2 rounded-lg flex justify-between items-center">
                           <span className="text-xs">{subj}</span>
                           <span className={`font-black ${(grade as string).includes('A') ? 'text-green-400' : (grade as string).includes('B') ? 'text-yellow-400' : 'text-red-400'}`}>{grade as string}</span>
                        </div>
                      ))}
                   </div>
                </div>
             </div>
          </Card>

          {/* 2. The Kill List */}
          <Card className="md:col-span-2 border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900">
             <h3 className="text-xl font-black text-red-700 dark:text-red-400 mb-4 flex items-center gap-2">
                <span>💀</span> The "Kill List"
             </h3>
             <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                These are the topics I predict you will FAIL if you don't review them now.
             </p>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {profile.killList?.map((topic, i) => (
                   <div key={i} className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-red-100 dark:border-red-900/50">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{topic}</span>
                      <Button size="sm" variant="danger" className="text-xs px-3 py-1">Fix This</Button>
                   </div>
                ))}
             </div>
          </Card>

          {/* 3. Smart Schedule */}
          <Card className="md:col-span-3">
             <h3 className="text-lg font-bold mb-6">📅 AI Optimized Schedule</h3>
             <div className="flex flex-col md:flex-row gap-4 overflow-x-auto pb-2">
                {profile.dailySchedule?.map((slot, i) => (
                   <div key={i} className="min-w-[200px] flex-1 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center relative group">
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-200 dark:bg-slate-700 px-3 py-1 rounded-full text-xs font-bold">
                         {slot.time}
                      </div>
                      <div className={`mt-4 mb-2 text-2xl p-3 rounded-full ${slot.type === 'break' ? 'bg-green-100 text-green-600' : 'bg-indigo-100 text-indigo-600'}`}>
                         {slot.type === 'break' ? '☕' : '📚'}
                      </div>
                      <p className="font-bold text-sm">{slot.activity}</p>
                   </div>
                ))}
             </div>
          </Card>

        </div>
      )}
    </div>
  );
};

export default AiTwinDashboard;
