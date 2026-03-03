
import React, { useState } from 'react';
import { UserProfile, ParentPreferences, AppView, AuthorityLevel } from '../types';
import { updateParentPreferences, linkStudentByCode } from '../services/parentService';
import Button from './ui/Button';
import Card from './ui/Card';

interface ParentOnboardingProps {
  user: UserProfile;
  onComplete: () => void;
}

const ParentOnboarding: React.FC<ParentOnboardingProps> = ({ user, onComplete }) => {
  const [step, setStep] = useState(1);
  const [intent, setIntent] = useState<ParentPreferences['learningIntent']>('BALANCED');
  const [philosophy, setPhilosophy] = useState<ParentPreferences['guidancePhilosophy']>('BALANCED');
  const [childCode, setChildCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkedName, setLinkedName] = useState<string | null>(null);

  const handleFinish = async () => {
    const prefs: ParentPreferences = {
      learningIntent: intent,
      guidancePhilosophy: philosophy,
      strictnessLevel: philosophy === 'STRICT' ? 0.8 : philosophy === 'NURTURING' ? 0.3 : 0.5,
      difficultyGrowthRate: intent === 'EXAMS' ? 0.7 : 0.4,
      hintTolerance: philosophy === 'STRICT' ? 0.2 : 0.6,
      foundationRepairThreshold: 0.8,
      rescheduleInterval: 2,
      rescheduleUnit: 'HOURS'
    };
    
    setIsLinking(true);
    try {
        await updateParentPreferences(user.id, prefs);
        onComplete();
    } catch (e) {
        alert("Failed to save mission parameters.");
    } finally {
        setIsLinking(false);
    }
  };

  const handleLink = async () => {
    if (!childCode.trim()) return;
    setIsLinking(true);
    setLinkError(null);
    
    try {
        const res = await linkStudentByCode(user.id, childCode);
        if (res.success) {
            setLinkedName(res.studentName || "Student");
            setTimeout(() => setStep(4), 1500);
        } else {
            setLinkError(res.error || "Linking failed.");
        }
    } catch (e) {
        setLinkError("Telemetry handshake failed.");
    } finally {
        setIsLinking(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 py-20 animate-fade-in text-slate-800 dark:text-slate-100">
       <div className="text-center mb-12">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white shadow-xl shadow-indigo-500/20">
             <span className="text-xl">🛰️</span>
          </div>
          <h1 className="text-3xl font-black mb-2 tracking-tight">Parent Co-Pilot Setup</h1>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest">Protocol Initialize v1.0</p>
       </div>

       {step === 1 && (
         <Card className="animate-slide-up border-indigo-500/20">
            <h3 className="text-lg font-black mb-6">Select Primary Mission Intent</h3>
            <div className="space-y-4">
               {[
                 { id: 'EXAMS', label: 'EXAM READINESS', desc: 'Focus on paper standards, strict marking, and exam patterns.' },
                 { id: 'SKILL_BUILDING', label: 'CONCEPT MASTERY', desc: 'Deep-dives into logic, exploratory learning, and retention.' },
                 { id: 'BALANCED', label: 'BALANCED GROWTH', desc: 'Mix of academic rigor and intellectual curiosity.' }
               ].map(i => (
                 <button 
                    key={i.id}
                    onClick={() => setIntent(i.id as any)}
                    className={`w-full p-6 text-left rounded-[1.5rem] border-2 transition-all ${intent === i.id ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30' : 'border-slate-100 hover:border-indigo-300 dark:border-slate-800'}`}
                 >
                    <p className={`font-black text-xs tracking-widest mb-1 ${intent === i.id ? 'text-indigo-600' : 'text-slate-400'}`}>{i.label}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{i.desc}</p>
                 </button>
               ))}
            </div>
            <div className="mt-8">
               <Button onClick={() => setStep(2)} className="w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs">Proceed to Philosophy</Button>
            </div>
         </Card>
       )}

       {step === 2 && (
         <Card className="animate-slide-up">
            <h3 className="text-lg font-black mb-6">Calibrate Guidance Philosophy</h3>
            <div className="grid grid-cols-1 gap-4">
                {[
                  { id: 'STRICT', icon: '⚖️', label: 'Strict', desc: 'Minimal scaffolding. AI expects high precision.' },
                  { id: 'BALANCED', icon: '🌓', label: 'Balanced', desc: 'Support scaled to student performance.' },
                  { id: 'NURTURING', icon: '🌱', label: 'Nurturing', desc: 'Frequent hinting. AI prioritizes confidence.' }
                ].map(p => (
                  <button 
                    key={p.id}
                    onClick={() => setPhilosophy(p.id as any)}
                    className={`p-6 flex items-center gap-5 rounded-[1.5rem] border-2 transition-all ${philosophy === p.id ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30' : 'border-slate-100 dark:border-slate-800'}`}
                  >
                     <span className="text-3xl">{p.icon}</span>
                     <div className="text-left">
                        <p className="font-bold text-lg">{p.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{p.desc}</p>
                     </div>
                  </button>
                ))}
            </div>
            <div className="mt-8 flex gap-3">
               <Button variant="outline" onClick={() => setStep(1)} className="flex-1 rounded-xl">Back</Button>
               <Button onClick={() => setStep(3)} className="flex-[2] rounded-xl font-black uppercase tracking-widest text-xs">Final Step: Link Student</Button>
            </div>
         </Card>
       )}

       {step === 3 && (
         <Card className="animate-slide-up border-indigo-500/20">
            <h3 className="text-lg font-black mb-2">Establish Telemetry Link</h3>
            <p className="text-sm text-slate-500 mb-8">Enter the 6-digit link code found on your child's profile.</p>
            
            {linkError && (
                <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-xs font-black border border-red-100 animate-shake">
                   ⚠️ {linkError}
                </div>
            )}

            {linkedName ? (
                <div className="mb-8 p-10 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-[2rem] border-2 border-dashed border-green-200 dark:border-green-800 text-center animate-pop">
                    <span className="text-5xl block mb-4">🤝</span>
                    <p className="text-xl font-black">Linked to {linkedName}!</p>
                    <p className="text-xs font-bold uppercase tracking-widest mt-2 opacity-60">Telemetry Active</p>
                </div>
            ) : (
                <input 
                    className="w-full p-8 text-4xl font-mono text-center tracking-[0.4em] uppercase rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-900 mb-8 focus:border-indigo-500 outline-none shadow-inner"
                    placeholder="------"
                    value={childCode}
                    maxLength={6}
                    onChange={e => setChildCode(e.target.value.toUpperCase())}
                />
            )}

            <div className="space-y-4">
                {!linkedName && (
                    <Button onClick={handleLink} isLoading={isLinking} className="w-full py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-xl">Handshake Link</Button>
                )}
                <button onClick={() => setStep(4)} className="w-full text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] hover:text-indigo-600 transition-colors">
                    {linkedName ? "Finalize" : "Configure without linking"}
                </button>
            </div>
         </Card>
       )}

       {step === 4 && (
           <Card className="animate-slide-up text-center py-12">
               <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mx-auto mb-8 relative">
                  <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                  <span className="text-4xl">🛸</span>
               </div>
               <h3 className="text-2xl font-black mb-3">Mission Interface Ready</h3>
               <p className="text-slate-500 dark:text-slate-400 text-sm px-6 mb-10 leading-relaxed font-medium">Initial parameters uploaded. You now have Monitor Level authority. You can escalate to Co-Pilot controls from the main interface.</p>
               <Button onClick={handleFinish} isLoading={isLinking} className="w-full py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs bg-indigo-600">Activate Cockpit</Button>
           </Card>
       )}
    </div>
  );
};

export default ParentOnboarding;
