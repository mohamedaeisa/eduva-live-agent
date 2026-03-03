import React from 'react';

interface GeneratorHeaderProps {
    title: string;
    onBack: () => void;
    onExit: () => void;
}

export const GeneratorHeader: React.FC<GeneratorHeaderProps> = ({ title, onBack, onExit }) => {
    return (
        <div className="flex items-center justify-between px-4 py-4 mb-6 sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-[60]">
            {/* Back Button */}
            <button
                onClick={onBack}
                className="w-10 h-10 rounded-full bg-indigo-50/80 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 transition-all shadow-sm active:scale-95 group"
                aria-label="Back"
            >
                <svg className="w-5 h-5 transform group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
            </button>

            {/* Title */}
            <div className="flex flex-col items-center px-2 text-center max-w-[50%]">
                <h1 className="text-base sm:text-lg md:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 dark:from-indigo-400 dark:via-purple-400 dark:to-indigo-400 uppercase tracking-widest leading-tight">
                    {title}
                </h1>
            </div>

            {/* Exit Button */}
            <button
                onClick={onExit}
                className="px-4 py-1.5 rounded-xl bg-purple-50/80 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/50 text-[10px] font-black uppercase tracking-[0.2em] text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-all active:scale-95"
            >
                Exit
            </button>
        </div>
    );
};

export default GeneratorHeader;
