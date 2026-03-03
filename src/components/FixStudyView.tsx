
import React from 'react';
import { FixStudyData, Language } from '../types';
import Button from './ui/Button';
import Card from './ui/Card';

interface FixStudyViewProps {
    data: FixStudyData;
    onProceed: () => void;
    onBack: () => void;
    appLanguage: Language;
}

const FixStudyView: React.FC<FixStudyViewProps> = ({ data, onProceed, onBack, appLanguage }) => {
    const isArabic = appLanguage === Language.ARABIC;

    return (
        <div className="max-w-3xl mx-auto py-10 px-4 animate-fade-in" dir={isArabic ? 'rtl' : 'ltr'}>
            <div className="flex justify-between items-center mb-8">
                <button onClick={onBack} className="text-slate-400 hover:text-slate-600 font-black text-xs uppercase tracking-widest">
                    ✕ {isArabic ? 'خروج' : 'Exit Mission'}
                </button>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
                    <span className="text-[10px] font-black uppercase text-orange-600 tracking-widest">Step 1: Specialized Study</span>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border-t-8 border-orange-500 overflow-hidden">
                <div className="p-8 lg:p-12 bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/20 dark:to-slate-900">
                    <div className="inline-block px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-[10px] font-black uppercase tracking-widest mb-6">
                        {data.subject} • {data.conceptTag}
                    </div>
                    <h1 className="text-3xl lg:text-5xl font-black text-slate-800 dark:text-white mb-6 leading-tight">
                        {isArabic ? 'إصلاح المفاهيم: ' : 'Foundation Repair: '} {data.conceptTag}
                    </h1>
                    
                    <div className="prose dark:prose-invert max-w-none">
                        <div className="text-lg text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-medium">
                            {data.notesContent}
                        </div>
                    </div>
                </div>

                <div className="p-8 lg:p-12 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center text-2xl shadow-sm">💡</div>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 max-w-xs">
                            {isArabic 
                                ? 'لقد راجعنا الأساسيات. هل أنت جاهز للتحقق من فهمك من خلال اختبار سريع؟' 
                                : "We've rebuilt the basics. Ready to verify your understanding with a quick 5-question check?"}
                        </p>
                    </div>
                    <Button 
                        onClick={onProceed} 
                        className="w-full md:w-auto px-12 py-5 bg-orange-600 hover:bg-orange-700 rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-2xl transition-all hover:scale-105 active:scale-95"
                    >
                        {isArabic ? 'ابدأ الاختبار التحققي ←' : 'Verify My Mastery →'}
                    </Button>
                </div>
            </div>
            
            <div className="mt-8 text-center opacity-30">
                <p className="text-[8px] font-black uppercase tracking-[0.4em]">UCCS CLIP Protocol v6.5 • Mission ID: {data.fixMissionId.slice(-6)}</p>
            </div>
        </div>
    );
};

export default FixStudyView;
