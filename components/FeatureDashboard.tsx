import React from 'react';
import { BoardSource } from '../types';

interface FeatureDashboardProps {
  onSelectFeature: (feature: BoardSource) => void;
  onUploadClick: () => void;
}

const FeatureDashboard: React.FC<FeatureDashboardProps> = ({ onSelectFeature, onUploadClick }) => {
  return (
    <div className="w-full max-w-4xl mx-auto py-3 md:py-6 px-5 flex flex-col items-center justify-center space-y-6 md:space-y-10 animate-in fade-in zoom-in duration-700">
      {/* Header Section */}
      <div className="text-center space-y-1.5">
        <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 tracking-tight">
          Feature Overview Dashboard
        </h1>
        <p className="text-slate-400 text-sm md:text-base max-w-xl mx-auto font-medium opacity-80">
          Choose a tool below to start your interactive learning session. Your AI tutor is ready to help you excel!
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full relative">
        {/* Decorative connecting lines (hidden on mobile) */}
        <svg className="hidden md:block absolute inset-0 w-full h-full pointer-events-none opacity-10" preserveAspectRatio="none" viewBox="0 0 100 100">
          <path 
            d="M 20 50 Q 50 10 80 50" 
            fill="none" 
            stroke="url(#grad1)" 
            strokeWidth="1.2" 
            strokeDasharray="5 2.5"
            className="animate-pulse"
          />
          <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: '#60a5fa', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: '#c084fc', stopOpacity: 1 }} />
            </linearGradient>
          </defs>
        </svg>

        {/* 1. Whiteboard Tool */}
        <button 
          onClick={() => onSelectFeature('board')}
          className="group relative bg-slate-900/60 backdrop-blur-2xl border border-slate-700/50 rounded-2xl p-5 text-left transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1 hover:border-blue-500/50 hover:shadow-[0_16px_32px_-12px_rgba(59,130,246,0.2)] overflow-hidden"
        >
          <div className="absolute -top-3 -right-3 p-3 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity rotate-12">
             <svg className="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
             </svg>
          </div>
          
          <div className="relative z-10 space-y-3.5">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-white group-hover:rotate-6 transition-all duration-300 shadow-inner">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
               </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1.5 group-hover:text-blue-400 transition-colors">Ask & Collaborate</h3>
              <p className="text-slate-400 text-[10px] leading-relaxed opacity-90">
                Use our full toolset for dynamic Q&A and collaboration. Draw, write, and solve problems in real-time.
              </p>
            </div>
            <div className="flex items-center text-blue-400 text-[10px] font-bold group-hover:translate-x-1 transition-transform pt-1.5">
              Open Whiteboard <svg className="ml-1.5 w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </div>
          </div>
        </button>

        {/* 2. PDF Upload Tool */}
        <button 
          onClick={onUploadClick}
          className="group relative bg-slate-900/60 backdrop-blur-2xl border border-slate-700/50 rounded-2xl p-5 text-left transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1 hover:border-purple-500/50 hover:shadow-[0_16px_32px_-12px_rgba(168,85,247,0.2)] overflow-hidden"
        >
          <div className="absolute -top-3 -right-3 p-3 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity rotate-12">
             <svg className="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
             </svg>
          </div>
          
          <div className="relative z-10 space-y-3.5">
            <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-400 group-hover:bg-purple-500 group-hover:text-white group-hover:-rotate-6 transition-all duration-300 shadow-inner">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
               </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1.5 group-hover:text-purple-400 transition-colors">Solve Homework</h3>
              <p className="text-slate-400 text-[10px] leading-relaxed opacity-90">
                Seamlessly upload, review, and solve quizzes together. Perfect for PDF assignments and visual resources.
              </p>
            </div>
            <div className="flex items-center text-purple-400 text-[10px] font-bold group-hover:translate-x-1 transition-transform pt-1.5">
              Upload PDF <svg className="ml-1.5 w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </div>
          </div>
        </button>

        {/* 3. Screen Share Tool */}
        <button 
          onClick={() => onSelectFeature('screen')}
          className="group relative bg-slate-900/60 backdrop-blur-2xl border border-slate-700/50 rounded-2xl p-5 text-left transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1 hover:border-emerald-500/50 hover:shadow-[0_16px_32px_-12px_rgba(16,185,129,0.2)] overflow-hidden"
        >
          <div className="absolute -top-3 -right-3 p-3 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity rotate-12">
             <svg className="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
             </svg>
          </div>
          
          <div className="relative z-10 space-y-3.5">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white group-hover:rotate-6 transition-all duration-300 shadow-inner">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
               </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1.5 group-hover:text-emerald-400 transition-colors">Screen Share</h3>
              <p className="text-slate-400 text-[10px] leading-relaxed opacity-90">
                Instantly share your screen for deep-dive technical support on any website, application, or code problem.
              </p>
            </div>
            <div className="flex items-center text-emerald-400 text-[10px] font-bold group-hover:translate-x-1 transition-transform pt-1.5">
              Start Sharing <svg className="ml-1.5 w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </div>
          </div>
        </button>
      </div>

      {/* Footer Text */}
      <div className="text-center">
        <div className="inline-flex items-center px-4 py-1.5 bg-slate-800/50 rounded-full border border-slate-700/50 backdrop-blur shadow-sm animate-bounce-slow">
           <svg className="w-3.5 h-3.5 text-blue-400 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
           <p className="text-slate-400 text-[9px] md:text-[10px] font-bold uppercase tracking-widest">
             Try these support buttons during your session!
           </p>
        </div>
      </div>
    </div>
  );
};

export default FeatureDashboard;
