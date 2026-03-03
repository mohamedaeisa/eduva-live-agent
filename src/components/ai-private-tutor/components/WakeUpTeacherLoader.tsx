import React, { useEffect, useState } from 'react';

interface WakeUpTeacherLoaderProps {
    imageUrl: string;
}

export const WakeUpTeacherLoader: React.FC<WakeUpTeacherLoaderProps> = ({ imageUrl }) => {
    const [dots, setDots] = useState('');

    // Animated dots for the "Waking up" text
    useEffect(() => {
        const interval = setInterval(() => {
            setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
        }, 500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            {/* Backdrop blur effect */}
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-md animate-fade-in" />

            {/* Modal Container */}
            <div className="relative bg-white/10 backdrop-blur-xl border border-white/20 rounded-[32px] shadow-2xl overflow-hidden max-w-[360px] w-full p-6 flex flex-col items-center animate-scale-in">

                {/* Glowing Background Accent */}
                <div className="absolute -top-16 -left-16 w-32 h-32 bg-blue-500/15 rounded-full blur-[60px]" />
                <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-purple-500/15 rounded-full blur-[60px]" />

                {/* 3D Illustration Container */}
                <div className="relative w-full aspect-square mb-6 rounded-2xl overflow-hidden shadow-inner border border-white/10">
                    <img
                        src={imageUrl}
                        alt="Teacher Sleeping"
                        className="w-full h-full object-cover"
                    />
                    {/* Gentle Overlay Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                </div>

                {/* Text Area */}
                <div className="text-center space-y-2 relative z-10">
                    <h3 className="text-xl font-bold text-white tracking-tight">
                        Teacher is currently resting
                    </h3>
                    <div className="flex items-center justify-center space-x-1.5">
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
                        <p className="text-blue-300 font-medium text-base ml-1.5">
                            Wait, I am waking up your teacher{dots}
                        </p>
                    </div>
                </div>

                {/* Progress Bar (Subtle) */}
                <div className="w-32 h-1 bg-white/10 rounded-full mt-6 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full animate-shimmer w-full" />
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 1.5s infinite linear;
        }
        @keyframes scale-in {
          0% { transform: scale(0.9); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}} />
        </div>
    );
};
