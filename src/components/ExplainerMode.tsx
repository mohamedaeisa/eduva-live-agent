
import React, { useState } from 'react';
import { Language } from '../types';
import { generateExplanation } from '../services/geminiService';
import Button from './ui/Button';
import Card from './ui/Card';
import { logEvent } from '../services/analyticsService';

interface ExplainerProps {
  appLanguage: Language;
  onBack: () => void;
}

const ExplainerMode: React.FC<ExplainerProps> = ({ appLanguage, onBack }) => {
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<'ELI5' | 'Deep'>('ELI5');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleExplain = async () => {
    if (!topic) return;
    setLoading(true);
    
    logEvent("Explainer Query", `Topic: ${topic} | Mode: ${mode}`);

    try {
      const data = await generateExplanation(topic, mode, appLanguage);
      setResult(data);
    } catch (e) {
      alert("Error generating explanation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 pb-20 animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <h1 className="font-black text-2xl text-slate-800 dark:text-white">Explainer Mode</h1>
      </div>

      {/* Toggle Switch */}
      <div className="bg-slate-200 dark:bg-slate-800 p-2 rounded-full flex relative mb-8 cursor-pointer shadow-inner" onClick={() => setMode(m => m === 'ELI5' ? 'Deep' : 'ELI5')}>
         <div className={`absolute top-2 bottom-2 w-[calc(50%-8px)] bg-white shadow-md rounded-full transition-all duration-300 ease-spring ${mode === 'ELI5' ? 'left-2' : 'left-[calc(50%+4px)]'}`}></div>
         <div className={`flex-1 text-center relative z-10 font-bold text-sm py-2 transition-colors ${mode === 'ELI5' ? 'text-brand-600' : 'text-slate-500'}`}>
            👶 Explain Like I'm 5
         </div>
         <div className={`flex-1 text-center relative z-10 font-bold text-sm py-2 transition-colors ${mode === 'Deep' ? 'text-blue-600' : 'text-slate-500'}`}>
            👨‍🏫 Professor Mode
         </div>
      </div>

      {/* Input */}
      <div className="flex gap-2 mb-8">
         <input 
           className="flex-grow p-4 rounded-xl border border-slate-300 dark:bg-slate-800 dark:border-slate-600 text-lg outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
           placeholder={mode === 'ELI5' ? "e.g. Why is the sky blue?" : "e.g. Quantum Entanglement"}
           value={topic}
           onChange={e => setTopic(e.target.value)}
           onKeyDown={e => e.key === 'Enter' && handleExplain()}
         />
         <Button size="lg" onClick={handleExplain} isLoading={loading}>Explain</Button>
      </div>

      {/* Result */}
      {result && (
        <Card className={`animate-slide-up border-t-8 ${mode === 'ELI5' ? 'border-brand-400' : 'border-blue-800 bg-slate-50 dark:bg-slate-900'}`}>
           <h2 className="text-2xl font-black mb-4 capitalize">{result.topic}</h2>
           
           <div className="prose dark:prose-invert max-w-none text-lg leading-relaxed">
              {result.content}
           </div>

           {/* Special Sections */}
           {mode === 'ELI5' && result.analogy && (
             <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-xl border border-yellow-200 dark:border-yellow-800">
                <span className="font-bold text-yellow-700 dark:text-yellow-400 text-xs uppercase tracking-wider">Key Analogy</span>
                <p className="text-slate-700 dark:text-slate-300 italic font-medium mt-1">"{result.analogy}"</p>
             </div>
           )}

           {mode === 'Deep' && result.citations && (
             <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-700">
                <h4 className="font-serif font-bold text-sm text-slate-500 mb-2">References</h4>
                <ul className="list-disc ml-4 text-xs text-slate-500 font-serif">
                   {result.citations.map((c: string, i: number) => <li key={i}>{c}</li>)}
                </ul>
             </div>
           )}

           {/* Viral Share */}
           <div className="mt-8 flex justify-center">
              <button className="text-sm font-bold text-brand-600 hover:underline flex items-center gap-2">
                 <span>📤</span> Share this explanation
              </button>
           </div>
        </Card>
      )}
    </div>
  );
};

export default ExplainerMode;
