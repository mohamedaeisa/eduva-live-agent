import React from 'react';
import { Language, AtomViewModel } from '../types';
import Card from './ui/Card';
import katex from 'katex';

interface CheatSheetViewProps {
    atom: AtomViewModel;
    appLanguage: Language;
    onStartDrill: () => void;
    onBack: () => void;
}

const CheatSheetView: React.FC<CheatSheetViewProps> = ({ atom, appLanguage, onStartDrill, onBack }) => {
    const isArabic = appLanguage === Language.ARABIC;
    const { core, studentState } = atom;

    const renderFormula = (formula: string) => {
        if (!formula) return null;
        try {
            const words = formula.trim().split(/\s+/);
            const isText = words.length > 2 && !formula.includes('\\') && !formula.includes('$');
            
            if (isText) {
                return <p className="text-lg font-bold text-emerald-400 py-4 text-center leading-relaxed whitespace-pre-wrap">{formula}</p>;
            }
            
            const html = katex.renderToString(formula, { throwOnError: false });
            return <div dangerouslySetInnerHTML={{ __html: html }} className="text-lg font-mono text-emerald-400 py-4 text-center" />;
        } catch (e) {
            return <p className="text-center font-mono text-emerald-400 py-4 whitespace-pre-wrap">{formula}</p>;
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-10 px-4 animate-fade-in" dir={isArabic ? 'rtl' : 'ltr'}>
            <button onClick={onBack} className="bg-white dark:bg-slate-800 px-6 py-2.5 rounded-2xl shadow-md font-bold mb-8 flex items-center gap-2 border border-slate-100 dark:border-slate-700 transition-transform active:scale-95">
               ← Back
            </button>

            <div className="mb-10">
                <div className="flex items-center gap-2 text-pink-500 mb-2">
                    <span>⚡</span>
                    <span className="text-xs font-black uppercase tracking-[0.2em]">Quick Study</span>
                </div>
                <h1 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter mb-2">{core.metadata.conceptTag}</h1>
                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Concept ID: #{core.atomId.slice(-4)} • {core.metadata.subject}</p>
            </div>

            <div className="space-y-6 pb-64 md:pb-40">
                <Card className="bg-blue-50 dark:bg-blue-900/10 border-2 border-blue-100 dark:border-blue-900/30 rounded-[2.5rem] p-8 md:p-10 relative overflow-hidden shadow-none">
                    <div className="absolute top-8 left-8 text-blue-200 dark:text-blue-900/30 text-3xl">📖</div>
                    <div className="relative z-10 pl-10">
                        <h4 className="text-blue-800 dark:text-blue-400 font-black text-lg mb-4 uppercase tracking-widest">Definition</h4>
                        <p className="text-blue-900 dark:text-blue-100 text-xl font-bold leading-relaxed">
                            {core.coreRepresentation.definition}
                        </p>
                    </div>
                </Card>

                <Card className="p-8 md:p-10 rounded-[2.5rem] bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 shadow-none">
                    <div className="flex justify-between items-center mb-6">
                        <h4 className="font-black text-lg text-slate-800 dark:text-white uppercase tracking-widest">Key Rule</h4>
                        <span className="bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 text-[9px] font-black px-3 py-1 rounded-full uppercase">Logic</span>
                    </div>
                    
                    <div className="bg-slate-900 rounded-[2rem] p-8 shadow-inner mb-6 flex items-center justify-center min-h-[120px]">
                         {renderFormula(core.coreRepresentation.keyRule || 'No specific formula required')}
                    </div>

                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium leading-relaxed italic text-center px-4">
                        {core.coreRepresentation.primaryExample}
                    </p>
                </Card>

                <Card className="bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-100 dark:border-amber-900/30 rounded-[2.5rem] p-8 md:p-10 shadow-none">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 bg-amber-200 dark:bg-amber-900/40 rounded-full flex items-center justify-center text-2xl shadow-inner">💡</div>
                        <h4 className="font-black text-lg text-amber-800 dark:text-amber-400 uppercase tracking-widest">Pro Tip</h4>
                    </div>
                    <p className="text-amber-900 dark:text-amber-100 text-xl font-bold leading-relaxed">
                        {core.extendedRepresentation.proTips?.[0] || "Maintain conceptual precision to maximize marking potential."}
                    </p>
                </Card>
            </div>

            <div className="fixed bottom-20 md:bottom-6 left-0 right-0 p-6 md:p-8 bg-gradient-to-t from-white dark:from-slate-950 via-white/80 dark:via-slate-950/80 to-transparent z-[110] pb-safe">
                <button 
                  onClick={onStartDrill}
                  className="w-full max-w-lg mx-auto block py-6 rounded-3xl bg-gradient-to-r from-fuchsia-400 to-purple-600 text-white font-black uppercase tracking-[0.3em] text-xs shadow-2xl shadow-purple-500/40 transform transition-all hover:scale-[1.02] active:scale-95 border-none"
                >
                  Start Drill <span className="bg-white/30 px-3 py-1 rounded-full ml-3">5 Questions</span>
                </button>
            </div>
        </div>
    );
};

export default CheatSheetView;