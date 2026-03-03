import React, { useEffect, useState } from 'react';

interface ProgressLoaderProps {
    isVisible: boolean;
    messages?: string[];
    interval?: number;
}

const DEFAULT_MESSAGES = [
    "Preparing your material...",
    "Checking Knowledge Matrix...",
    "Qualifying Pure Knowledge...",
    "Verifying Learning Protocol...",
    "Synchronizing Neuro-Vault..."
];

const ProgressLoader: React.FC<ProgressLoaderProps> = ({
    isVisible,
    messages = DEFAULT_MESSAGES,
    interval = 2000
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (!isVisible) {
            setCurrentIndex(0);
            return;
        }

        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % messages.length);
        }, interval);

        return () => clearInterval(timer);
    }, [isVisible, interval, messages.length]);

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in">
            {/* Backdrop with Blur */}
            <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-md" />

            {/* Visual Card - "Small Info Screen" */}
            <div className="relative bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 border border-white/50 dark:border-slate-700/50 flex flex-col items-center gap-6 animate-pop">

                {/* Brand / Logo Animation - Brain Waves */}
                <div className="relative">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-500/40">
                        {/* Brain Icon */}
                        <svg className="w-10 h-10 text-white drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3M3.343 15.657l.707-.707m16.5 0l-.707.707M6 12a6 6 0 1110.492 0" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" />
                        </svg>

                        {/* Pulse Ring */}
                        <div className="absolute inset-0 rounded-3xl border-2 border-white/20 animate-ping opacity-30"></div>
                        <div className="absolute -inset-1 rounded-[1.8rem] border border-indigo-500/50 animate-pulse"></div>
                    </div>
                </div>

                {/* Text Content */}
                <div className="space-y-3 text-center w-full">
                    <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest animate-pulse">
                        {messages[currentIndex]}
                    </h3>

                    {/* Bouncing Dots */}
                    <div className="flex justify-center gap-1.5 h-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProgressLoader;
